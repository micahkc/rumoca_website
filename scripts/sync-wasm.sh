#!/usr/bin/env bash
# Sync rumoca artifacts into the website for local development and builds.
#
# Sources (all under $RUMOCA_DIR):
#   pkg/                          WASM blob + JS bindings + workers
#   editors/wasm/                 coi-serviceworker.js, rumoca.png
#   examples/interactive/         drone.glb, sand_pbr/, skybox/, sim .mo sources
#   target/cmm/CMM-v0.0.1/        LieGroup + RigidBody Modelica packages
#
# Resolution order for RUMOCA_DIR:
#   1. $RUMOCA_DIR              (preferred override)
#   2. $RUMOCA_WASM_DIR         (legacy: may point at editors/wasm subdir)
#   3. ../development/rumoca/rumoca  (default sibling checkout)
#
# Strict mode (exit 1 on missing required files) is on by default in CI
# (GitHub Actions sets CI=true). Set SYNC_STRICT=true to force it locally,
# or SYNC_STRICT=false to disable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DEFAULT_RUMOCA="$(cd "$PROJECT_DIR/../development/rumoca/rumoca" 2>/dev/null && pwd || echo "")"
RUMOCA_DIR="${RUMOCA_DIR:-${RUMOCA_WASM_DIR:-$DEFAULT_RUMOCA}}"

# Back-compat: legacy RUMOCA_WASM_DIR pointed at editors/wasm directly.
case "$RUMOCA_DIR" in
    */editors/wasm) RUMOCA_DIR="${RUMOCA_DIR%/editors/wasm}" ;;
esac

# `cargo xtask wasm build` writes artifacts to pkg/release-full-web/. Older
# layouts dropped them straight under pkg/. Pick the freshest one that exists.
if [ -d "$RUMOCA_DIR/pkg/release-full-web" ]; then
    PKG_DIR="$RUMOCA_DIR/pkg/release-full-web"
elif [ -d "$RUMOCA_DIR/pkg/release-full-web-rayon" ]; then
    PKG_DIR="$RUMOCA_DIR/pkg/release-full-web-rayon"
else
    PKG_DIR="$RUMOCA_DIR/pkg"
fi
EDITORS_DIR="$RUMOCA_DIR/editors/wasm"
QUADROTOR_DIR="$RUMOCA_DIR/examples/interactive/quadrotor"
FIXEDWING_DIR="$RUMOCA_DIR/examples/interactive/fixedwing"
ROVER_DIR="$RUMOCA_DIR/examples/interactive/rover"
CMM_DIR="$RUMOCA_DIR/target/cmm/CMM-v0.0.1"

STRICT="${SYNC_STRICT:-${CI:-false}}"

missing_dirs=()
[ -d "$PKG_DIR" ] || missing_dirs+=("$PKG_DIR")
[ -d "$EDITORS_DIR" ] || missing_dirs+=("$EDITORS_DIR")

if [ "${#missing_dirs[@]}" -gt 0 ]; then
    echo "⚠ rumoca source not found:"
    printf '    %s\n' "${missing_dirs[@]}"
    echo "  Set RUMOCA_DIR to the root of a rumoca checkout (or extracted release tarball)."
    if [ "$STRICT" = "true" ]; then
        echo "✗ Strict mode (CI=true or SYNC_STRICT=true): aborting"
        exit 1
    fi
    echo "  Skipping sync (using existing files if present)"
    exit 0
fi

# --- WASM + service worker -------------------------------------------------

PKG_FILES=(rumoca_bind_wasm_bg.wasm rumoca_bind_wasm.js rumoca_worker.js parse_worker.js)
EDITORS_FILES=(coi-serviceworker.js)
IMAGE_FILES=(rumoca.png)

mkdir -p "$PROJECT_DIR/public/wasm" "$PROJECT_DIR/public/images"

errors=0

for f in "${PKG_FILES[@]}"; do
    if [ -f "$PKG_DIR/$f" ]; then
        cp "$PKG_DIR/$f" "$PROJECT_DIR/public/wasm/$f"
        echo "  ✓ pkg/$f → public/wasm/"
    else
        echo "  ✗ missing required: pkg/$f"
        errors=$((errors+1))
    fi
done

for f in "${EDITORS_FILES[@]}"; do
    if [ -f "$EDITORS_DIR/$f" ]; then
        cp "$EDITORS_DIR/$f" "$PROJECT_DIR/public/$f"
        echo "  ✓ editors/wasm/$f → public/"
    else
        echo "  ✗ missing required: editors/wasm/$f"
        errors=$((errors+1))
    fi
done

for f in "${IMAGE_FILES[@]}"; do
    if [ -f "$EDITORS_DIR/$f" ]; then
        cp "$EDITORS_DIR/$f" "$PROJECT_DIR/public/images/$f"
        echo "  ✓ editors/wasm/$f → public/images/"
    fi
done

# --- Interactive sim assets (quadrotor + rover) ----------------------------

mkdir -p "$PROJECT_DIR/public/models" \
         "$PROJECT_DIR/public/textures/sand_pbr" \
         "$PROJECT_DIR/public/textures/skybox"

sync_required_file() {
    local src=$1 dst=$2 label=$3
    if [ -f "$src" ]; then
        cp "$src" "$dst"
        echo "  ✓ $label"
    else
        echo "  ✗ missing required: $src"
        errors=$((errors+1))
    fi
}

sync_required_file "$QUADROTOR_DIR/drone.glb" "$PROJECT_DIR/public/models/drone.glb" \
    "quadrotor/drone.glb → public/models/"

sync_required_file "$FIXEDWING_DIR/airplane.glb" "$PROJECT_DIR/public/models/airplane.glb" \
    "fixedwing/airplane.glb → public/models/"

if [ -d "$QUADROTOR_DIR/sand_pbr" ]; then
    cp "$QUADROTOR_DIR"/sand_pbr/*.jpg "$PROJECT_DIR/public/textures/sand_pbr/" 2>/dev/null || true
    echo "  ✓ quadrotor/sand_pbr/*.jpg → public/textures/sand_pbr/"
else
    echo "  ✗ missing required: $QUADROTOR_DIR/sand_pbr"
    errors=$((errors+1))
fi

if [ -d "$QUADROTOR_DIR/skybox" ]; then
    cp "$QUADROTOR_DIR"/skybox/*.jpg "$PROJECT_DIR/public/textures/skybox/" 2>/dev/null || true
    echo "  ✓ quadrotor/skybox/*.jpg → public/textures/skybox/"
else
    echo "  ✗ missing required: $QUADROTOR_DIR/skybox"
    errors=$((errors+1))
fi

# --- Modelica source generation (TS string consts) -------------------------

# WasmStepper only accepts a single source string, so for QuadrotorAcro we
# concatenate the CMM LieGroup + RigidBody packages with QuadrotorSIL.mo into
# one source. Order matters: LieGroup before RigidBody before QuadrotorSIL.

CMM_LIEGROUP="$CMM_DIR/LieGroup/package.mo"
CMM_RIGIDBODY="$CMM_DIR/RigidBody/package.mo"
QUADROTOR_SIL="$QUADROTOR_DIR/QuadrotorSIL.mo"
FIXEDWING_SIL="$FIXEDWING_DIR/FixedWingSIL.mo"
ROVER_MO="$ROVER_DIR/Rover.mo"

quadrotor_acro_ts="$PROJECT_DIR/src/data/aircraft/quadrotor-acro-model.ts"
fixedwing_ts="$PROJECT_DIR/src/data/aircraft/fixedwing-controller-model.ts"
rover_ts="$PROJECT_DIR/src/data/aircraft/rover-model.ts"

if [ -f "$CMM_LIEGROUP" ] && [ -f "$CMM_RIGIDBODY" ] && [ -f "$QUADROTOR_SIL" ]; then
    {
        echo "// AUTO-GENERATED by scripts/sync-wasm.sh — DO NOT EDIT BY HAND."
        echo "// Sources concatenated for single-string WasmStepper consumption:"
        echo "//   target/cmm/CMM-v0.0.1/LieGroup/package.mo"
        echo "//   target/cmm/CMM-v0.0.1/RigidBody/package.mo"
        echo "//   examples/interactive/quadrotor/QuadrotorSIL.mo"
        echo ""
        echo "export const QUADROTOR_ACRO_MODEL_NAME = 'QuadrotorAcro';"
        echo ""
        echo "export const QUADROTOR_ACRO_MODEL = String.raw\`"
        # Escape backticks if any (defensive — current sources have none)
        sed 's/`/\\`/g' "$CMM_LIEGROUP"
        echo ""
        sed 's/`/\\`/g' "$CMM_RIGIDBODY"
        echo ""
        sed 's/`/\\`/g' "$QUADROTOR_SIL"
        echo "\`;"
    } > "$quadrotor_acro_ts"
    echo "  ✓ concatenated → src/data/aircraft/quadrotor-acro-model.ts"
else
    echo "  ✗ missing one of: LieGroup, RigidBody, QuadrotorSIL"
    errors=$((errors+1))
fi

# FixedWing is closed-loop (plant + FBW controller) on the same CMM RigidBody /
# LieGroup packages as the quadrotor — concatenate them with FixedWingSIL.mo.
# Order matters: LieGroup before RigidBody before FixedWingSIL.
if [ -f "$CMM_LIEGROUP" ] && [ -f "$CMM_RIGIDBODY" ] && [ -f "$FIXEDWING_SIL" ]; then
    {
        echo "// AUTO-GENERATED by scripts/sync-wasm.sh — DO NOT EDIT BY HAND."
        echo "// Sources concatenated for single-string WasmStepper consumption:"
        echo "//   target/cmm/CMM-v0.0.1/LieGroup/package.mo"
        echo "//   target/cmm/CMM-v0.0.1/RigidBody/package.mo"
        echo "//   examples/interactive/fixedwing/FixedWingSIL.mo"
        echo ""
        echo "export const FIXEDWING_MODEL_NAME = 'FixedWing';"
        echo ""
        echo "export const FIXEDWING_CONTROLLER_MODEL = String.raw\`"
        sed 's/`/\\`/g' "$CMM_LIEGROUP"
        echo ""
        sed 's/`/\\`/g' "$CMM_RIGIDBODY"
        echo ""
        sed 's/`/\\`/g' "$FIXEDWING_SIL"
        echo "\`;"
    } > "$fixedwing_ts"
    echo "  ✓ concatenated → src/data/aircraft/fixedwing-controller-model.ts"
else
    echo "  ✗ missing one of: LieGroup, RigidBody, FixedWingSIL"
    errors=$((errors+1))
fi

if [ -f "$ROVER_MO" ]; then
    {
        echo "// AUTO-GENERATED by scripts/sync-wasm.sh — DO NOT EDIT BY HAND."
        echo "// Source: examples/interactive/rover/Rover.mo"
        echo ""
        echo "export const ROVER_MODEL_NAME = 'Rover';"
        echo ""
        echo "export const ROVER_MODEL = String.raw\`"
        sed 's/`/\\`/g' "$ROVER_MO"
        echo "\`;"
    } > "$rover_ts"
    echo "  ✓ Rover.mo → src/data/aircraft/rover-model.ts"
else
    echo "  ✗ missing required: $ROVER_MO"
    errors=$((errors+1))
fi

# --- Docs (markdown source for Astro content collections) ------------------
#
# Copy markdown sources from rumoca's docs/{user,dev}-guide/src/ into our
# src/content/ collections. Astro renders these natively at build time —
# no mdbook needed, no theme mismatch, full integration with site styling.

sync_docs_collection() {
    local src=$1 dst=$2 name=$3
    if [ ! -d "$src" ]; then
        echo "  ⚠ $name source missing: $src (skip)"
        return
    fi
    rm -rf "$dst"
    mkdir -p "$dst"
    # Preserve directory structure; only .md files.
    (cd "$src" && find . -name '*.md' -print0 | tar --null -cf - --files-from -) | \
        (cd "$dst" && tar -xf -)
    local count
    count=$(find "$dst" -name '*.md' | wc -l)
    echo "  ✓ $name → ${dst#$PROJECT_DIR/} ($count file(s))"
}

sync_docs_collection "$RUMOCA_DIR/docs/user-guide/src" "$PROJECT_DIR/src/content/user-guide" "user-guide markdown"
sync_docs_collection "$RUMOCA_DIR/docs/dev-guide/src"  "$PROJECT_DIR/src/content/dev-guide"  "dev-guide markdown"

# --- Playground (Monaco-based Modelica editor) -----------------------------
#
# Mirror editors/wasm/ → public/playground/ minus the dev-only node_modules
# and tests. The playground's index.html lets us override the WASM location
# via window.rumocaWasmPkgBase / Subdir; we sed it to point at our existing
# /wasm/ directory so the WASM doesn't get duplicated.

PLAYGROUND_SRC="$RUMOCA_DIR/editors/wasm"
# Land under /playground/app/ so the wrapper Astro page can own /playground.
PLAYGROUND_DST="$PROJECT_DIR/public/playground/app"

if [ -d "$PLAYGROUND_SRC" ]; then
    rm -rf "$PLAYGROUND_DST"
    mkdir -p "$PLAYGROUND_DST"
    (
        cd "$PLAYGROUND_SRC" && find . -type f \
            ! -path './node_modules/*' \
            ! -path './tests/*' \
            ! -name 'package-lock.json' \
            ! -name 'package.json' \
            -print0 | tar --null -cf - --files-from -
    ) | (cd "$PLAYGROUND_DST" && tar -xf -)
    # Point WASM lookup at /wasm/ instead of the bundled ./pkg/release-full-web/.
    if [ -f "$PLAYGROUND_DST/index.html" ]; then
        sed -i \
            -e "s|window.rumocaWasmPkgBase = '../../pkg';|window.rumocaWasmPkgBase = '';|" \
            -e "s|window.rumocaWasmPkgSubdir = 'release-full-web';|window.rumocaWasmPkgSubdir = 'wasm';|" \
            "$PLAYGROUND_DST/index.html"
    fi
    count=$(find "$PLAYGROUND_DST" -type f | wc -l)
    echo "  ✓ playground → public/playground ($count file(s), WASM paths → /wasm/)"
else
    echo "  ⚠ playground source missing: $PLAYGROUND_SRC (skip)"
fi

# ---------------------------------------------------------------------------

if [ "$errors" -gt 0 ]; then
    echo "✗ Sync incomplete ($errors required file(s) missing)"
    exit 1
fi

echo "✓ rumoca sync complete (source: $RUMOCA_DIR)"
