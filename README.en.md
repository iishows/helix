# Helix

<p align="center">
  <img src="brands/helix/brand/wordmark.svg" alt="Helix" width="420">
</p>

<div align="center">

[![GitHub Issues](https://img.shields.io/github/issues/iishows/helix)](https://github.com/iishows/helix/issues)
[![License](https://img.shields.io/badge/License-Community_Source-orange)](https://github.com/iishows/helix/blob/main/LICENSE)
[![English](https://img.shields.io/badge/🇺🇸_English-Current-blue)](README.en.md)
[![中文](https://img.shields.io/badge/🇨🇳_简体中文-Available-green)](README.md)

[简体中文](README.md) · **English**

</div>

> **Based on cc-haha** — Helix is a redistribution (whitelabel fork) of [cc-haha](https://github.com/NanmiCoder/cc-haha).
> It is distributed under the [cc-haha Community Source License 1.0](LICENSE), retaining the upstream
> attribution and license notices in full. Upstream code is copyright (c) 2026 cc-haha.
> All rights to the upstream name and logo remain with their respective owners.

Helix is a **desktop Claude Code workspace** for macOS, Windows, and Linux: multi-session workspaces, global search, branch / Worktree launch, diff review, built-in browser preview, GUI permission approval, any model — Claude, ChatGPT, Grok, presets, or local endpoints — image generation, visual MCP & SubAgent managers, an Agent Teams workbench, dynamic Workflow orchestration, model trace, Computer Use, skill marketplace, colour themes, desktop pets, H5 remote access, IM integration, and scheduled tasks, all in one app. **On macOS, Computer Use can operate other apps without taking over your physical mouse or keyboard.**

<p align="center">
  <a href="#desktop-preview">Desktop Preview</a> · <a href="#install-the-desktop-app">Install</a> · <a href="#desktop-highlights">Highlights</a> · <a href="#more-documentation">More Docs</a>
</p>

---

## Desktop Preview

<p align="center">
  <a href="https://github.com/iishows/helix/releases"><img src="https://img.shields.io/badge/⬇_Download_Desktop-Windows-FF7A00?style=for-the-badge" alt="Download Desktop"></a>
</p>

<p align="center"><sub>Windows installers are published today; macOS / Linux can be built from source as described below.</sub></p>

Start here: [install the app](docs/en/start/install.md) → [connect a model](docs/en/start/models.md) → [run your first session](docs/en/start/first-session.md) → [explore settings](docs/en/desktop/settings.md) → [try real workflows](docs/en/cases/index.md). For hands-free cross-app work on macOS, follow the [Computer Use guide](docs/en/desktop/computer-use.md).

---

## Install the Desktop App

1. Download the desktop installer from [Releases](https://github.com/iishows/helix/releases) (Windows builds are currently provided).
2. On first launch, configure your model provider, API key, and default model in Settings.
3. Public macOS releases require signing and notarization. Draft or unsigned temporary builds may still need one-time manual approval. Unsigned Windows installers may show SmartScreen; click "More info" -> "Run anyway". See the [desktop installation guide](docs/en/start/install.md).

Release trust and privacy: [Code signing policy](docs/en/start/code-signing.md) · [Privacy and network access](docs/en/start/privacy.md)

## Run the CLI from Source

For users who want to debug the underlying CLI, server, or local development flow:

```bash
bun install
cp .env.example .env
./bin/claude-haha
```

See [environment variables](docs/en/cli/env.md) and [CLI setup](docs/en/cli/index.md) for more configuration options.

---

## Feedback & Support

For questions or bug reports, please use [Issues](https://github.com/iishows/helix/issues).

For the upstream project's support channels, see the [cc-haha repository](https://github.com/NanmiCoder/cc-haha).

---

## Desktop Highlights

- **Multi-session workspace**: tabs, project switching, terminal entry, and session history in one place, with a resizable sidebar.
- **Global search**: press Cmd+K to search across every session and jump to the match.
- **Branch / Worktree launch**: choose a repository branch and decide whether to use the current working tree or an isolated Worktree.
- **Review edits file by file**: the workspace lists this turn's changes; open any file for a syntax-highlighted diff, or undo the whole turn.
- **Built-in browser preview**: the page your agent just edited renders right inside the app, cookies and login state included.
- **Five permission modes**: from "ask every time" to "skip permissions" — risky commands, tool calls, and follow-up questions are all approved in the GUI.
- **Bring your own model**: sign in to Claude, ChatGPT, or Grok; use presets for DeepSeek, Kimi, Zhipu GLM and others; or point it at LM Studio and Ollama running locally.
- **Image generation**: generate and edit images right in the chat — sign in with ChatGPT or Grok for instant use, or plug in any OpenAI-compatible Images API.
- **Visual MCP manager**: add and edit MCP servers in a GUI — STDIO / Streamable HTTP / SSE, with project, shared, or global scope.
- **Six colour themes**: white, paper, warm classic, celadon, ink night, and ink blue — optionally following your system's light/dark setting.
- **Skill marketplace**: discover, preview, and install third-party skills from ClawHub / SkillHub, with source and safety status shown up front.
- **Session activity panel**: track task progress, background tasks, SubAgents, and sources in one side panel.
- **Visual SubAgent manager**: create and tune SubAgents in a GUI — model, tools, and permission mode.
- **Agent Teams workbench**: visualize multi-agent collaboration in the GUI — members, tasks, a communication feed, and a dependency-lane canvas.
- **Dynamic Workflow orchestration**: the model writes and runs orchestration scripts on the fly, driving subagents concurrently or in pipelines, with phase views, interrupts, and resume.
- **Model trace**: every model request is logged locally with status and timing — search and filter to diagnose stuck or failed calls.
- **Computer Use**: let the agent take screenshots, click, type, and control desktop apps after authorization; the native macOS runtime does not take over your physical mouse or keyboard.
- **Desktop pets**: Dada, Huhu, Bubu, and Huihui change what they do with the task at hand — or raise one of your own (off by default).
- **H5 remote access**: scan a QR code to continue the session in your phone browser; locking the screen won't kill a running task.
- **IM integration**: chat, switch projects, and approve actions through Telegram / Feishu / WeChat / DingTalk / WhatsApp / WeCom / QQ / Slack.
- **Scheduled tasks and usage stats**: run planned tasks in their own sessions and track local token usage trends.

---

## More Documentation


| Section | Documents |
|------|------|
| **Getting started** | [What this is](docs/en/start/index.md) · [Download and install](docs/en/start/install.md) · [Connect a model provider](docs/en/start/models.md) · [Your first session](docs/en/start/first-session.md) · [Troubleshooting](docs/en/start/troubleshooting.md) |
| **Desktop features** | [Feature overview](docs/en/desktop/index.md) · [Computer Use](docs/en/desktop/computer-use.md) · [Desktop pets](docs/en/desktop/pets.md) · [Phone H5 and IM relay](docs/en/desktop/remote.md) |
| **IM integrations** | [Overview and pairing](docs/en/im/index.md) · [Feishu](docs/en/im/feishu.md) · [Telegram](docs/en/im/telegram.md) · [WeChat](docs/en/im/wechat.md) · [DingTalk](docs/en/im/dingtalk.md) · [WhatsApp](docs/en/im/whatsapp.md) · [WeCom](docs/en/im/wecom.md) · [QQ](docs/en/im/qq.md) · [Slack](docs/en/im/slack.md) |
| **CLI** | [Install and run](docs/en/cli/index.md) · [Command reference](docs/en/cli/reference.md) · [Environment variables](docs/en/cli/env.md) |
| **Internals** | [Desktop architecture](docs/en/internals/desktop.md) · [Multi-agent system](docs/en/internals/agent.md) · [Skills system](docs/en/internals/skills.md) · [Memory system](docs/en/internals/memory.md) · [Computer Use architecture](docs/en/internals/computer-use.md) · [Local server and API](docs/en/internals/server.md) · [Channel system](docs/en/internals/channel.md) · [Project structure](docs/en/internals/structure.md) · [Contributing and quality gates](docs/en/internals/contributing.md) |

---

## Tech Stack

| Category | Technology |
|------|------|
| Language | TypeScript |
| Desktop app | Electron |
| Desktop UI | React + Vite |
| Local runtime | [Bun](https://bun.sh) |
| Terminal UI | React + [Ink](https://github.com/vadimdemedes/ink) |
| CLI parsing | Commander.js |
| API | Anthropic SDK |
| Protocols | MCP, LSP |

## Acknowledgements

Thanks to the following open-source projects and community practices for reference and inspiration:

- [React](https://github.com/facebook/react): frontend engineering and component-based UI ecosystem.
- [Electron](https://github.com/electron/electron): cross-platform desktop app capabilities and engineering practices.
- [cc-switch](https://github.com/farion1231/cc-switch): reference for model provider configuration.
- [LINUX DO](https://linux.do/): a new ideal developer community.

---

## ⭐ Star History

If this project helps you, please support it with a ⭐ Star.

---

## License

Current terms are the [cc-haha Community Source License 1.0](LICENSE). Noncommercial personal use and internal business operations are allowed; paid client work, commercial deliverables, paid customization or secondary development, commercial distribution, and paid services require prior written commercial permission; redistributions require visible source attribution. Existing MIT grants and third-party licenses remain valid. See the [licensing guide](LICENSING.md). This is source-available, not an OSI-approved open-source license.
