import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, saveConfig } from "./config.ts";
import { PredictionCache } from "./prediction-cache.ts";
import { GhostTextEditor } from "./editor.ts";
import { GeminiPredictorClient, type PredictionContext } from "./gemini-client.ts";

type EditorFactory = NonNullable<Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]>;

export default function (pi: ExtensionAPI): void {
	const config = loadConfig();
	const predictor = new GeminiPredictorClient(config);
	const cache = new PredictionCache();
	let cacheHits = 0;
	let dismissedInput: string | undefined;
	let editor: GhostTextEditor | undefined;
	let factory: EditorFactory | undefined;
	let context: ExtensionContext | undefined;
	let dialogue: PredictionContext = {};
	let controller: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let requestId = 0;
	let pausedReason = "";

	function cancel(): void {
		requestId++;
		if (timer) clearTimeout(timer);
		timer = undefined;
		controller?.abort();
		controller = undefined;
	}

	function resetSuggestions(): void {
		cancel();
		cache.clear();
		dismissedInput = undefined;
	}

	function dismiss(): void {
		cancel();
		cache.clear();
		dismissedInput = editor?.getText();
	}

	function ownsEditor(): boolean {
		return !!context && !!factory && context.ui.getEditorComponent() === factory;
	}

	function canPredict(text: string): boolean {
		return config.enabled && !!editor && ownsEditor() && !!context?.isIdle() && editor.canSuggest() && editor.getText() === text;
	}

	async function predict(text: string): Promise<void> {
		if (!canPredict(text)) return;
		const id = requestId;
		const abort = new AbortController();
		controller = abort;
		const prediction = await predictor.predict({ ...dialogue, currentInput: text || undefined, signal: abort.signal });
		if (!abort.signal.aborted && id === requestId && prediction && canPredict(text)) {
			cache.set(text, prediction);
			editor?.setGhostText(prediction);
		}
		if (controller === abort) controller = undefined;
	}

	function typing(text: string): void {
		cancel();
		const trimmed = text.trim();
		if (config.triggerMode === "turn" || !canPredict(text) || editor?.getGhostText() || trimmed.length < config.minChars || trimmed.startsWith("/") || trimmed.startsWith("@")) return;
		if (text === dismissedInput) return;
		const cached = cache.get(text);
		if (cached) {
			cacheHits++;
			editor?.setGhostText(cached);
			return;
		}
		timer = setTimeout(() => { timer = undefined; void predict(text); }, config.debounceMs);
	}

	function installEditor(ctx: ExtensionContext): void {
		context = ctx;
		if (!config.enabled || ctx.mode !== "tui" || !ctx.hasUI) return;
		const existing = ctx.ui.getEditorComponent();
		if (existing && existing !== factory) {
			pausedReason = "Paused: another extension owns the editor";
			return;
		}
		pausedReason = "";
		factory = (tui, theme, keybindings) => {
			editor = new GhostTextEditor(tui, theme, keybindings, { styleGhost: (text) => ctx.ui.theme.fg("muted", text) }, {
				onTextChanged: typing,
				onDismiss: dismiss,
				onInvalidate: cancel,
				onAccept: resetSuggestions,
			});
			return editor;
		};
		ctx.ui.setEditorComponent(factory);
	}

	function stopEditor(): void {
		resetSuggestions();
		editor?.clearGhostText();
		if (ownsEditor()) context?.ui.setEditorComponent(undefined);
		editor = undefined;
		factory = undefined;
	}

	pi.registerFlag("no-ghost-text", { type: "boolean", description: "Disable ghost-text suggestions", default: false });
	pi.registerFlag("ghost-text-model", { type: "string", description: "Predictor model" });
	pi.registerFlag("ghost-text-mode", { type: "string", description: "Trigger mode: both | turn | typing" });

	pi.registerCommand("ghost-text", {
		description: "Ghost-text status | on | off | mode <both|turn|typing> | model <name> | debounce <ms> | save",
		handler: async (args, ctx) => {
			const sub = args.trim();
			if (!sub || sub === "status") {
				const status = predictor.getStatus();
				const reason = config.enabled && factory && !ownsEditor() ? "Paused: another extension owns the editor" : pausedReason || status.reason;
				ctx.ui.notify([
					`Ghost Text: ${config.enabled ? "Enabled" : "Disabled"}`,
					`Status: ${reason}`,
					`Model: ${config.model}`,
					`Trigger mode: ${config.triggerMode}`,
					`Min chars: ${config.minChars}`,
					`Timeout: ${config.timeoutMs}ms`,
					`Debounce: ${config.debounceMs}ms`,
					`Requests: ${status.requests}`,
					`Cache hits: ${cacheHits}`,
					...(status.latencyMs === undefined ? [] : [`Last request: ${status.latencyMs}ms`]),
				].join("\n"), "info");
				return;
			}
			if (sub === "save") {
				try { ctx.ui.notify(`Ghost text preferences saved to ${saveConfig(config)}`, "info"); }
				catch { ctx.ui.notify("Could not save ghost text preferences; existing settings were not changed", "error"); }
				return;
			}
			if (sub.startsWith("debounce ")) {
				const value = Number(sub.slice(9).trim());
				if (!Number.isSafeInteger(value) || value < 100 || value > 5000) { ctx.ui.notify("Debounce must be an integer from 100 to 5000 milliseconds", "error"); return; }
				config.debounceMs = value;
				predictor.updateConfig({ debounceMs: value });
				resetSuggestions();
				editor?.clearGhostText();
				ctx.ui.notify(`Ghost text debounce: ${value}ms`, "info");
				return;
			}
			if (sub === "on" || sub === "off") {
				config.enabled = sub === "on";
				predictor.updateConfig({ enabled: config.enabled });
				stopEditor();
				if (config.enabled) installEditor(ctx);
				else pausedReason = "";
				ctx.ui.notify(config.enabled ? pausedReason || "Ghost text enabled" : "Ghost text disabled", "info");
				return;
			}
			if (sub.startsWith("mode ")) {
				const mode = sub.slice(5).trim();
				if (mode !== "both" && mode !== "turn" && mode !== "typing") {
					ctx.ui.notify("Mode must be both, turn, or typing", "error");
					return;
				}
				config.triggerMode = mode;
				predictor.updateConfig({ triggerMode: mode });
				resetSuggestions();
				editor?.clearGhostText();
				ctx.ui.notify(`Ghost text mode: ${mode}`, "info");
				return;
			}
			if (sub.startsWith("model ")) {
				const model = sub.slice(6).trim();
				if (!model) {
					ctx.ui.notify("Specify a model name", "error");
					return;
				}
				config.model = model;
				predictor.updateConfig({ model });
				resetSuggestions();
				editor?.clearGhostText();
				ctx.ui.notify(`Ghost text model: ${model}`, "info");
				return;
			}
			ctx.ui.notify("Use /ghost-text status, on, off, mode <both|turn|typing>, model <name>, debounce <ms>, or save", "warning");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		resetSuggestions();
		dialogue = buildContext(ctx.sessionManager.getBranch().filter((entry) => entry.type === "message").map((entry) => entry.message));
		if (pi.getFlag("no-ghost-text")) config.enabled = false;
		const model = pi.getFlag("ghost-text-model");
		if (typeof model === "string" && model.trim()) config.model = model.trim();
		const mode = pi.getFlag("ghost-text-mode");
		if (mode === "both" || mode === "turn" || mode === "typing") config.triggerMode = mode;
		predictor.updateConfig(config);
		installEditor(ctx);
	});

	pi.on("agent_start", () => { resetSuggestions(); editor?.clearGhostText(); });
	pi.on("agent_end", (event) => { resetSuggestions(); editor?.clearGhostText(); dialogue = buildContext(event.messages); });
	pi.on("agent_settled", () => {
		if (config.triggerMode !== "typing" && editor?.getText() === "") { cancel(); void predict(""); }
	});
	pi.on("input", () => { resetSuggestions(); editor?.clearGhostText(); });
	pi.on("session_tree", (_event, ctx) => {
		resetSuggestions();
		editor?.clearGhostText();
		dialogue = buildContext(ctx.sessionManager.getBranch().filter((entry) => entry.type === "message").map((entry) => entry.message));
	});
	pi.on("session_shutdown", () => { stopEditor(); context = undefined; dialogue = {}; });
}

function buildContext(messages: readonly AgentMessage[]): PredictionContext {
	let lastUserMessage = "";
	let lastAssistantMessage = "";
	const tools: string[] = [];
	for (const message of messages) {
		if (message.role === "user" || message.role === "assistant") {
			const text = typeof message.content === "string" ? message.content : message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
			if (message.role === "user") lastUserMessage = text;
			else {
				if (text) lastAssistantMessage = text;
				for (const block of message.content) if (block.type === "toolCall") tools.push(block.name);
			}
		}
	}
	return { lastUserMessage, lastAssistantMessage, lastToolsSummary: tools.slice(-4).join(", ") };
}
