import { visibleWidth } from "@earendil-works/pi-tui";
import { loadConfig, type GhostTextConfig } from "./config.ts";

export interface PredictionContext {
	lastUserMessage?: string;
	lastAssistantMessage?: string;
	lastToolsSummary?: string;
	currentInput?: string;
	signal?: AbortSignal;
}

function shortContext(text: string, limit: number): string {
	const value = text.trim();
	if (value.length <= limit) return value;
	const head = Math.ceil((limit - 5) / 2);
	return `${value.slice(0, head)} ... ${value.slice(-(limit - 5 - head))}`;
}

export class GeminiPredictorClient {
	private config: GhostTextConfig;
	private requestId = 0;
	private lastStatus = "Ready";
	private latencyMs: number | undefined;
	private requests = 0;

	constructor(config?: GhostTextConfig) {
		this.config = { ...(config ?? loadConfig()) };
	}

	updateConfig(config: Partial<GhostTextConfig>): void {
		this.config = { ...this.config, ...config };
		this.requestId++;
		this.lastStatus = "Ready";
		this.latencyMs = undefined;
	}

	getConfig(): GhostTextConfig {
		return { ...this.config };
	}

	getStatus(): { reason: string; latencyMs: number | undefined; requests: number } {
		const reason = !this.config.enabled ? "Disabled" : !this.config.baseUrl ? "Missing base URL" : !this.config.apiKey ? "Missing API key" : this.lastStatus;
		return { reason, latencyMs: this.latencyMs, requests: this.requests };
	}

	async predict(ctx: PredictionContext): Promise<string | null> {
		if (!this.config.enabled || !this.config.baseUrl || !this.config.apiKey || ctx.signal?.aborted) return null;
		const completing = !!ctx.currentInput?.trim();
		const systemPrompt = completing
			? "Predict the exact continuation suffix of the user's input in a coding agent CLI. Do not repeat the input. Keep it brief, under 15 words. Return only the suffix, including necessary leading spaces. No quotes, backticks, markdown, or explanation."
			: "Predict the user's next message in a coding agent CLI. Return only one concise prompt, 2 to 10 words, with no quotes, backticks, or explanation.";
		const instructions = `${systemPrompt} Use the same language as the user's natural-language input. Preserve commands, paths, and code identifiers as written. Return an empty response if the intent is unclear. Do not propose commits, deletions, or other consequential actions unless requested by the user.`;
		const parts: string[] = [];
		if (ctx.lastUserMessage) parts.push(`Previous user request: ${shortContext(ctx.lastUserMessage, 200)}`);
		if (ctx.lastToolsSummary) parts.push(`Tool actions executed: ${shortContext(ctx.lastToolsSummary, 200)}`);
		if (ctx.lastAssistantMessage) parts.push(`Last assistant reply: ${shortContext(ctx.lastAssistantMessage, 300)}`);
		if (completing) parts.push(`User has currently typed: ${JSON.stringify(ctx.currentInput)}`);
		if (!parts.length) return null;

		const id = ++this.requestId;
		const started = Date.now();
		const timeout = AbortSignal.timeout(this.config.timeoutMs);
		const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
		let status = "No suggestion";
		this.lastStatus = "Requesting";
		this.requests++;
		try {
			const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
				body: JSON.stringify({ model: this.config.model, messages: [{ role: "system", content: instructions }, { role: "user", content: parts.join("\n\n") }], temperature: this.config.temperature, max_tokens: this.config.maxTokens }),
				signal,
			});
			if (signal.aborted) {
				status = ctx.signal?.aborted ? "Cancelled" : "Timed out";
				return null;
			}
			if (id !== this.requestId) return null;
			if (!response.ok) {
				status = `HTTP ${response.status}`;
				return null;
			}
			const data = await response.json() as { choices?: { message?: { content?: unknown } }[] } | null;
			const raw = data?.choices?.[0]?.message?.content;
			if (signal.aborted) {
				status = ctx.signal?.aborted ? "Cancelled" : "Timed out";
				return null;
			}
			if (id !== this.requestId) return null;
			if (typeof raw !== "string") {
				status = "Invalid response";
				return null;
			}
			let content = (raw.split(/\r?\n/)[0] ?? "").trimEnd();
			if (content.length >= 2 && ["\"", "'", "`"].includes(content[0]!) && content.at(-1) === content[0]) content = content.slice(1, -1).trimEnd();
			if (completing && ctx.currentInput && content.toLowerCase().startsWith(ctx.currentInput.toLowerCase())) content = content.slice(ctx.currentInput.length);
			if (!completing) content = content.trimStart();
			content = content.replaceAll("\t", "    ");
			if (!content.trim() || visibleWidth(content) === 0 || /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(content)) return null;
			status = "Last request succeeded";
			return content;
		} catch {
			status = ctx.signal?.aborted ? "Cancelled" : timeout.aborted ? "Timed out" : "Request failed";
			return null;
		} finally {
			if (id === this.requestId) {
				this.lastStatus = status;
				this.latencyMs = Date.now() - started;
			}
		}
	}
}
