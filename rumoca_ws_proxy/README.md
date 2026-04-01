# rumoca-ws-proxy

A WebSocket-to-UDP proxy that connects the Rumoca website's browser-based simulation to a locally-running autopilot (e.g. CogniPilot Cerebri2).

## What it does

Web browsers cannot send UDP packets. The autopilot communicates over UDP using FlatBuffers. This proxy sits in the middle and translates:

```
Browser (JSON over WebSocket)  <-->  Proxy  <-->  Autopilot (FlatBuffers over UDP)
```

- Receives sensor data (gyro, accel, mag, RC channels) from the browser as JSON
- Packs it into FlatBuffers and sends it to the autopilot via UDP
- Receives motor commands from the autopilot as FlatBuffers via UDP
- Unpacks them to JSON and sends them back to the browser

The proxy uses the same `sil_config.toml` as `rumoca_sil` for FlatBuffer schema paths, field routing, and UDP port configuration. No code changes are needed to work with different autopilots -- just change the config.

## Quick start

```bash
./run.sh /path/to/your/sil_config.toml
```

Or directly:

```bash
cargo run --release -- /path/to/your/sil_config.toml
```

## Full SIL setup

You need three things running:

1. **Autopilot** -- e.g. Cerebri2 native_sim
2. **This proxy** -- `./run.sh`
3. **Rumoca website** -- open the simulation page, select "Autopilot (SIL)" mode

## Config file

The proxy reads the same `sil_config.toml` format as `rumoca_sil`:

```toml
[sim]
dt = 0.004
realtime = true

[udp]
listen = "0.0.0.0:4244"     # receive motor commands from autopilot
send = "127.0.0.1:4242"     # send sensor data to autopilot

[schema]
bfbs = [
    "path/to/cerebri2_topics.bfbs",
    "path/to/cerebri2_sil.bfbs",
]

[receive]
root_type = "cerebri2.topic.MotorOutput"
[receive.route]
"motors.m0" = { var = "omega_m1", scale = 1100.0 }
# ...

[send]
root_type = "cerebri2.sil.SimInput"
[send.route]
"gyro.x" = { var = "gyro_x" }
# ...
```

The schema paths point to `.bfbs` (binary FlatBuffer schema) files. The routing maps FlatBuffer field paths to variable names. Change these to work with any FlatBuffer-based autopilot.

## Ports

| Port | Protocol | Direction |
|---|---|---|
| 8081 | WebSocket | Browser <--> Proxy |
| 4244 | UDP | Autopilot --> Proxy (motor commands) |
| 4242 | UDP | Proxy --> Autopilot (sensor data) |

Note: do not run this proxy and `rumoca_sil` at the same time -- they use the same ports.

## Building

```bash
cargo build --release
```

The proxy is fully standalone -- no external Rust dependencies beyond standard crates. The FlatBuffer schema parsing and codec are bundled directly in the crate.

The only external requirement is the `.bfbs` schema files referenced in your config (these come from your autopilot's build, e.g. Cerebri2's `build-native_sim/generated/flatbuffers/`).
