import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type GhostTextConfig } from "./config.ts";
import { GeminiPredictorClient } from "./gemini-client.ts";
import { GhostTextEditor } from "./editor.ts";

function extractText(message: any): string {
	if (!message) return "";
	if (typeof message.content === "string") return message.content;
	if (Array.isArray(message.content)) {
		return message.content
			.map((block: any) => {
				if (typeof block === "string") return block;
				if (block?.type === "text" && typeof block.text === "string") return block.text;
				return "";
			})
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

function extractToolsSummary(messages: any[]): string {
	const toolNames: string[] = [];
	for (const msg of messages) {
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === "tool_use" || block.type === "tool_call") {
					toolNames.push(block.name || block.function?.name || "tool");
				}
			}
		}
	}
	return toolNames.length > 0 ? `Tools used: ${toolNames.slice(-4).join(", ")}` : "";
}

export default function (pi: ExtensionAPI): void {
	const config: GhostTextConfig = loadConfig();
	const predictor = new GeminiPredictorClient(config);

	let activeEditor: GhostTextEditor | undefined;
	let activeAbortController: AbortController | undefined;
	let typingTimer: NodeJS.Timeout | undefined;

	let lastUserMessage = "";
	let lastAssistantMessage = "";
	let lastToolsSummary = "";

	pi.registerFlag("no-ghost-text", {
		type: "boolean",
		description: "Disable intelligent ghost-text suggestions",
		default: false,
	});

	pi.registerFlag("ghost-text-model", {
		type: "string",
		description: "Specify predictor model for ghost text (e.g. gemini-3.1-flash-lite)",
	});

	pi.registerFlag("ghost-text-mode", {
		type: "string",
		description: "Trigger mode for ghost text (both | turn | typing)",
	});

	function cancelOngoing(): void {
		if (typingTimer) {
			clearTimeout(typingTimer);
			typingTimer = undefined;
		}
		if (activeAbortController) {
			activeAbortController.abort();
			activeAbortController = undefined;
		}
	}

	function handleUserTyping(text: string): void {
		cancelOngoing();

		// Check if enabled or if typing trigger is disabled
		if (!config.enabled || config.triggerMode === "turn") {
			return;
		}

		// Don't predict for slash commands or file autocomplete
		const trimmed = text.trim();
		if (trimmed.startsWith("/") || trimmed.startsWith("@")) {
			return;
		}

		// Enforce minimum character threshold to avoid predicting on single characters
		if (trimmed.length < config.minChars) {
			return;
		}

		typingTimer = setTimeout(async () => {
			if (!activeEditor || activeEditor.getText() !== text) return;

			activeAbortController = new AbortController();
			try {
				const prediction = await predictor.predict({
					currentInput: text,
					lastUserMessage,
					lastAssistantMessage,
					lastToolsSummary,
					signal: activeAbortController.signal,
				});

				if (prediction && activeEditor && activeEditor.getText() === text) {
					activeEditor.setGhostText(prediction);
				}
			} catch {
				// Aborted or network error
			}
		}, config.debounceMs);
	}

	pi.registerCommand("ghost-text", {
		description: "Control or inspect ghost-text suggestions (status | on | off | model <name>)",
		handler: async (args: string, ctx: ExtensionContext) => {
			const sub = (args || "").trim();
			if (!sub || sub === "status") {
				const current = predictor.getConfig();
				const statusMsg = [
					`**Ghost Text Copilot**: ${current.enabled ? "✓ Enabled" : "✗ Disabled"}`,
					`• Model: \`${current.model}\``,
					`• Trigger Mode: \`${current.triggerMode}\` (both | turn | typing)`,
					`• Min Chars: \`${current.minChars}\``,
					`• Base URL: \`${current.baseUrl || "None"}\``,
					`• API Key: \`${current.apiKey ? current.apiKey.slice(0, 8) + "..." : "None"}\``,
					`• Timeout: \`${current.timeoutMs}ms\``,
					`• Debounce: \`${current.debounceMs}ms\``,
					"",
					"Commands:",
					"  `/ghost-text on` - Enable ghost text",
					"  `/ghost-text off` - Disable ghost text",
					"  `/ghost-text mode <both|turn|typing>` - Set trigger mode",
					"  `/ghost-text model <name>` - Set predictor model",
				].join("\n");
				ctx.ui.notify(statusMsg, "info");
				return;
			}

			if (sub === "on") {
				config.enabled = true;
				predictor.updateConfig({ enabled: true });
				ctx.ui.notify("Ghost text suggestions enabled", "info");
				return;
			}

			if (sub === "off") {
				config.enabled = false;
				predictor.updateConfig({ enabled: false });
				cancelOngoing();
				activeEditor?.clearGhostText();
				ctx.ui.notify("Ghost text suggestions disabled", "info");
				return;
			}

			if (sub.startsWith("model ")) {
				const newModel = sub.slice(6).trim();
				if (!newModel) {
					ctx.ui.notify("Please specify a model name, e.g. `/ghost-text model gemini-3.1-flash-lite`", "error");
					return;
				}
				config.model = newModel;
				predictor.updateConfig({ model: newModel });
				ctx.ui.notify(`Ghost text model switched to: ${newModel}`, "info");
				return;
			}

			if (sub.startsWith("mode ")) {
				const newMode = sub.slice(5).trim().toLowerCase();
				if (newMode !== "both" && newMode !== "turn" && newMode !== "typing") {
					ctx.ui.notify("Invalid mode. Use `both`, `turn` (only after agent finishes), or `typing` (only while typing)", "error");
					return;
				}
				config.triggerMode = newMode;
				predictor.updateConfig({ triggerMode: newMode });
				cancelOngoing();
				activeEditor?.clearGhostText();
				ctx.ui.notify(`Ghost text trigger mode set to: ${newMode}`, "info");
				return;
			}

			ctx.ui.notify("Unknown subcommand. Use `/ghost-text status`, `on`, `off`, `mode <both|turn|typing>`, or `model <name>`", "warning");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("no-ghost-text") || !ctx.hasUI) {
			return;
		}

		const modelOverride = pi.getFlag("ghost-text-model");
		if (typeof modelOverride === "string" && modelOverride.trim().length > 0) {
			config.model = modelOverride.trim();
			predictor.updateConfig({ model: config.model });
		}

		const modeOverride = pi.getFlag("ghost-text-mode");
		if (
			typeof modeOverride === "string" &&
			(modeOverride === "both" || modeOverride === "turn" || modeOverride === "typing")
		) {
			config.triggerMode = modeOverride;
			predictor.updateConfig({ triggerMode: modeOverride });
		}

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			activeEditor = new GhostTextEditor(tui, theme, keybindings, undefined, {
				onTextChanged: (text) => {
					handleUserTyping(text);
				},
				onDismiss: () => {
					cancelOngoing();
				},
			});
			return activeEditor;
		});
	});

	pi.on("agent_end", async (event, _ctx) => {
		if (!config.enabled || config.triggerMode === "typing" || !activeEditor) return;

		// Extract context from recent messages
		const userMsgs = event.messages.filter((m: any) => m.role === "user");
		const assistantMsgs = event.messages.filter((m: any) => m.role === "assistant");
		const lastUser = userMsgs[userMsgs.length - 1];
		const lastAssistant = assistantMsgs[assistantMsgs.length - 1];

		lastUserMessage = extractText(lastUser);
		lastAssistantMessage = extractText(lastAssistant);
		lastToolsSummary = extractToolsSummary(event.messages);

		// If user is already typing in the editor, do not overwrite
		if (activeEditor.getText().trim().length > 0) {
			return;
		}

		cancelOngoing();
		activeAbortController = new AbortController();

		try {
			const prediction = await predictor.predict({
				lastUserMessage,
				lastAssistantMessage,
				lastToolsSummary,
				signal: activeAbortController.signal,
			});

			// Only show if editor is STILL empty
			if (prediction && activeEditor && activeEditor.getText().trim().length === 0) {
				activeEditor.setGhostText(prediction);
			}
		} catch {
			// Network error or aborted
		}
	});

	pi.on("input", () => {
		cancelOngoing();
		activeEditor?.clearGhostText();
	});

	pi.on("session_shutdown", () => {
		cancelOngoing();
		activeEditor?.clearGhostText();
		activeEditor = undefined;
	});
}
