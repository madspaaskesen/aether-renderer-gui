# 🌌 Aether Renderer GUI

**Tauri-based desktop interface for the [Aether Renderer Core](https://github.com/madspaaskesen/aether-renderer-core)**

This project offers a soft and sacred desktop UI for invoking rendering logic from the core Rust crate [`aether-renderer-core`](https://crates.io/crates/aether-renderer-core), which handles all actual processing and logic.

Built with:
- 🦀 Rust (Tauri backend)
- 🌐 JavaScript (Vanilla or Vue frontend)
- ✨ Sacred purpose & elegance

![Rust](https://img.shields.io/badge/built_with-rust-orange)
![MadeWithTauri](https://img.shields.io/badge/ui-tauri-8d64c0?logo=tauri&logoColor=white)
![Aether Core](https://img.shields.io/badge/renderer-aether--renderer--core-blue)
![Version](https://img.shields.io/badge/version-0.2.0-lightgrey)
![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-green)

---

## ✨ Features

- Visual entrypoint for rendering config files
- Calls `render_from_config(config_path)` from the core crate
- Error-safe Tauri commands
- Cross-platform desktop experience
- Designed to integrate with future sacred tooling

### 👀 Preview (Screenshot)

![Screenshot preview](examples/aether-renderer-gui-preview-v0.1.0.jpg)

---

## 🧪 Getting Started

```bash
git clone https://github.com/madspaaskesen/aether-renderer-gui.git
cd aether-renderer-gui
npm install
cargo tauri dev
```

> 🧬 Note: The `aether-renderer-core` crate is used as a published dependency. Make sure it's in `Cargo.toml`.

---

## 🔧 Project Structure

```
aether-renderer-gui/
├── src/                  # Frontend UI (HTML/JS or Vue)
├── src-tauri/            # Tauri Rust backend
├── public/               # Static assets
├── target/               # Build output (ignored by git)
└── Cargo.toml            # Root workspace, references core
```

---

## 📦 Dependencies

Make sure your environment includes:

* Rust stable
* Node.js + npm
* `tauri-cli` installed via `cargo install tauri-cli`
* (Optional) `glib` and `pkg-config` (for native builds)

---

## 🕊️ License

This project is dual-licensed under MIT and Apache-2.0.
Created with care by [@madspaaskesen](https://github.com/madspaaskesen) ✨

---

## 🌱 Related Projects

* [`aether-renderer-core`](https://github.com/madspaaskesen/aether-renderer-core) – logic library (crate)

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
