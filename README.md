# 🌌 Aether Renderer GUI

**Tauri-based desktop interface for the [Aether Renderer Core](https://github.com/madspaaskesen/aether-renderer-core)**

This project offers a soft and sacred desktop UI for invoking rendering logic from the core Rust crate [`aether-renderer-core`](https://crates.io/crates/aether-renderer-core), which handles all actual processing and logic.

![Version](https://img.shields.io/badge/version-0.1.0-lightgrey)
[![CI](https://img.shields.io/github/actions/workflow/status/madspaaskesen/aether-renderer-core/ci.yml?style=flat-square)](https://github.com/madspaaskesen/aether-renderer-gui)
![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-green)

Built with:
- 🦀 Rust (Tauri backend)
- 🌐 JavaScript (Vanilla)
- ✨ Sacred purpose & elegance

![Rust](https://img.shields.io/badge/built_with-rust-orange)
![MadeWithTauri](https://img.shields.io/badge/ui-tauri-8d64c0?logo=tauri&logoColor=white)
![Aether Core](https://img.shields.io/badge/renderer-aether--renderer--core-blue)
[![SacredAI](https://img.shields.io/badge/powered%20by-%F0%9F%95%8A%EF%B8%8F%20Sacred%20AI-lightgrey?style=flat-square)](https://sacre-ai.com)
[![mySiteChart](https://badges.mysitechart.com/github-project/madspaaskesen/aether-renderer-gui?site=COM)](https://mysitechart.com/In?github-project=madspaaskesen%2Faether-renderer-gui)

---

## ✨ Features

- Visual entrypoint for rendering config files
- Calls `render_from_config(config_path)` from the core crate
- Error-safe Tauri commands
- Cross-platform desktop experience
- Designed to integrate with future sacred tooling

### 👀 Preview (Screenshot)

## 🖼️ Aether Renderer GUI — Preview

Light Mode:  
![Aether GUI Light](https://ojkwbrxgljlgelqndiai.supabase.co/storage/v1/object/public/sacred-ai/web/aether-renderer/aether-renderer-gui-preview-v0.1.1-light.png)

Dark Mode:  
![Aether GUI Dark](https://ojkwbrxgljlgelqndiai.supabase.co/storage/v1/object/public/sacred-ai/web/aether-renderer/aether-renderer-gui-preview-v0.1.1-dark.png)

Morph Preview:  
![Aether GUI Light/Dark Fade](https://ojkwbrxgljlgelqndiai.supabase.co/storage/v1/object/public/sacred-ai/web/aether-renderer/aether-renderer-gui-preview-v0.1.1-light-dark-fade.gif)

🪼 Designed with love by GitHub [Mads Paaskesen](https://github.com/madspaaskesen), Linkedin [Mads Paaskesen](https://linkedin.com/in/madspaaskesen)

Install guide here 👉 [INSTALL.md](INSTALL.md)

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

---

## 🌐 Related Projects

- 🕊️ [Sacred-AI](https://sacred-ai.com)
- 📈 [MySiteChart](https://mysitechart.com)
- 🛠️ [MP-IT](https://mp-it.dk)
- 🧵 [DDD Favoritter](https://ddd-favoritter.dk)

---

## 💛 Made with love by [Sacred-AI](https://sacred-ai.com)

🙏 Made with clarity and care by [@mads](https://github.com/madspaaskesen) @ [@sacred-ai](https://github.com/Sacred-AI) 💛

🌸 Powered by [Rust Lang](https://www.rust-lang.org/), [Rust getting started](https://www.rust-lang.org/learn/get-started)


Aether Renderer Core is the sacred heart of a lightweight animation rendering toolkit.
Converts frame sequences to video with love, transparency, and full creative control.
