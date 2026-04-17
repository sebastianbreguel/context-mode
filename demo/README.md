<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/heygen-com/hyperframes/raw/main/docs/logo/dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/heygen-com/hyperframes/raw/main/docs/logo/light.svg">
    <img alt="HyperFrames" src="https://github.com/heygen-com/hyperframes/raw/main/docs/logo/light.svg" width="320">
  </picture>
</p>

<p align="center"><b>Write HTML. Render video. Built for agents.</b></p>

<p align="center">
  <a href="https://www.npmjs.com/package/hyperframes"><img src="https://img.shields.io/npm/v/hyperframes.svg?style=flat" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/hyperframes"><img src="https://img.shields.io/npm/dm/hyperframes.svg?style=flat" alt="npm downloads"></a>
  <a href="https://github.com/heygen-com/hyperframes/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js"></a>
</p>

<p align="center">
  <a href="#-the-idea"><img src="https://img.shields.io/badge/The_Idea-0d1117?style=for-the-badge&labelColor=0d1117" alt="The Idea"></a>
  &nbsp;
  <a href="#-why-hyperframes"><img src="https://img.shields.io/badge/Why-161b22?style=for-the-badge&labelColor=161b22" alt="Why"></a>
  &nbsp;
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-0d1117?style=for-the-badge&labelColor=0d1117" alt="Quick Start"></a>
  &nbsp;
  <a href="#-packages"><img src="https://img.shields.io/badge/Packages-161b22?style=for-the-badge&labelColor=161b22" alt="Packages"></a>
</p>

<br>

---

## 🎬 The Idea

<table>
<tr>
<td width="50%" valign="top">

<sub><b>You write HTML →</b></sub>

```html
<div id="stage"
     data-composition-id="my-video"
     data-width="1920"
     data-height="1080">
  <video id="clip-1"
    data-start="0" data-duration="5"
    data-track-index="0"
    src="intro.mp4" muted playsinline></video>

  <img id="overlay" class="clip"
    data-start="2" data-duration="3"
    data-track-index="1"
    src="logo.png" />

  <audio id="bg-music"
    data-start="0" data-duration="9"
    data-track-index="2"
    data-volume="0.5"
    src="music.wav"></audio>
</div>
```

</td>
<td width="50%" valign="top" align="center">

<sub><b>Hyperframes renders MP4 →</b></sub>

<br>

<img src="https://static.heygen.ai/hyperframes-oss/docs/images/readme-demo.gif" alt="HyperFrames demo — HTML on the left renders to video on the right" width="420">

<br>

<sub><i>Deterministic. Same HTML → same MP4, every time.</i></sub>

</td>
</tr>
</table>

---

## ✨ Why Hyperframes

<table>
<tr>
<td width="50%" valign="top">

### 📄 HTML-native

Compositions are plain HTML files with `data-*` attributes. No React, no proprietary DSL — if you can write a webpage, you can write a video.

</td>
<td width="50%" valign="top">

### 🤖 AI-first

Agents already speak HTML fluently. The CLI is non-interactive by default and ships with Claude Code / Cursor / Codex skills — designed for agent-driven workflows.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔒 Deterministic

Same input produces identical output, frame-for-frame. Built for automated pipelines, CI/CD, and reproducible renders.

</td>
<td width="50%" valign="top">

### 🔌 Frame Adapter pattern

Bring your own animation runtime — GSAP, Lottie, CSS keyframes, Three.js. Hyperframes just seeks the page; the motion is yours.

</td>
</tr>
</table>

---

## 🚀 Quick Start

<details open>
<summary><b>→ With an AI coding agent &nbsp;<sub>(recommended)</sub></b></summary>

<br>

Install the HyperFrames skills — your agent learns to author compositions and animations correctly:

```bash
npx skills add heygen-com/hyperframes
```

Works with Claude Code, Cursor, Gemini CLI, and Codex. In Claude Code the skills register as slash commands. Then just describe the video:

> Using `/hyperframes`, create a 10-second product intro with a fade-in title, a background video, and background music.

The agent handles scaffolding, animation, preview, and rendering end-to-end.

</details>

<details>
<summary><b>→ With the CLI</b></summary>

<br>

```bash
npx hyperframes init my-video
cd my-video

npx hyperframes preview     # live preview in browser
npx hyperframes lint        # validate composition
npx hyperframes render      # render to MP4 (local or Docker)
```

Full CLI reference: [`hyperframes` docs](https://hyperframes.heygen.com/packages/cli).

</details>

---

## 📦 Packages

| Package | What it does |
| :--- | :--- |
| [**`hyperframes`**](https://github.com/heygen-com/hyperframes/tree/main/packages/cli) | CLI — create, preview, lint, and render compositions |
| [**`@hyperframes/core`**](https://github.com/heygen-com/hyperframes/tree/main/packages/core) | Types, parsers, generators, linter, runtime, frame adapters |
| [**`@hyperframes/engine`**](https://github.com/heygen-com/hyperframes/tree/main/packages/engine) | Seekable page-to-video capture engine (Puppeteer + FFmpeg) |
| [**`@hyperframes/producer`**](https://github.com/heygen-com/hyperframes/tree/main/packages/producer) | Full rendering pipeline — capture, encode, and audio mix |
| [**`@hyperframes/studio`**](https://github.com/heygen-com/hyperframes/tree/main/packages/studio) | Browser-based composition editor UI |
| [**`@hyperframes/player`**](https://github.com/heygen-com/hyperframes/tree/main/packages/player) | Embeddable `<hyperframes-player>` web component |
| [**`@hyperframes/shader-transitions`**](https://github.com/heygen-com/hyperframes/tree/main/packages/shader-transitions) | WebGL shader transitions for compositions |

---

<p align="center">
  <sub>
    Apache 2.0 &nbsp;·&nbsp;
    <a href="https://hyperframes.heygen.com/introduction">Full docs</a> &nbsp;·&nbsp;
    <a href="https://hyperframes.heygen.com/quickstart">Quickstart</a> &nbsp;·&nbsp;
    <a href="https://github.com/heygen-com/hyperframes">GitHub</a> &nbsp;·&nbsp;
    <a href="https://www.npmjs.com/package/hyperframes">npm</a>
  </sub>
</p>
