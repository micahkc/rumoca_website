# Rumoca → Website Release Integration

How a new `CogniPilot/rumoca` release ends up live at `rumoca.cognipilot.org`.

## High-level flow

```
┌───────────────────────────────────────────┐
│  CogniPilot/rumoca                        │
│                                            │
│  1. Maintainer cuts a release (git tag)   │
│  2. GitHub Actions runs publish-web.yml:  │
│     - cargo xtask wasm build               │
│       (--features full-web,stepper-diffsol)│
│     - assemble tarball with pkg/ +         │
│       editors/wasm/ + docs/*/src/          │
│     - upload tarball as release asset      │
│       "rumoca-web-<tag>.tar.gz"            │
│     - POST repository_dispatch             │
│       to CogniPilot/rumoca_website         │
│       (event_type=rumoca-released)         │
└───────────────────┬───────────────────────┘
                    │
                    │  repository_dispatch payload {tag}
                    ▼
┌───────────────────────────────────────────┐
│  CogniPilot/rumoca_website                │
│                                            │
│  3. .github/workflows/deploy.yml fires    │
│     on receipt of "rumoca-released":      │
│     - gh release download (tarball)        │
│     - extract pkg/* → public/wasm/         │
│     - extract editors/wasm/* →             │
│       public/playground/app/               │
│       (with WASM-path sed rewrite)         │
│     - extract docs/*/src/*.md →            │
│       src/content/{user,dev}-guide/        │
│     - npm ci && npm run build              │
│     - upload-pages-artifact + deploy-pages │
└───────────────────────────────────────────┘
```

The whole loop is automatic once the rumoca-side workflow is in place. Site
maintainers don't push anything to this repo on a rumoca release.

---

## Status: what's in place vs. still missing

### Website side — ✅ done

- `.github/workflows/deploy.yml` listens for `repository_dispatch` of type
  `rumoca-released` (also `push: main`, `workflow_dispatch`).
- Extracts artifacts into the right paths and runs `astro build`.
- Gracefully falls through to "build with committed artifacts" if no
  matching release asset is found — printed as a workflow warning.
- `scripts/sync-wasm.sh` does the equivalent locally from a sibling rumoca
  checkout, including the same WASM-path rewrite for the playground.

### Rumoca side — ⏳ not yet wired

- No release contains a `rumoca-web-*.tar.gz` asset. Latest checked: `v0.8.12`.
- No workflow in `CogniPilot/rumoca/.github/workflows/` produces such an asset.
- No `repository_dispatch` is fired from rumoca to this repo on release.
- Local rumoca checkout has uncommitted patches to `WasmStepper`
  (`crates/rumoca-bind-wasm/src/stepper_api.rs`) that the website depends on;
  they need to land upstream first.

### One-time manual steps — ⏳ not yet done

- CNAME ownership of `rumoca.cognipilot.org` is still on `CogniPilot/rumoca`.
  Needs to move to `CogniPilot/rumoca_website` via Pages settings.
- Fine-grained PAT (`RUMOCA_WEBSITE_DISPATCH_PAT`) needs to be created and
  stored as a secret in `CogniPilot/rumoca`.
- GitHub Pages source on `CogniPilot/rumoca_website` needs to be set to
  "GitHub Actions" and the custom domain set to `rumoca.cognipilot.org`.

---

## Tarball spec (the contract)

The release asset must be named `rumoca-web-<tag>.tar.gz` and have this
layout when extracted (paths shown relative to the tarball root):

```
pkg/
  rumoca_bind_wasm.js               required — WASM JS bindings
  rumoca_bind_wasm_bg.wasm          required — WASM binary
  rumoca_worker.js                  required — Web Worker entry
  parse_worker.js                   required — parse worker
editors/wasm/
  index.html                        required — playground entry
  src/**                            required — playground UI
  vendor/**                         required — Monaco bundle
  rumoca.png                        required — playground favicon/logo
  coi-serviceworker.js              required — SharedArrayBuffer shim
  rumoca_worker.js                  (worker wrapper used by editor build)
  parse_worker.js                   (parse worker used by editor build)
docs/
  user-guide/src/**/*.md            required for /user-guide routes
  dev-guide/src/**/*.md             required for /dev-guide routes
```

Anything outside these paths is ignored. Specifically:
- `editors/wasm/node_modules/` and `editors/wasm/tests/` — excluded
- `editors/wasm/package*.json` — excluded
- `docs/*/book/` (prebuilt mdBook output) — not used; we render markdown
  natively via Astro content collections

---

## Required rumoca workflow

Add `.github/workflows/publish-web.yml` to `CogniPilot/rumoca`:

```yaml
name: Publish web tarball

on:
  release:
    types: [published]

permissions:
  contents: write   # upload release asset

jobs:
  publish-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # --- WASM (with stepper-diffsol enabled) ---------------------------------
      - name: Install Rust nightly
        run: |
          curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
            --default-toolchain "$(awk -F'"' '/^channel/ { print $2 }' rust-toolchain.toml)"
          echo "$HOME/.cargo/bin" >> "$GITHUB_PATH"
          rustup target add wasm32-unknown-unknown
          rustup component add rust-src
      - name: Install wasm-pack
        run: cargo install wasm-pack --locked
      - name: Build WASM
        # NOTE: --no-opt mirrors the editor smoke-build profile. Drop it later
        # if we want wasm-opt's runtime perf gains (build adds ~1-2 min).
        # RUSTFLAGS workaround disables dead_code lint denial — see the
        # "rumoca patches" section below for the proper fix.
        env:
          RUSTFLAGS: "-A dead_code"
        run: |
          wasm-pack build crates/rumoca-bind-wasm \
            --target web \
            --out-dir ../../pkg/release-full-web \
            --release \
            --no-opt \
            -- --features full-web,stepper-diffsol

      # --- Modelica deps for docs/examples (optional, depends on layout) -------
      - name: Fetch CMM modelica deps
        run: cargo xtask repo modelica-deps ensure

      # --- Assemble the tarball -------------------------------------------------
      - name: Assemble rumoca-web tarball
        env:
          TAG: ${{ github.event.release.tag_name }}
        run: |
          mkdir -p build/pkg build/editors/wasm build/docs/user-guide/src build/docs/dev-guide/src

          # 1. WASM artifacts
          cp pkg/release-full-web/{rumoca_bind_wasm.js,rumoca_bind_wasm_bg.wasm,rumoca_worker.js,parse_worker.js} \
            build/pkg/

          # 2. Playground (editors/wasm) — excluding node_modules and tests
          ( cd editors/wasm && find . -type f \
              ! -path './node_modules/*' \
              ! -path './tests/*' \
              ! -name 'package-lock.json' \
              ! -name 'package.json' \
              -print0 | tar --null -cf - --files-from - ) | \
            ( cd build/editors/wasm && tar -xf - )

          # 3. Docs markdown (no mdBook output — the website renders MD natively)
          ( cd docs/user-guide/src && find . -name '*.md' -print0 | tar --null -cf - --files-from - ) | \
            ( cd build/docs/user-guide/src && tar -xf - )
          ( cd docs/dev-guide/src && find . -name '*.md' -print0 | tar --null -cf - --files-from - ) | \
            ( cd build/docs/dev-guide/src && tar -xf - )

          tar -C build -czf "rumoca-web-${TAG}.tar.gz" .
          ls -la "rumoca-web-${TAG}.tar.gz"

      # --- Upload as release asset ----------------------------------------------
      - name: Upload release asset
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ github.event.release.tag_name }}
        run: gh release upload "$TAG" "rumoca-web-${TAG}.tar.gz" --repo "${{ github.repository }}"

      # --- Notify the website to redeploy ---------------------------------------
      - name: Dispatch rumoca_website rebuild
        env:
          GH_TOKEN: ${{ secrets.RUMOCA_WEBSITE_DISPATCH_PAT }}
          TAG: ${{ github.event.release.tag_name }}
        run: |
          gh api repos/CogniPilot/rumoca_website/dispatches \
            -f event_type=rumoca-released \
            -f "client_payload[tag]=${TAG}"
```

---

## Required rumoca source patches

These need to be committed in `CogniPilot/rumoca` (currently sitting as
uncommitted edits in the local checkout).

### 1. `crates/rumoca-bind-wasm/src/stepper_api.rs`

Two changes:

a) `WasmStepper::new` accepts an optional `solver: Option<String>` so the
   website can pick `"rk-like"` for `QuadrotorAcro` (whose initial Jacobian
   trips diffsol's sparse-LU under BDF). The unmodified two-arg call still
   works because wasm-bindgen treats an absent JS arg as `None`.

b) `WasmStepper::reset()` calls `self.stepper.reset(0.0)` (in-place) instead
   of constructing a fresh `SimStepper` from the DAE. The current
   construction takes ~7 s for `QuadrotorAcro`; in-place reset takes ~0.1 ms.

Both patches preserve the existing public Rust API and JS class shape.

### 2. `crates/rumoca-phase-codegen/src/codegen/render_c.rs`

Seven helper functions (`flat_offset`, `infer_expr_dims`, `builtin_arg_usize`,
`matmul_result_dims`, `render_array_elem`, `render_err_result`,
`unflatten_coords`) are flagged as `dead_code` under the
`full-web,stepper-diffsol` feature combination. The workspace denies
`dead_code` so the build refuses to compile.

The publish workflow currently works around this with
`RUSTFLAGS="-A dead_code"`. The proper fix is to either:
- `#[cfg(feature = "c-codegen")]`-gate the helpers (or whatever feature
  actually uses them), or
- Remove them if they really are dead.

This is bit-rot — those helpers stayed unused because the default xtask
variant (`full-web` without `stepper-diffsol`) doesn't trip the gating.

---

## One-time setup (GitHub UI)

### CNAME cutover

The custom domain `rumoca.cognipilot.org` is currently bound to
`CogniPilot/rumoca`'s Pages site. A CNAME can target only one repo's Pages.

1. `CogniPilot/rumoca` → Settings → Pages: **remove** the custom domain
   `rumoca.cognipilot.org`.
2. `CogniPilot/rumoca_website` → Settings → Pages:
   - Source: **GitHub Actions**
   - Custom domain: `rumoca.cognipilot.org`
   - Wait for the cert to re-issue (a few minutes).
3. DNS at `cognipilot.org` likely already CNAMEs `rumoca` →
   `cognipilot.github.io`; no change required there. Pages routes the domain
   to whichever repo currently claims it.

### PAT for cross-repo dispatch

`publish-web.yml` calls `repos/CogniPilot/rumoca_website/dispatches`, which
requires write access to `rumoca_website` — the default `GITHUB_TOKEN`
can't cross repos.

1. Create a **fine-grained personal access token** with:
   - Resource owner: `CogniPilot`
   - Repository access: only `CogniPilot/rumoca_website`
   - Permissions: `Contents` = Read & Write (or just `Actions` if available)
2. In `CogniPilot/rumoca` → Settings → Secrets and variables → Actions →
   New repository secret:
   - Name: `RUMOCA_WEBSITE_DISPATCH_PAT`
   - Value: the token

PAT rotation: GitHub fine-grained tokens have a max 1-year lifetime. Set a
calendar reminder; the workflow will just stop firing dispatches if the
token expires.

### Drop the old Pages publish from rumoca

`CogniPilot/rumoca/.github/workflows/ci.yml` currently has `build-wasm`
and `deploy-pages` jobs that assemble a gh-pages artifact and deploy it.
Once this site is live at the CNAME, that path is dead weight and competes
for the cert. Either:
- Delete the `Prepare GitHub Pages content` step and the `deploy-pages` job
  entirely, or
- Keep `build-wasm` as a CI gate but stop uploading the Pages artifact.

---

## Verification (after wiring it all up)

1. Cut a tagged release of `CogniPilot/rumoca` (e.g., `v0.8.13`).
2. Watch `publish-web.yml` in rumoca's Actions tab. Confirm:
   - WASM build succeeds (~3-5 min).
   - Tarball is uploaded as a release asset visible under the release.
   - Dispatch step prints no errors (PAT works).
3. Switch to `CogniPilot/rumoca_website` Actions tab. The "Deploy to GitHub
   Pages" workflow should fire within ~10 s of step 2.
4. Confirm the build logs show:
   - `Using rumoca release: v0.8.13`
   - `✓ playground (WASM paths rewritten to /wasm/)`
   - `✓ user-guide markdown → src/content/user-guide`
   - `✓ dev-guide markdown → src/content/dev-guide`
5. Once deploy-pages succeeds, hit
   `https://rumoca.cognipilot.org/{simulation,playground,user-guide,dev-guide}`
   and confirm fresh content.

---

## Fallback behavior

If any link in the chain breaks, the website does **not** go down:

- **rumoca's release workflow fails** — no dispatch fires; website only
  rebuilds on its own `push: main` (with whatever artifacts are committed).
- **PAT expires / dispatch is denied** — same as above. Manual rebuild via
  `Actions → Deploy to GitHub Pages → Run workflow` still works.
- **Deploy workflow can't find the tarball** — prints a workflow warning
  (`::warning::No rumoca release with rumoca-web-*.tar.gz asset found`)
  and builds with the committed artifacts in `public/wasm/`,
  `public/playground/app/`, and `src/content/{user,dev}-guide/`. The site
  stays live; the content is just whatever was last committed.
- **Tarball is malformed** (missing one of the expected paths) — the
  workflow prints a warning per missing path and continues; affected
  routes serve stale or empty content but no other route breaks.

This is why we keep synced artifacts committed to the website repo:
they're the safety net.

---

## Open questions / future work

- **wasm-opt.** Currently `--no-opt` because rumoca's build script disables
  it. Re-enabling would give ~30-50% smaller WASM and 10-30% faster runtime
  at the cost of 1-2 min build time. Worth doing for a deployed site.
- **mdBook fallback.** We render docs natively via Astro, but the rumoca
  CI also produces full mdBook output. If you ever want it back, the
  tarball could include `docs/*/book/` and we could serve that from a
  separate path (e.g., `/user-guide-classic/`) for parity with the old
  rumoca-hosted look.
- **Per-release pinning.** Today the website always pulls the latest
  release with the matching tarball asset. If we ever need staged
  releases (canary → stable), we'd add a `client_payload.channel` field
  and route based on that.
- **Tarball size budget.** Current rough estimate: WASM ~20 MB
  (uncompressed), playground ~1 MB, docs ~250 KB. Pages soft-limits sites
  at ~1 GB; we're well under.
