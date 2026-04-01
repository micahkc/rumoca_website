# Rumoca Website

The official website for [Rumoca](https://github.com/CogniPilot/rumoca), an open-source Modelica compiler written in Rust. The site is a pure frontend static application -- no backend server required.

## What's on the site

- **Home** -- overview of Rumoca's capabilities and compiler pipeline
- **Tutorials** -- 27 interactive tutorials covering ODE modeling, 3D visualization, control systems, optimization, and code generation workflows. Each tutorial runs the Rumoca compiler in your browser via WebAssembly.
- **Simulation** -- real-time flight simulation page where you can fly aircraft in 3D environments using keyboard or gamepad input. Supports two modes:
  - **WASM Controller** -- physics and controller run entirely in the browser (no external dependencies)
  - **Autopilot (SIL)** -- browser runs the plant physics, connected to a real autopilot binary (e.g. Cerebri2) through a WebSocket-to-UDP proxy
- **Playground** -- browser-based Modelica editor with compilation, simulation, and code generation

### Simulation page features

- Three environments: Desert, Forest, Arctic
- Two aircraft: Quadrotor (high-fidelity 3D model) and Fixed Wing (Sport Cub with animated control surfaces)
- Gamepad support (auto-detected, takes priority over keyboard)
- Keyboard controls: WASD for pitch/roll, arrows for throttle/yaw, Space to arm, R to reset

## Development

Requires Node.js >= 22.12.0.

```bash
npm install
npm run dev       # dev server at localhost:4321
npm run build     # static build to dist/
```

### WASM dependencies

The site uses two WASM modules in `public/wasm/`:

- `rumoca.js` / `rumoca_bg.wasm` -- the Rumoca compiler (for tutorials and playground)
- `rumoca_bind_wasm.js` / `rumoca_bind_wasm_bg.wasm` -- includes `WasmStepper` for real-time simulation

Run `npm run sync-wasm` to sync from a local Rumoca build.

## Autopilot (SIL) mode

The simulation page can connect to a locally-running autopilot via a WebSocket-to-UDP proxy. This lets you fly with a real flight controller (like CogniPilot's Cerebri2) while the plant physics run in the browser.

### Architecture

```
Browser (WASM plant)  <--WebSocket-->  Proxy  <--UDP/FlatBuffers-->  Autopilot
```

The proxy translates between JSON (WebSocket) and FlatBuffers (UDP) using a `sil_config.toml` file. The proxy is included in this repo at `rumoca_ws_proxy/`.

### Running it

1. Start the autopilot (e.g. Cerebri2 native_sim)

2. Start the WebSocket-to-UDP proxy:
   ```bash
   cd rumoca_ws_proxy
   ./run.sh /path/to/your/sil_config.toml
   ```

3. Open the simulation page in your browser and select "Autopilot (SIL)" in the config panel

### Controls

| Key / Button | Action |
|---|---|
| Up / Down arrows | Throttle up / down |
| Left / Right arrows | Yaw |
| W / S | Pitch forward / back |
| A / D | Roll left / right |
| Space | Arm / Disarm |
| R | Reset simulation |
| Gamepad Start | Arm / Disarm |
| Gamepad A | Reset |
| Gamepad B | Zero sticks |

## Tech stack

- [Astro](https://astro.build/) -- static site generator
- [React](https://react.dev/) -- interactive components
- [Three.js](https://threejs.org/) -- 3D visualization
- [uPlot](https://github.com/leeoniya/uPlot) -- plotting
- [Tailwind CSS](https://tailwindcss.com/) -- styling
- WebAssembly -- Rumoca compiler and real-time simulation in the browser
