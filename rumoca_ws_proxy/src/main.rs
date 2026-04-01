//! WebSocket-to-UDP proxy for browser-based SIL simulation.
//!
//! Architecture:
//!   Browser (WASM plant) <--WebSocket--> This proxy <--UDP/FlatBuffers--> Autopilot
//!
//! The proxy reads the same `sil_config.toml` as rumoca_sil for schema paths,
//! field routing, and UDP port configuration.
//!
//! WebSocket protocol (JSON):
//!   Browser -> Proxy: { "type": "sensors", "gyro_x": ..., "rc_0": 1500, ... }
//!   Proxy -> Browser: { "type": "motors", "omega_m1": 759.5, ..., "armed": true }

mod bfbs;
mod codec;
mod config;

use anyhow::{Context, Result};
use bfbs::SchemaSet;
use codec::{PackCodec, UnpackCodec};
use config::SilConfig;
use std::collections::HashMap;
use std::env;
use std::net::UdpSocket;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tungstenite::accept;
use tungstenite::Message;

const WS_PORT: u16 = 8081;

fn main() -> Result<()> {
    let config_path = env::args().nth(1).unwrap_or_else(|| "sil_config.toml".into());
    let config = SilConfig::load(Path::new(&config_path))
        .with_context(|| format!("Failed to load config: {}", config_path))?;

    println!("rumoca-ws-proxy v0.1.0");
    println!("  Config: {}", config_path);

    // Load FlatBuffer schemas
    let schema_set = {
        let mut ss = SchemaSet::new();
        for path_str in &config.schema.bfbs {
            ss.load_bfbs(Path::new(path_str))
                .with_context(|| format!("Load schema: {}", path_str))?;
            println!("  Schema: {}", path_str);
        }
        ss
    };

    // Build codecs from config routing
    let pack_codec =
        PackCodec::compile(&schema_set, &config.send).context("Build pack codec (send)")?;
    let unpack_codec = UnpackCodec::compile(&schema_set, &config.receive)
        .context("Build unpack codec (receive)")?;

    // UDP socket
    let udp_config = config.udp.as_ref().context("No [udp] section in config")?;
    let udp = UdpSocket::bind(&udp_config.listen)
        .with_context(|| format!("Bind UDP {}", udp_config.listen))?;
    udp.set_nonblocking(true)?;
    let udp_send_addr = udp_config.send.clone();
    println!("  UDP listen: {}", udp_config.listen);
    println!("  UDP send:   {}", udp_send_addr);

    // Shared state between threads
    let latest_motors: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let latest_sensors: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let running = Arc::new(AtomicBool::new(true));

    // Thread 1: UDP receive (motor commands from autopilot) -> unpack -> JSON for browser
    let motors_writer = Arc::clone(&latest_motors);
    let running_udp = Arc::clone(&running);
    let udp_recv = udp.try_clone()?;
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while running_udp.load(Ordering::Relaxed) {
            match udp_recv.recv_from(&mut buf) {
                Ok((n, addr)) => {
                    eprintln!("[UDP recv] {} bytes from {}", n, addr);
                    let values = unpack_codec.unpack(&buf[..n]);
                    eprintln!("[UDP recv] unpacked {} fields: {:?}", values.len(), values.keys().collect::<Vec<_>>());
                    let mut json_map: HashMap<String, serde_json::Value> = HashMap::new();
                    json_map.insert(
                        "type".into(),
                        serde_json::Value::String("motors".into()),
                    );
                    for (name, val) in &values {
                        json_map.insert(name.clone(), serde_json::Value::from(*val));
                    }
                    if let Ok(json) = serde_json::to_string(&json_map) {
                        eprintln!("[UDP->WS] {}", &json[..json.len().min(120)]);
                        *motors_writer.lock().unwrap() = Some(json);
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(1));
                }
                Err(e) => {
                    eprintln!("UDP recv error: {}", e);
                    thread::sleep(Duration::from_millis(10));
                }
            }
        }
    });

    // Thread 2: Pack sensor JSON from browser -> FlatBuffer -> UDP send to autopilot
    let sensors_reader = Arc::clone(&latest_sensors);
    let running_pack = Arc::clone(&running);
    let udp_send = udp.try_clone()?;
    thread::spawn(move || {
        while running_pack.load(Ordering::Relaxed) {
            let json_opt = { sensors_reader.lock().unwrap().take() };
            if let Some(json_str) = json_opt {
                eprintln!("[WS recv] {}", &json_str[..json_str.len().min(120)]);
                if let Ok(values) = serde_json::from_str::<HashMap<String, serde_json::Value>>(
                    &json_str,
                ) {
                    // Convert JSON values to f64 map for the codec
                    let mut float_map: HashMap<String, f64> = HashMap::new();
                    for (k, v) in &values {
                        if k == "type" {
                            continue;
                        }
                        if let Some(f) = v.as_f64() {
                            float_map.insert(k.clone(), f);
                        } else if let Some(b) = v.as_bool() {
                            float_map.insert(k.clone(), if b { 1.0 } else { 0.0 });
                        }
                    }
                    eprintln!("[WS->UDP] packing {} fields, sending to {}", float_map.len(), udp_send_addr);
                    let buf = pack_codec.pack(&float_map);
                    if let Err(e) = udp_send.send_to(&buf, &udp_send_addr) {
                        eprintln!("UDP send error: {}", e);
                    }
                }
            } else {
                thread::sleep(Duration::from_millis(1));
            }
        }
    });

    // Main thread: WebSocket server
    let ws_listener = std::net::TcpListener::bind(format!("0.0.0.0:{}", WS_PORT))
        .with_context(|| format!("Bind WebSocket port {}", WS_PORT))?;
    println!("  WebSocket: ws://0.0.0.0:{}", WS_PORT);
    println!("Ready. Waiting for browser connection...");

    for stream in ws_listener.incoming() {
        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("TCP accept error: {}", e);
                continue;
            }
        };

        let motors_reader = Arc::clone(&latest_motors);
        let sensors_writer = Arc::clone(&latest_sensors);
        let running_ws = Arc::clone(&running);

        thread::spawn(move || {
            let mut ws = match accept(stream) {
                Ok(ws) => ws,
                Err(e) => {
                    eprintln!("WebSocket handshake error: {}", e);
                    return;
                }
            };
            println!("Browser connected");

            while running_ws.load(Ordering::Relaxed) {
                // Read sensor data from browser
                match ws.read() {
                    Ok(Message::Text(text)) => {
                        eprintln!("[WS read] got {} bytes", text.len());
                        *sensors_writer.lock().unwrap() = Some(text.to_string());
                    }
                    Ok(Message::Close(_)) => {
                        println!("Browser disconnected");
                        break;
                    }
                    Ok(_) => {} // ignore binary/ping/pong
                    Err(tungstenite::Error::ConnectionClosed) => {
                        println!("Browser disconnected");
                        break;
                    }
                    Err(e) => {
                        eprintln!("WebSocket read error: {}", e);
                        break;
                    }
                }

                // Send latest motor commands to browser
                if let Some(json) = motors_reader.lock().unwrap().take() {
                    if ws.send(Message::Text(json.into())).is_err() {
                        break;
                    }
                }
            }
        });
    }

    running.store(false, Ordering::Relaxed);
    Ok(())
}
