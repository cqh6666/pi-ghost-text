import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
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

export function loadConfig(): GhostTextConfig {
	const config: GhostTextConfig = {
		enabled: true, model: "gemini-3.1-flash-lite", baseUrl: "", apiKey: "",
		temperature: 0.2, maxTokens: 30, timeoutMs: 2000, debounceMs: 400, minChars: 3, triggerMode: "both",
	};
	const dir = resolveAgentDir();
	try {
		const settings = readRecord(path.join(dir, "settings.json"));
		if (isRecord(settings.ghostText)) {
			const ghost = settings.ghostText;
			for (const key of ["model", "baseUrl", "apiKey"] as const) {
				if (typeof ghost[key] === "string" && ghost[key].trim()) config[key] = ghost[key];
			}
			if (typeof ghost.enabled === "boolean") config.enabled = ghost.enabled;
			if (isMode(ghost.triggerMode)) config.triggerMode = ghost.triggerMode;
			for (const key of ["maxTokens", "timeoutMs", "debounceMs", "minChars"] as const) {
				if (positiveInteger(ghost[key])) config[key] = ghost[key];
			}
			if (typeof ghost.temperature === "number" && Number.isFinite(ghost.temperature) && ghost.temperature >= 0 && ghost.temperature <= 2) config.temperature = ghost.temperature;
		}
	} catch {
		// Invalid or missing settings must not prevent the editor from starting.
	}
	if (!config.baseUrl || !config.apiKey) {
		try {
			const models = readRecord(path.join(dir, "models.json"));
			const providers = isRecord(models.providers) ? models.providers : {};
			const gemini = isRecord(providers.gemini) ? providers.gemini : {};
			if (!config.baseUrl && typeof gemini.baseUrl === "string") config.baseUrl = gemini.baseUrl;
			if (!config.apiKey && typeof gemini.apiKey === "string") config.apiKey = gemini.apiKey;
		} catch {
			// Missing credentials leave predictions disabled without local suggestions.
		}
	}
	config.baseUrl = process.env.PI_GHOST_TEXT_BASE_URL || process.env.GEMINI_BASE_URL || config.baseUrl;
	config.apiKey = process.env.PI_GHOST_TEXT_API_KEY || process.env.GEMINI_API_KEY || config.apiKey;
	config.model = process.env.PI_GHOST_TEXT_MODEL || config.model;
	const mode = process.env.PI_GHOST_TEXT_TRIGGER_MODE?.toLowerCase();
	if (isMode(mode)) config.triggerMode = mode;
	for (const [key, name] of [["debounceMs", "PI_GHOST_TEXT_DEBOUNCE_MS"], ["minChars", "PI_GHOST_TEXT_MIN_CHARS"]] as const) {
		const value = Number(process.env[name]);
		if (positiveInteger(value)) config[key] = value;
	}
	if (process.env.PI_GHOST_TEXT_ENABLED) config.enabled = process.env.PI_GHOST_TEXT_ENABLED !== "false";
	config.baseUrl = config.baseUrl.trim();
	if (config.baseUrl && !/^https?:\/\//.test(config.baseUrl)) config.baseUrl = `http://${config.baseUrl}`;
	config.baseUrl = config.baseUrl.replace(/\/+$/, "");
	return config;
}

export function saveConfig(config: GhostTextConfig): string {
	const dir = resolveAgentDir();
	const destination = path.join(dir, "settings.json");
	const settings = fs.existsSync(destination) ? readRecord(destination) : {};
	const ghost = isRecord(settings.ghostText) ? settings.ghostText : {};
	const { enabled, model, temperature, maxTokens, timeoutMs, debounceMs, minChars, triggerMode } = config;
	settings.ghostText = { ...ghost, enabled, model, temperature, maxTokens, timeoutMs, debounceMs, minChars, triggerMode };
	fs.mkdirSync(dir, { recursive: true });
	const temporary = path.join(dir, `.ghost-text-${randomUUID()}.tmp`);
	try {
		fs.writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600, flag: "wx" });
		fs.renameSync(temporary, destination);
	} finally {
		if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
	}
	return destination;
}

function resolveAgentDir(): string {
	if (process.env.PI_CODING_AGENT_DIR) return getAgentDir();
	return process.env.PI_AGENT_DIR || (process.env.PI_HOME ? path.join(process.env.PI_HOME, "agent") : getAgentDir());
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(file: string): Record<string, unknown> {
	const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
	if (!isRecord(value)) throw new Error("Settings must be a JSON object");
	return value;
}

function positiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 0x7fffffff;
}

function isMode(value: unknown): value is TriggerMode {
	return value === "both" || value === "turn" || value === "typing";
}
