#!/usr/bin/env bash
# Sync WASM artifacts from the rumoca repo's editors/wasm/ directory.
# These three files are tightly coupled and must always come from the same build.
#
# Override the source directory by setting RUMOCA_WASM_DIR:
#   RUMOCA_WASM_DIR=/path/to/editors/wasm npm run sync-wasm

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Default source: sibling checkout at ../development/rumoca/rumoca/editors/wasm
DEFAULT_SRC="$(cd "$PROJECT_DIR/../development/rumoca/rumoca/editors/wasm" 2>/dev/null && pwd || echo "")"
WASM_SRC="${RUMOCA_WASM_DIR:-$DEFAULT_SRC}"

if [ -z "$WASM_SRC" ] || [ ! -d "$WASM_SRC" ]; then
    echo "⚠ WASM source directory not found: $WASM_SRC"
    echo "  Set RUMOCA_WASM_DIR to the path containing rumoca_bg.wasm"
    echo "  Skipping sync (using existing files if present)"
    exit 0
fi

# Files to sync (these change with every rumoca build)
WASM_FILES=(rumoca_bg.wasm rumoca.js rumoca_worker.js)
STABLE_FILES=(coi-serviceworker.js)
IMAGE_FILES=(rumoca.svg)

mkdir -p "$PROJECT_DIR/public/wasm" "$PROJECT_DIR/public/images"

for f in "${WASM_FILES[@]}"; do
    if [ -f "$WASM_SRC/$f" ]; then
        cp "$WASM_SRC/$f" "$PROJECT_DIR/public/wasm/$f"
        echo "  ✓ synced $f"
    else
        echo "  ✗ missing $WASM_SRC/$f"
    fi
done

for f in "${STABLE_FILES[@]}"; do
    if [ -f "$WASM_SRC/$f" ]; then
        cp "$WASM_SRC/$f" "$PROJECT_DIR/public/$f"
        echo "  ✓ synced $f"
    fi
done

for f in "${IMAGE_FILES[@]}"; do
    if [ -f "$WASM_SRC/$f" ]; then
        cp "$WASM_SRC/$f" "$PROJECT_DIR/public/images/$f"
        echo "  ✓ synced $f"
    fi
done

echo "✓ WASM sync complete (source: $WASM_SRC)"
