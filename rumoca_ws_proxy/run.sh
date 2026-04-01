#!/bin/bash
# Launch the WebSocket-to-UDP proxy for browser-based SIL
# Usage: ./run.sh [path/to/sil_config.toml]
cd "$(dirname "$0")"
CONFIG="${1:-sil_config.toml}"
cargo run --release -- "$CONFIG"
