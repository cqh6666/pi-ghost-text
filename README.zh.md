# pi-ghost-text 👻

为 [Pi Coding Agent](https://github.com/earendil-works/pi-mono) 打造的智能幽灵文本（Ghost Text）行内提示插件，默认由 **Gemini Flash Lite** 极速驱动。

类似于 GitHub Copilot 或 Fish / Zsh Shell 的自动推测：每轮 Agent 输出完毕后，或当你正在输入时，它会智能预测你的下一步意图并以暗灰色显示在输入框光标后。按 <kbd>Tab</kbd> 一键采纳，按 <kbd>Esc</kbd> 忽略。

---

## ✨ 特性

- ⚡ **零抖动行内幽灵文本**：紧跟光标后方渲染暗灰色纯净文本，严格保持终端可见宽度，绝不折行、绝不抖动。
- 🤖 **Gemini Flash Lite 极速驱动**：毫秒级响应，开销微乎其微。自动读取本地已配置的 Gemini 渠道凭据。
- 🎯 **灵活低频防抖机制**：
  - **轮末意图推测**：Agent 处理完成（如测试通过、Git 改动产生、报错需修复）后，自动预判下一步操作（如 *"运行单元测试"*、*"查看 git diff"*、*"提交代码"* 等）。
  - **防抖打字续写**：打字停顿超过 **700ms** 且字符数达到 **3 字以上**才触发，绝不在单字母或构思时乱刷请求。
  - **智能忽略命令**：以 `/` 或 `@` 开头时自动跳过模型调用，走原生本地补全。
  - **顺打零请求收缩**：顺着幽灵文本输入字符时，幽灵文本在本地逐字精准收缩，不发任何网络请求。
- ⌨️ **丝滑按键交互**：
  - <kbd>Tab</kbd> 或 行尾 <kbd>→</kbd>：一键采纳幽灵文本。
  - <kbd>Esc</kbd>：清除并忽略幽灵文本。
  - 完美兼容原生 `/` 斜杠命令与 `@` 文件补全菜单（下拉菜单呼出时优先处理菜单）。
- 🛡️ **即时中断与智能降级**：用户敲击按键即瞬间 `abort()` 后台请求，绝不卡手；断网或超时（2s）自动走本地启发式规则，零风险保障。

---

## 🚀 安装与配置

### 1. 安装插件

```bash
pi install ../../githubProjects/pi-ghost-text
```

### 2. 渠道与模型配置

插件默认会自动扫描 `~/.pi/agent/models.json` 中的 `gemini` 渠道信息，开箱即用。

也可以在 `~/.pi/agent/settings.json` 中配置：
```json
{
  "ghostText": {
    "model": "gemini-3.1-flash-lite",
    "triggerMode": "both",
    "debounceMs": 700,
    "minChars": 3
  }
}
```

如需环境变量自定义：
```bash
export PI_GHOST_TEXT_MODEL="gemini-3.1-flash-lite"
export PI_GHOST_TEXT_TRIGGER_MODE="both"  # both | turn | typing
export GEMINI_API_KEY="sk-..."
export GEMINI_BASE_URL="http://139.199.61.133/v1"
```

### 3. 会话内置命令

- `/ghost-text status` — 查看当前配置状态、模型、触发模式与连接情况
- `/ghost-text mode <both|turn|typing>` — 调整触发模式：
  - `turn`: 仅在 Agent 每轮回答完毕后推测下一步（最省资源，每轮固定 1 次）
  - `typing`: 仅在打字停顿思考时续写
  - `both`: 轮末建议 + 打字续写（默认）
- `/ghost-text on` — 开启幽灵文本提示
- `/ghost-text off` — 暂时关闭幽灵文本提示
- `/ghost-text model <name>` — 切换预测小模型（如 `gemini-3.1-flash-lite` 或 `gemini-3.8-flash-high`）

### 4. CLI 命令行参数

- `pi --no-ghost-text` — 本次启动不加载幽灵文本提示。
- `pi --ghost-text-mode <both|turn|typing>` — 指定本次启动的触发模式。
- `pi --ghost-text-model <model>` — 指定本次启动的预测模型。

---

## 📄 开源许可

MIT
