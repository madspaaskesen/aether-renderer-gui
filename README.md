<p align="center">
  <img src="src/images/logo.svg" width="160" alt="Aether Renderer lightning Æ logo" />
</p>

# 🌌 Aether Renderer GUI

**Turn PNG frames, ZIPs and HTML animations into transparent WebM, MOV, GIF and MP4. A desktop app for [Aether Renderer Core](https://github.com/madspaaskesen/aether-renderer-core).**

This project offers a soft and sacred desktop UI for invoking rendering logic from the core Rust crate [`aether-renderer-core`](https://crates.io/crates/aether-renderer-core), which handles all actual processing and logic.

[![Release](https://img.shields.io/github/v/release/madspaaskesen/aether-renderer-gui)](https://github.com/madspaaskesen/aether-renderer-gui/releases)
[![Downloads](https://img.shields.io/github/downloads/madspaaskesen/aether-renderer-gui/total)](https://github.com/madspaaskesen/aether-renderer-gui/releases)
[![CI](https://github.com/madspaaskesen/aether-renderer-gui/actions/workflows/ci.yml/badge.svg)](https://github.com/madspaaskesen/aether-renderer-gui/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

![Built with Rust](https://img.shields.io/badge/built_with-rust-orange)
![Tauri](https://img.shields.io/badge/ui-tauri-8d64c0?logo=tauri&logoColor=white)
[![aether-renderer-core](https://img.shields.io/crates/v/aether-renderer-core?label=aether-renderer-core)](https://crates.io/crates/aether-renderer-core)
[![aether-renderer-capture](https://img.shields.io/crates/v/aether-renderer-capture?label=aether-renderer-capture)](https://crates.io/crates/aether-renderer-capture)
[![Hardcore Websmith](https://img.shields.io/badge/made%20by-%E2%9A%92%EF%B8%8F%20Hardcore%20Websmith-lightgrey?style=flat-square)](https://hardcorewebsmith.com)
[![mySiteChart](https://badges.mysitechart.com/github-project/madspaaskesen/aether-renderer-gui?site=COM)](https://mysitechart.com/In?github-project=madspaaskesen%2Faether-renderer-gui)

---

## ✨ Features

- **Frames to video**: a folder or ZIP of PNG frames to WebM, MOV (ProRes 4444), GIF or MP4,
  with transparency intact. Pick it, or just **drag and drop** it onto the window
- **🌐 HTML to video**: an HTML/CSS/JS animation (or an https:// address) to a transparent video.
  Frames are captured one by one in headless Chrome with
  [`aether-renderer-capture`](https://github.com/madspaaskesen/aether-renderer-capture) and
  streamed straight into the encoder: every render is identical, and no frames touch the disk
- **Live preview and code editor** for HTML: edit in the Code tab, the preview follows as you
  type, save with ⌘S, or start from a template with **New HTML**
- **Size presets** for HTML: Full HD, 4K, 9:16 Reels/TikTok/Shorts, 4:5, square, stickers
- **Background color**: keep transparency, or fill it with a color (MP4 can't be transparent)
- Fade in / out, fps, bitrate and CRF in Advanced settings
- Live progress, and a preview of the result on a checkerboard so transparency is visible
- **Report a bug / Request a feature** from the app (diagnostics optional, you see what's sent)
- Light and dark mode, macOS menu, works on macOS, Windows and Linux

### 👀 Preview (Screenshot)

## 🖼️ Aether Renderer GUI — Preview

Light Mode:  
![Aether GUI Light](docs/screenshots/aether-renderer-gui-preview-v0.1.1-light.png)

Dark Mode:  
![Aether GUI Dark](docs/screenshots/aether-renderer-gui-preview-v0.1.1-dark.png)

Morph Preview:  
![Aether GUI Light/Dark Fade](docs/screenshots/aether-renderer-gui-preview-v0.1.1-light-dark-fade.gif)

🪼 Designed with love by GitHub [Mads Paaskesen](https://github.com/madspaaskesen), Linkedin [Mads Paaskesen](https://linkedin.com/in/madspaaskesen)

Install guide here 👉 [INSTALL.md](INSTALL.md) · What's new 👉 [CHANGELOG.md](CHANGELOG.md)

---

## 🧪 Getting Started

The frontend is plain HTML, CSS and JavaScript in `src/` (no bundler). npm is only used to
install the Tauri CLI, the same way as in [gifmeta-gui](https://github.com/madspaaskesen/gifmeta-gui).

### 1. Prerequisites

* [Rust](https://www.rust-lang.org/learn/get-started) (stable)
* [Node.js](https://nodejs.org/) 18 or newer
* `ffmpeg` on your PATH (macOS: `brew install ffmpeg`, more in [INSTALL.md](INSTALL.md))
* For HTML input only: chrome-headless-shell. The app finds it in `~/.cache/puppeteer` or via
  `AETHER_CHROME`, or you pick it in ⚙️ Settings:
  `npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer`
* macOS: Xcode Command Line Tools (`xcode-select --install`)
* Linux: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`

### 2. Run it

```bash
git clone https://github.com/madspaaskesen/aether-renderer-gui.git
cd aether-renderer-gui
npm install
npm run dev
```

The first run compiles the Rust side and takes a few minutes. Build an installable app with
`npm run build` (output in `target/release/bundle/`).

> 🧬 The renderer is the [`aether-renderer-core`](https://crates.io/crates/aether-renderer-core) crate.
> To work on both at once, clone `aether-renderer-core` next to this repo and uncomment the
> `[patch.crates-io]` section in the root `Cargo.toml`.

---

## 🔧 Project Structure

```
aether-renderer-gui/
├── src/                  # Frontend: index.html, css/, js/ (vanilla, no build step)
├── src-tauri/            # Tauri v2 Rust backend (commands in src/lib.rs)
│   ├── tauri.conf.json   # Window, bundle and security config
│   └── capabilities/     # Tauri permissions
├── examples/             # Screenshots
└── Cargo.toml            # Workspace root
```

---

## 🕊️ License

MIT, see [LICENSE](LICENSE).
Created with care by [@madspaaskesen](https://github.com/madspaaskesen) ✨

---

## 🌱 Related Projects

* [`aether-renderer-core`](https://github.com/madspaaskesen/aether-renderer-core) – logic library (crate)
* [`aether-renderer-capture`](https://github.com/madspaaskesen/aether-renderer-capture) – HTML → deterministic, transparent frames (crate)

---

## 🌿 Philosophy

Aether Renderer was born from the desire to bridge code and spirit —
to create not just tools, but experiences that feel intentional, poetic, and alive.

This GUI is more than a graphical interface —  
it’s a sacred surface between human intention and machine execution.

The goal is not speed for its own sake,  
but clarity.  
Gentleness.  
Presence.

Each render is a ritual.  
Each config path is a small offering.  
Each output is part of a living system.

Built to be quiet, focused, and emotionally clean,  
this project invites creators to work in a space that respects the invisible just as much as the visible.

---

## 🌐 Related Projects

- ⚒️ [Hardcore Websmith](https://hardcorewebsmith.com)
- 🕊️ [Sacred-AI](https://sacred-ai.com)
- 📈 [MySiteChart](https://mysitechart.com)
- 🛠️ [MP-IT](https://mp-it.dk)
- 🧵 [DDD Favoritter](https://ddd-favoritter.dk)

---

## ⚒️ Made by [Hardcore Websmith](https://hardcorewebsmith.com)

🙏 Made with clarity and care by [@mads](https://github.com/madspaaskesen) at [Hardcore Websmith](https://hardcorewebsmith.com) 💛

🌸 Powered by [Rust Lang](https://www.rust-lang.org/), [Rust getting started](https://www.rust-lang.org/learn/get-started)


Aether Renderer Core is the sacred heart of a lightweight animation rendering toolkit.
Converts frame sequences to video with love, transparency, and full creative control.
