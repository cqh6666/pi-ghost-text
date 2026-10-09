# Pi Ghost Text

为 Pi 编码代理提供输入续写和下一条消息建议，通过已配置的 OpenAI 兼容预测接口生成。[English](./README.md)

## 安装

```bash
pi install /absolute/path/to/pi-ghost-text
```

也可仅在一次会话中加载：

```bash
pi -e /absolute/path/to/pi-ghost-text/src/index.ts
```

配置 `PI_GHOST_TEXT_BASE_URL` 和 `PI_GHOST_TEXT_API_KEY`，或在 Pi 的 agent `settings.json` 中设置 `ghostText.baseUrl`、`ghostText.apiKey`。也可读取 `models.json` 的 `gemini` provider。接口必须支持 `POST /chat/completions`；Gemini 原生接口并非 OpenAI 兼容接口。

## 输入操作

- `Tab` 或 `→`：采纳整段可见建议。
- `Alt+→`、`Ctrl+→` 或 `Alt+F`：采纳一个词，保留剩余建议。中文使用分词，而非按空格切分。
- `Esc`：忽略可见建议。没有可见建议时，保留 Pi 原有的中断行为。
- 输入与建议前缀一致时，在本地缩短建议；退格可立即恢复缓存中的续写。
- 光标离开末尾、原生补全打开、对话或模型变化、提交输入及结束会话时，会使建议或待处理请求失效。

按键跟随 Pi 的配置动作：`tui.input.tab`、`tui.editor.cursorRight`、`tui.editor.cursorWordRight`、`app.interrupt` 和 `tui.editor.undo`，兼容 Kitty 键盘编码。采纳是一次可撤销的操作；撤销使用 Pi 配置的按键，默认 `Ctrl+-`。

仅当光标位于输入末尾、右侧空间足够显示预览时，才允许采纳。预览过长时会用省略号显示，整段采纳仍插入完整建议；需要更细的控制时使用按词采纳。颜色跟随当前主题。

原生斜杠命令、`@` 引用和明确的路径输入优先，不触发模型补全。版本号、小数等普通输入不会仅因包含 `.` 而被屏蔽。

## 命令

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

命令默认只影响当前会话。`save` 显式把当前偏好保存到 Pi 的 agent `settings.json`，保留其他设置及原有凭据，不把当前 API key 或接口覆盖值复制进去。环境变量及命令行参数仍优先于已保存的偏好。

`status` 显示不可用原因、请求数、缓存命中数和最近一次请求耗时，不显示密钥。缺少凭据、请求失败、超时或取消时，不显示建议；不再生成本地规则兜底建议。

## 配置

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

`turn` 在代理完成本轮工作后预测下一条消息；`typing` 在停止输入后续写；`both` 同时启用。所有模式都会更新对话及工具上下文。

内存缓存最多保留 32 条建议，30 秒过期。对话或预测设置改变、忽略或采纳建议时清空，不写入磁盘。

环境变量：`PI_GHOST_TEXT_ENABLED`、`PI_GHOST_TEXT_MODEL`、`PI_GHOST_TEXT_BASE_URL`、`PI_GHOST_TEXT_API_KEY`、`PI_GHOST_TEXT_TRIGGER_MODE`、`PI_GHOST_TEXT_DEBOUNCE_MS`、`PI_GHOST_TEXT_MIN_CHARS`。也支持 `GEMINI_BASE_URL`、`GEMINI_API_KEY` 作为凭据来源。

命令行参数：`--no-ghost-text`、`--ghost-text-model <name>`、`--ghost-text-mode <both|turn|typing>`。

## 编辑器兼容

行内建议需要使用自定义编辑器。如果其他扩展已经接管编辑器，Ghost Text 会暂停并在 `status` 提示，不替换它。如果其他编辑器随后接管，预测也会暂停；关闭 Ghost Text 不会移除该编辑器。这能保护 Vim 等编辑器，但不代表两个编辑器可以叠加。启用行内建议前，应关闭 Ghost Text 或另一自定义编辑器。仅 TUI 模式安装编辑器。

## 开发

```bash
npm install --ignore-scripts
npm run check
```

检查包括 TypeScript 和隔离测试，使用模拟接口，不需要真实模型凭据。延迟测试比较 300、400、700ms 防抖配合模拟 120ms 请求的表现，不代表真实服务的网络延迟。
