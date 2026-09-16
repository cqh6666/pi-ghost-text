# pi-ghost-text 👻

为 [Pi Coding Agent](https://github.com/earendil-works/pi-mono) 打造的智能幽灵文本（Ghost Text）行内提示插件，默认由 **Gemini Flash Lite** 极速驱动。

类似于 GitHub Copilot 或 Fish / Zsh Shell 的自动推测：每轮 Agent 输出完毕后，或当你正在输入时，它会智能预测你的下一步意图并以暗灰色显示在输入框光标后。按 <kbd>Tab</kbd> 一键采纳，按 <kbd>Esc</kbd> 忽略。

---

## ✨ 特性

- ⚡ **零抖动行内幽灵文本**：紧跟光标后方渲染暗灰色文本与 `(Tab)` 提示，严格保持终端可见宽度，绝不折行、绝不抖动。
- 🤖 **Gemini Flash Lite 极速驱动**：毫秒级响应，开销微乎其微。自动读取本地已配置的 Gemini 渠道凭据。
- 🎯 **双重预测模式**：
  - **轮末意图推测**：Agent 处理完成（如测试通过、Git 改动产生、报错需修复）后，自动预判下一步操作（如 *"运行单元测试"*、*"查看 git diff"*、*"提交代码"* 等）。
  - **打字续写预测**：打字暂停 350ms 后自动续写补全；若顺着幽灵文本敲击，幽灵文本会逐字精准收缩。
- ⌨️ **丝滑按键交互**：
  - <kbd>Tab</kbd> 或 行尾 <kbd>→</kbd>：一键采纳幽灵文本。
  - <kbd>Esc</kbd>：清除并忽略幽灵文本。
  - 完美兼容原生 `/` 斜杠命令与 `@` 文件补全菜单（下拉菜单呼出时优先处理菜单）。
- 🛡️ **即时中断与智能降级**：用户一开始打字或按键即瞬间 `abort()` 后台请求，绝不卡手；断网或超时（2s）自动走本地启发式规则，零风险保障。

---

## 🚀 安装与配置

### 1. 安装插件

```bash
pi install ../../githubProjects/pi-ghost-text
```

### 2. 渠道与模型配置

插件默认会自动扫描 `~/.pi/agent/models.json` 中的 `gemini` 渠道信息，开箱即用。

如需自定义，可设置环境变量：
```bash
export PI_GHOST_TEXT_MODEL="gemini-3.1-flash-lite"
export GEMINI_API_KEY="sk-..."
export GEMINI_BASE_URL="http://139.199.61.133/v1"
```

### 3. 会话内置命令

- `/ghost-text status` — 查看当前配置状态、模型与连接情况
- `/ghost-text on` — 开启幽灵文本提示
- `/ghost-text off` — 暂时关闭幽灵文本提示
- `/ghost-text model <name>` — 切换预测小模型（如 `gemini-3.1-flash-lite` 或 `gemini-3.8-flash-high`）

### 4. CLI 命令行参数

- `pi --no-ghost-text` — 本次启动不加载幽灵文本提示。

---

## 📄 开源许可

MIT
