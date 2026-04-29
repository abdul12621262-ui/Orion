<div align="center">
# Orion Browser

**A premium desktop browser with a built-in AI panel — built from scratch with Electron.**

[![Download](https://img.shields.io/github/v/release/abdul12621262-ui/Orion?label=Download&color=5b6fff&style=for-the-badge)](https://github.com/abdul12621262-ui/Orion/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue?style=for-the-badge)](https://github.com/abdul12621262-ui/Orion/releases/latest)
[![Built with Electron](https://img.shields.io/badge/Built%20with-Electron-47848f?style=for-the-badge)](https://www.electronjs.org/)
[![AI by Groq](https://img.shields.io/badge/AI-Groq%20llama--3.3--70b-orange?style=for-the-badge)](https://groq.com/)

![Orion Home Screenshot](https://claude.ai/api/44029729-de8e-463a-8d5e-b248cbc480c1/files/019dd816-d87f-7548-a0db-68e86a0cf356/preview)

</div>

---

## What is Orion?

Orion is a keyboard-first desktop browser that puts an AI assistant right inside your browsing experience. No extensions. No setup. Just install and go.

It's built entirely from scratch using Electron and vanilla JavaScript — no UI frameworks, no bloat.

---

## Features

### 🤖 Built-in AI Panel (Groq — llama-3.3-70b)
Ask anything about the page you're on. Summarize articles, find key facts, explain complex content — all without leaving the browser. Powered by Groq's ultra-fast inference.

![AI Panel Screenshot](https://claude.ai/api/44029729-de8e-463a-8d5e-b248cbc480c1/files/019dd816-fd4b-76a0-8a71-3c01567cec58/preview)
### 🛡️ Ad Blocker + Tracker Blocking
Built-in ad and tracker blocking with custom blocklist support. Privacy out of the box — no extension needed.

### ⌨️ Keyboard-First Navigation
8 keyboard shortcuts built in:

| Shortcut | Action |
|---|---|
| `⌘K` | Focus omnibar |
| `⌘L` | Focus address bar |
| `⌘T` | New tab |
| `⌘W` | Close tab |
| `⌘R` | Reload |
| `⌘[` / `⌘]` | Back / Forward |
| `Alt + Arrow` | Switch tabs |

### 🗂️ Smart Tab Management
- Tab favicons
- Middle-click to close
- Collapsible sidebar rail
- Tab history persistence

### 🏠 Home Page
Live clock, date, and a Quick Access speed dial with your most-used sites.

### ⚙️ Settings
- Privacy, Security, Appearance, Performance, Advanced categories
- Searchable settings
- Export / Import settings as JSON
- Reset to defaults

![Settings Screenshot](https://claude.ai/api/44029729-de8e-463a-8d5e-b248cbc480c1/files/019dd817-3176-76e1-b439-25f2ad8211e3/preview)

---

## Download

> **Windows only for now.**

👉 [Download the latest .exe from Releases](https://github.com/abdul12621262-ui/Orion/releases/latest)

Just download, run the installer, and Orion opens. No setup required.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron |
| Frontend | Vanilla JS (ES Modules) |
| Styling | CSS Custom Properties (token-first design system) |
| AI | Groq API — llama-3.3-70b |
| Fonts | Geist + Geist Mono |

---

## Design System

Orion uses a custom token-first CSS design system — no Tailwind, no component libraries. Every color, spacing value, radius, and animation duration is a CSS variable:

```
--bg-base        --surface-0/1/2/3
--accent-1       (#5b6fff)
--accent-2       (#3ac6ff)
--text-primary/secondary/tertiary
--r-sm/md/lg/xl/2xl/full
--dur-fast/base/slow
```

---

## Project Structure

```
src/
└── renderer/
    ├── index.html
    ├── home.html
    ├── style.css
    ├── renderer.js
    ├── ui.js
    ├── ai.js
    ├── settings.js
    ├── state.js
    └── tokens.js
```

---

## Roadmap

- [ ] macOS support
- [ ] History manager
- [ ] Bookmark system
- [ ] Theme customization
- [ ] More AI models

---

## Author

Built by **Abdul Rehman** — a self-taught developer from Karachi, Pakistan.

---

<div align="center">

⭐ Star the repo if you think this is cool.

</div>
