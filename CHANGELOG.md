# Changelog

All notable changes to Aether Renderer GUI are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-10-29

The biggest update so far: HTML animations in, transparent video out.

### Added
- **HTML to video.** Pick an HTML/CSS/JS animation (or an https:// address) with the
  🌐 HTML button and render it to WebM, MOV, GIF or MP4 with transparency intact. Frames
  are captured one by one in headless Chrome by
  [aether-renderer-capture](https://github.com/madspaaskesen/aether-renderer-capture) 0.2
  and streamed straight into the encoder: every render is identical, and no frames touch
  the disk. Size, duration and size presets (Full HD, 4K, 9:16 Reels/TikTok/Shorts, 4:5,
  square, stickers) for HTML input.
- **Live preview** of the HTML page at the capture size, with relative files (CSS,
  images, fonts next to the page) working.
- **Code editor.** A Code tab next to Preview: edit the HTML and the preview follows as
  you type; Save button and ⌘S / Ctrl+S; it asks before throwing away unsaved changes,
  and offers "Save and render". **New HTML** starts from a small transparent template.
- **Drag and drop** a frames folder, PNG frames, a ZIP or an HTML file onto the window.
- **Report a bug / Request a feature** from Settings, the macOS Help menu, or the
  **Report** button that appears in the status bar when a render fails. Diagnostics
  (versions, OS, FFmpeg/Chrome, settings, recent errors) are optional, and you can see
  exactly what will be sent.
- **About window** with the versions of the app, core and capture, FFmpeg and Chrome,
  and a "Copy info" button. Opens from Settings or "About Aether Renderer…" in the macOS
  menu, which now also has Edit (copy/paste) and Window menus.
- Settings: where chrome-headless-shell is (auto-detected from `~/.cache/puppeteer` or
  `AETHER_CHROME`), with Browse and Detect.
- Click an error in the status bar to copy the whole message.

### Changed
- **New layout.** The window no longer scrolls: both panels scroll on their own, their
  headings and the Render button stay in place, and the status bar runs along the bottom
  of the window. Basic | Advanced and Preview | Code are tabs in the panel headings.
- Lucide icons on all buttons instead of emoji.
- A darker, colored star background for light mode; clearer scrollbars in dark mode.
- An empty output path saves `output.<format>` next to the input (it used to land in the
  app's working directory). The output file's extension follows the chosen format, and
  typing an extension picks the format.
- Text in the app can't be selected by accident; inputs, paths and versions still can.

### Fixed
- Progress no longer sits at 0% while an HTML capture renders.
- HTML pages that stop changing for a moment (a title holding still before it fades
  out) no longer time out on macOS and Windows.
- Long hints (like the MP4 transparency warning) wrap instead of widening the panel.
- The Settings button closes the Settings drawer again.

## [0.2.0]

Background color picker (keep transparency or fill it), live render progress, the new
lightning-Æ logo and a working setup. See the
[release](https://github.com/madspaaskesen/aether-renderer-gui/releases/tag/v0.2.0).

## Earlier

See [GitHub releases](https://github.com/madspaaskesen/aether-renderer-gui/releases).

[0.3.0]: https://github.com/madspaaskesen/aether-renderer-gui/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/madspaaskesen/aether-renderer-gui/releases/tag/v0.2.0
