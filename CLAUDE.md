# aether-renderer-gui

Tauri v2 desktop app for [aether-renderer-core](https://crates.io/crates/aether-renderer-core):
pick PNG frames, choose format, background and fades, render with a live progress bar,
preview the result.

## Run

The frontend is static HTML/CSS/JS served straight from `src/` (`frontendDist: "../src"`,
`withGlobalTauri: true`), so there is no bundler and no JS dependencies. `package.json` exists
only to pin the Tauri CLI (`@tauri-apps/cli`), like gifmeta-gui. Don't add a bundler.

```bash
npm install          # once: installs the Tauri CLI
npm run dev          # tauri dev, from the repo root
npm run build        # installable app in target/release/bundle/
cargo build && cargo test   # what CI runs (ubuntu-22.04)
```

Needs `ffmpeg` on PATH at runtime. Linux build deps: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`.

## Core dependency

`src-tauri/Cargo.toml` uses the published crates (`aether-renderer-core = "0.7"`,
`aether-renderer-capture = "0.2"`); CI only checks out this repo, so never commit a `path`
dependency. For local work on both repos, uncomment
`[patch.crates-io]` in the root `Cargo.toml` (expects `../aether-renderer-core`), and comment it
out again before committing.

## Layout

| Path | Role |
|---|---|
| `src-tauri/src/lib.rs` | Tauri commands: `run_renderer` (async, renders on `spawn_blocking`, emits `render-progress` events with `{frame,total_frames,percent}`, returns `{output,frames,notes,warnings}` or an error string; an HTML file/URL goes through `render_capture`: capture's `png_stream` → core's `render_stream`, no temp files), `detect_chrome`, `allow_preview` (opens the asset protocol for one HTML file's folder), `run_renderer_from_config`, `get_rendered_file`, `open_file` |
| `src/index.html` | Single page: Basic Settings (input, output, format, background), Advanced Settings, preview, status bar, footer |
| `src/js/main.js` | Form → `invoke('run_renderer', { values })`, `listen('render-progress')`, background picker logic, preview (video or `<img>` for GIF), localStorage defaults |
| `src/js/status-bar-spinner.js` | `startStatusSpinner`, `stopStatusSpinner`, `updateMainStatus`, `updateAlertStatus` on `window` |
| `src/css/` | `variables.css` (light/dark tokens), `layout.css`, `form.css`, `text.css`, `main.css` |
| `src-tauri/capabilities/` | Tauri permissions (dialog, opener, shell). Add new plugin permissions here |

## Conventions

- `RenderValues` in `lib.rs` mirrors the JS `values` object (snake_case keys). It is turned into
  a core `PartialConfig`, so defaults and validation match the CLI. When the core gains an
  option, add it to `RenderValues`, the `PartialConfig` mapping, the form, `runRender()`,
  save/load defaults and the Reset handler.
- HTML input: `isHtmlInput()` (JS) and `is_html_input()` (Rust) must agree. The preview iframe
  keeps `sandbox="allow-scripts"` (no same-origin), so a page can't reach the Tauri IPC, and the
  asset protocol scope starts empty (`tauri.conf.json`); `allow_preview` opens one folder at a time.
  Chrome is found by `find_chrome`: Settings path, then `AETHER_CHROME`, then `~/.cache/puppeteer`.
- Background: `background: undefined` = transparent; otherwise a `#rrggbb` string from the color
  input. MP4 shows a warning when transparent is selected (it renders black).
- Long work must stay off the main thread (async command + `spawn_blocking`), and errors must
  be returned to the UI, never swallowed.
- Footer and README credit **Hardcore Websmith** (https://hardcorewebsmith.com).
- App icon: source is `src-tauri/icons/icon-source.svg` (lightning "Æ" for Æther, yellow on dark
  indigo); regenerate all sizes with `npx tauri icon <1024px png>`. `src/images/logo.svg` is the
  same file, used for the header, favicon and README. `logo-inverted.svg` is the blue Æ on
  yellow (same as `logo-ae.svg` / `logo-ae-inverted.svg`). Other marks in `src/images/`:
  `logo-a.svg` (input/output A), `logo-e.svg` + `logo-e-inverted.svg` (lightning E),
  `logo-ae-wild.svg` (first sketch).
- Version strings live in three places: `src-tauri/Cargo.toml`, `tauri.conf.json`
  (`version` + window title) and the `<h1>` in `index.html`. Keep them in sync.
