import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface GhostTextConfig {
	enabled: boolean;
	model: string;
	baseUrl: string;
	apiKey: string;
	temperature: number;
	maxTokens: number;
	timeoutMs: number;
	debounceMs: number;
}

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_DEBOUNCE_MS = 350;

function resolveAgentDir(): string {
	if (process.env.PI_AGENT_DIR) return process.env.PI_AGENT_DIR;
	if (process.env.PI_HOME) return path.join(process.env.PI_HOME, "agent");
	return path.join(os.homedir(), ".pi", "agent");
}

export function loadConfig(): GhostTextConfig {
	let baseUrl = process.env.PI_GHOST_TEXT_BASE_URL || process.env.GEMINI_BASE_URL || "";
	let apiKey = process.env.PI_GHOST_TEXT_API_KEY || process.env.GEMINI_API_KEY || "";
	let model = process.env.PI_GHOST_TEXT_MODEL || DEFAULT_MODEL;
	let enabled = process.env.PI_GHOST_TEXT_ENABLED !== "false";

	// If missing baseUrl or apiKey, attempt reading from ~/.pi/agent/models.json
	if (!baseUrl || !apiKey) {
		try {
			const modelsPath = path.join(resolveAgentDir(), "models.json");
			if (fs.existsSync(modelsPath)) {
				const raw = fs.readFileSync(modelsPath, "utf-8");
				const parsed = JSON.parse(raw);
				const geminiProvider = parsed?.providers?.gemini;
				if (geminiProvider) {
					if (!baseUrl && geminiProvider.baseUrl) {
						baseUrl = geminiProvider.baseUrl;
					}
					if (!apiKey && geminiProvider.apiKey) {
						apiKey = geminiProvider.apiKey;
					}
				}
			}
		} catch {
			// Ignore read errors, fall back to defaults
		}
	}

	// Normalize baseUrl
	if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
		baseUrl = `http://${baseUrl}`;
	}
	if (baseUrl.endsWith("/")) {
		baseUrl = baseUrl.slice(0, -1);
	}

	return {
		enabled,
		model,
		baseUrl,
		apiKey,
		temperature: 0.2,
		maxTokens: 30,
		timeoutMs: DEFAULT_TIMEOUT_MS,
		debounceMs: DEFAULT_DEBOUNCE_MS,
	};
}
