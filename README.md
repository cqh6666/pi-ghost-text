# pi-ghost-text 👻

Smart, inline ghost-text prompt suggestions for [Pi Coding Agent](https://github.com/earendil-works/pi-mono), powered by **Gemini Flash Lite**.

Like GitHub Copilot or Fish Shell autocomplete, but for your agent prompts: after every turn or while typing, it intelligently anticipates your next move and displays it as unobtrusive inline gray ghost text. Press <kbd>Tab</kbd> to accept, or <kbd>Esc</kbd> to dismiss.

---

## ✨ Features

- ⚡ **Zero-Flicker Inline Ghost Text**: Injected directly into the input line after the cursor in dim gray text (`(Tab)` indicator), preserving exact layout and terminal column width.
- 🤖 **Powered by Gemini Flash Lite**: Super-fast, sub-second latency, ultra-cheap token usage.
- 🎯 **Dual Prediction Modes**:
  - **Turn-End Suggestions**: When the agent finishes an action (e.g. tests passed, git modified, error occurred), automatically predicts the most logical next action.
  - **Typing Continuation**: As you type, debounces and completes your prompt. If you type matching characters, ghost text shrinks smoothly character-by-character.
- ⌨️ **Intuitive Keybindings**:
  - <kbd>Tab</kbd> or <kbd>→</kbd> (at end of line): Accept ghost text.
  - <kbd>Esc</kbd>: Dismiss ghost text.
  - Seamless coexistence with native `/` slash commands and `@` file autocomplete dropdowns (native autocomplete takes strict priority).
- 🛡️ **Instant Cancellation & Fallback**: Fast timeout (2s) and abort controllers ensure zero typing lag; falls back to smart local heuristics if offline or network fails.

---

## 🚀 Installation & Usage

### 1. Add as Pi Extension

```bash
pi install ../../githubProjects/pi-ghost-text
# or add to ~/.pi/agent/settings.json extensions
```

### 2. Configuration

By default, `pi-ghost-text` automatically reads your configured `gemini` provider from `~/.pi/agent/models.json`.

You can also customize via environment variables:
```bash
export PI_GHOST_TEXT_MODEL="gemini-3.1-flash-lite"
export GEMINI_API_KEY="sk-..."
export GEMINI_BASE_URL="http://139.199.61.133/v1"
```

### 3. In-Session Commands

- `/ghost-text status` — Inspect current configuration and connection status
- `/ghost-text on` — Enable ghost text
- `/ghost-text off` — Disable ghost text
- `/ghost-text model <name>` — Switch predictor model (e.g. `gemini-3.1-flash-lite` or `gemini-3.8-flash-high`)

### 4. CLI Flags

- `pi --no-ghost-text` — Start Pi with ghost text disabled for this session.

---

## 📄 License

MIT
