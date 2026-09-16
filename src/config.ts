import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type TriggerMode = "both" | "turn" | "typing";

export interface GhostTextConfig {
	enabled: boolean;
	model: string;
	baseUrl: string;
	apiKey: string;
	temperature: number;
	maxTokens: number;
	timeoutMs: number;
	debounceMs: number;
	minChars: number;
	triggerMode: TriggerMode;
}

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_DEBOUNCE_MS = 700;
const DEFAULT_MIN_CHARS = 3;
const DEFAULT_TRIGGER_MODE: TriggerMode = "both";

function resolveAgentDir(): string {
	if (process.env.PI_AGENT_DIR) return process.env.PI_AGENT_DIR;
	if (process.env.PI_HOME) return path.join(process.env.PI_HOME, "agent");
	return path.join(os.homedir(), ".pi", "agent");
}

export function loadConfig(): GhostTextConfig {
	let baseUrl = "";
	let apiKey = "";
	let model = DEFAULT_MODEL;
	let enabled = true;
	let temperature = 0.2;
	let maxTokens = 30;
	let timeoutMs = DEFAULT_TIMEOUT_MS;
	let debounceMs = DEFAULT_DEBOUNCE_MS;
	let minChars = DEFAULT_MIN_CHARS;
	let triggerMode = DEFAULT_TRIGGER_MODE;

	const agentDir = resolveAgentDir();

	// 1. Read settings.json if present
	try {
		const settingsPath = path.join(agentDir, "settings.json");
		if (fs.existsSync(settingsPath)) {
			const raw = fs.readFileSync(settingsPath, "utf-8");
			const parsed = JSON.parse(raw);
			const ghostSettings = parsed?.ghostText;
			if (ghostSettings && typeof ghostSettings === "object") {
				if (typeof ghostSettings.model === "string" && ghostSettings.model) {
					model = ghostSettings.model;
				}
				if (typeof ghostSettings.enabled === "boolean") {
					enabled = ghostSettings.enabled;
				}
				if (typeof ghostSettings.baseUrl === "string" && ghostSettings.baseUrl) {
					baseUrl = ghostSettings.baseUrl;
				}
				if (typeof ghostSettings.apiKey === "string" && ghostSettings.apiKey) {
					apiKey = ghostSettings.apiKey;
				}
				if (typeof ghostSettings.temperature === "number") {
					temperature = ghostSettings.temperature;
				}
				if (typeof ghostSettings.maxTokens === "number") {
					maxTokens = ghostSettings.maxTokens;
				}
				if (typeof ghostSettings.timeoutMs === "number") {
					timeoutMs = ghostSettings.timeoutMs;
				}
				if (typeof ghostSettings.debounceMs === "number") {
					debounceMs = ghostSettings.debounceMs;
				}
				if (typeof ghostSettings.minChars === "number") {
					minChars = ghostSettings.minChars;
				}
				if (
					ghostSettings.triggerMode === "both" ||
					ghostSettings.triggerMode === "turn" ||
					ghostSettings.triggerMode === "typing"
				) {
					triggerMode = ghostSettings.triggerMode;
				}
			}
		}
	} catch {
		// Ignore read errors
	}

	// 2. Read from models.json if baseUrl or apiKey not provided yet
	if (!baseUrl || !apiKey) {
		try {
			const modelsPath = path.join(agentDir, "models.json");
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

	// 3. Environment variables take highest precedence
	if (process.env.PI_GHOST_TEXT_BASE_URL || process.env.GEMINI_BASE_URL) {
		baseUrl = (process.env.PI_GHOST_TEXT_BASE_URL || process.env.GEMINI_BASE_URL)!;
	}
	if (process.env.PI_GHOST_TEXT_API_KEY || process.env.GEMINI_API_KEY) {
		apiKey = (process.env.PI_GHOST_TEXT_API_KEY || process.env.GEMINI_API_KEY)!;
	}
	if (process.env.PI_GHOST_TEXT_MODEL) {
		model = process.env.PI_GHOST_TEXT_MODEL;
	}
	if (process.env.PI_GHOST_TEXT_TRIGGER_MODE) {
		const m = process.env.PI_GHOST_TEXT_TRIGGER_MODE.toLowerCase();
		if (m === "both" || m === "turn" || m === "typing") {
			triggerMode = m;
		}
	}
	if (process.env.PI_GHOST_TEXT_DEBOUNCE_MS) {
		const val = Number.parseInt(process.env.PI_GHOST_TEXT_DEBOUNCE_MS, 10);
		if (!Number.isNaN(val) && val > 0) debounceMs = val;
	}
	if (process.env.PI_GHOST_TEXT_MIN_CHARS) {
		const val = Number.parseInt(process.env.PI_GHOST_TEXT_MIN_CHARS, 10);
		if (!Number.isNaN(val) && val > 0) minChars = val;
	}
	if (process.env.PI_GHOST_TEXT_ENABLED !== undefined) {
		enabled = process.env.PI_GHOST_TEXT_ENABLED !== "false";
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
		temperature,
		maxTokens,
		timeoutMs,
		debounceMs,
		minChars,
		triggerMode,
	};
}
