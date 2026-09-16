import { loadConfig, type GhostTextConfig } from "./config.ts";

export interface PredictionContext {
	lastUserMessage?: string;
	lastAssistantMessage?: string;
	lastToolsSummary?: string;
	currentInput?: string;
	signal?: AbortSignal;
}

export class GeminiPredictorClient {
	private config: GhostTextConfig;

	constructor(config?: GhostTextConfig) {
		this.config = config ?? loadConfig();
	}

	public updateConfig(newConfig: Partial<GhostTextConfig>): void {
		this.config = { ...this.config, ...newConfig };
	}

	public getConfig(): GhostTextConfig {
		return { ...this.config };
	}

	public async predict(ctx: PredictionContext): Promise<string | null> {
		if (!this.config.enabled) return null;
		if (!this.config.baseUrl || !this.config.apiKey) {
			return this.fallbackHeuristic(ctx);
		}

		const isCompletingInput = Boolean(ctx.currentInput && ctx.currentInput.trim().length > 0);
		const systemPrompt = isCompletingInput
			? "You are a copilot predicting user input in a coding agent CLI. The user is actively typing. Predict the exact continuation/completion of what the user is typing. Return ONLY the continuation suffix text (do NOT repeat what the user already typed). Keep it brief (under 15 words). No quotes, backticks, or markdown."
			: "You are a copilot predicting the user's next message or action in a coding agent CLI. Based on the conversation context, predict the most probable next command, query, or instruction the user would give. Return ONLY a single concise prompt (2 to 10 words). No quotes, backticks, or explanation.";

		// Truncate messages to save tokens and latency
		const truncate = (str: string | undefined, maxChars: number) => {
			if (!str) return "";
			const s = str.trim();
			return s.length > maxChars ? s.slice(-maxChars) : s;
		};

		const contextParts: string[] = [];
		if (ctx.lastUserMessage) {
			contextParts.push(`Previous user request: ${truncate(ctx.lastUserMessage, 200)}`);
		}
		if (ctx.lastToolsSummary) {
			contextParts.push(`Tool actions executed: ${truncate(ctx.lastToolsSummary, 200)}`);
		}
		if (ctx.lastAssistantMessage) {
			contextParts.push(`Last assistant reply: ${truncate(ctx.lastAssistantMessage, 300)}`);
		}
		if (isCompletingInput) {
			contextParts.push(`User has currently typed: "${ctx.currentInput}"`);
		}

		const userContent = contextParts.join("\n\n");
		if (!userContent) {
			return null;
		}

		try {
			const timeoutSignal = AbortSignal.timeout(this.config.timeoutMs);
			const combinedSignal = ctx.signal ? AbortSignal.any([ctx.signal, timeoutSignal]) : timeoutSignal;

			const url = `${this.config.baseUrl}/chat/completions`;
			const resp = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.config.apiKey}`,
				},
				body: JSON.stringify({
					model: this.config.model,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: userContent },
					],
					temperature: this.config.temperature,
					max_tokens: this.config.maxTokens,
				}),
				signal: combinedSignal,
			});

			if (!resp.ok) {
				return this.fallbackHeuristic(ctx);
			}

			const data = (await resp.json()) as any;
			let content = data?.choices?.[0]?.message?.content;
			if (typeof content !== "string") return null;

			// Clean up output
			content = content.trim();
			content = content.replace(/^["'`]+|["'`]+$/g, "").trim();
			// Take first line only
			content = content.split("\n")[0]?.trim() || "";

			// If completing input and model repeated what user typed, strip user typed prefix
			if (isCompletingInput && ctx.currentInput) {
				const input = ctx.currentInput;
				if (content.toLowerCase().startsWith(input.toLowerCase())) {
					content = content.slice(input.length);
				}
			}

			return content || null;
		} catch {
			return this.fallbackHeuristic(ctx);
		}
	}

	private fallbackHeuristic(ctx: PredictionContext): string | null {
		const assistant = (ctx.lastAssistantMessage || "").toLowerCase();
		const typed = ctx.currentInput || "";

		if (!typed) {
			if (assistant.includes("fail") || assistant.includes("error") || assistant.includes("失败") || assistant.includes("报错")) {
				return "修复报错并重新测试";
			}
			if (assistant.includes("test") || assistant.includes("测试") || assistant.includes("passed")) {
				return "git status";
			}
			if (assistant.includes("git") || assistant.includes("modified") || assistant.includes("修改")) {
				return "查看改动 diff";
			}
			return "继续下一步";
		}

		// When typing
		if (typed === "g" || typed === "git") {
			return " status";
		}
		if (typed === "npm" || typed === "npm ") {
			return "run check";
		}
		if (typed === "查看") {
			return " git diff";
		}
		if (typed === "修复") {
			return "当前报错";
		}
		return null;
	}
}
