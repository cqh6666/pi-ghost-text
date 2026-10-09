# Pi Ghost Text

Inline prompt continuations and next-message suggestions for the Pi coding agent, using a configured OpenAI-compatible predictor endpoint. [中文文档](./README.zh.md)

## Install

```bash
pi install /absolute/path/to/pi-ghost-text
```

For a one-off session:

```bash
pi -e /absolute/path/to/pi-ghost-text/src/index.ts
```

Configure `PI_GHOST_TEXT_BASE_URL` and `PI_GHOST_TEXT_API_KEY`, or provide `ghostText.baseUrl` / `ghostText.apiKey` in Pi's agent `settings.json`. The extension can also read the `gemini` provider in `models.json`. The endpoint must support `POST /chat/completions`; a native Gemini endpoint is not OpenAI-compatible.

## Input

- `Tab` or `Right`: accept the entire visible suggestion.
- `Alt+Right`, `Ctrl+Right`, or `Alt+F`: accept one word, retaining the rest. Chinese text uses word segmentation.
- `Escape`: dismiss a visible suggestion. With no visible suggestion, Pi retains its normal interrupt behavior.
- Typing a matching prefix consumes the suggestion locally; backspace can restore a cached suffix.
- Moving away from the end, opening native completion, changing dialogue/model/mode, submitting input, or ending the session invalidates suggestions or pending requests.

These keys follow Pi's configured actions: `tui.input.tab`, `tui.editor.cursorRight`, `tui.editor.cursorWordRight`, `app.interrupt`, and `tui.editor.undo`. Kitty keyboard encodings are supported. Accepting text is an atomic undo operation using Pi's configured undo key (default `Ctrl+-`).

Suggestions require an end-of-input cursor and enough space to display a preview. A preview may end in `...` when shortened; whole acceptance still inserts the full suggestion. Use word acceptance to insert less. Colors follow the current theme.

Native slash commands, `@` references, and explicit paths take priority over model completion. Version numbers and decimals do not disable predictions.

## Commands

```text
/ghost-text status
/ghost-text on
/ghost-text off
/ghost-text mode both
/ghost-text mode turn
/ghost-text mode typing
/ghost-text model gemini-3.1-flash-lite
/ghost-text debounce 400
/ghost-text save
```

Commands change the current session only. `save` explicitly writes current preferences to Pi's agent `settings.json`, preserving unrelated settings and existing credentials. It does not copy active API keys or endpoint overrides into that file. Environment variables and CLI flags continue to override saved preferences.

`status` shows why predictions are unavailable, request count, cache hits, and the latest measured request duration. It never prints API keys. Missing credentials, request errors, timeouts, and cancellation produce no suggestion; there is no heuristic fallback.

## Settings

```json
{
  "ghostText": {
    "enabled": true,
    "model": "gemini-3.1-flash-lite",
    "triggerMode": "both",
    "debounceMs": 400,
    "minChars": 3,
    "timeoutMs": 2000,
    "maxTokens": 30,
    "temperature": 0.2
  }
}
```

`turn` predicts after the agent settles. `typing` predicts after input stops changing. `both` enables both triggers. All modes refresh conversation and tool context.

The bounded in-memory cache holds at most 32 entries for 30 seconds. It is cleared when context or predictor settings change and when a suggestion is dismissed or accepted. It is never persisted.

Environment options: `PI_GHOST_TEXT_ENABLED`, `PI_GHOST_TEXT_MODEL`, `PI_GHOST_TEXT_BASE_URL`, `PI_GHOST_TEXT_API_KEY`, `PI_GHOST_TEXT_TRIGGER_MODE`, `PI_GHOST_TEXT_DEBOUNCE_MS`, `PI_GHOST_TEXT_MIN_CHARS`. `GEMINI_BASE_URL` and `GEMINI_API_KEY` are alternate credential sources.

CLI options: `--no-ghost-text`, `--ghost-text-model <name>`, `--ghost-text-mode <both|turn|typing>`.

## Editor Compatibility

Inline suggestions use a custom editor. If another extension already owns the editor, ghost text pauses and reports this in `status` instead of replacing it. If another editor is installed later, predictions pause; disabling ghost text does not remove that editor. This protects Vim-style editors but does not compose two editor implementations. Disable ghost text or disable the other custom editor before enabling inline suggestions. Only TUI mode installs an editor.

## Development

```bash
npm install --ignore-scripts
npm run check
```

Checks include TypeScript and isolated tests with simulated fetch responses; they require no real provider credentials. Delay tests compare 300, 400, and 700ms debounce with a simulated 120ms request. These are controlled timing tests, not measurements of a live service.
