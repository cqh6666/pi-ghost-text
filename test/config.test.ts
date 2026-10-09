import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveConfig } from "../src/config.ts";
import { testConfig } from "./fixtures.ts";

let dir: string;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ghost-text-config-"));
	for (const name of ["PI_HOME", "PI_GHOST_TEXT_MODEL", "PI_GHOST_TEXT_BASE_URL", "PI_GHOST_TEXT_API_KEY", "PI_GHOST_TEXT_TRIGGER_MODE", "PI_GHOST_TEXT_DEBOUNCE_MS", "PI_GHOST_TEXT_MIN_CHARS", "PI_GHOST_TEXT_ENABLED", "GEMINI_BASE_URL", "GEMINI_API_KEY"]) vi.stubEnv(name, "");
	vi.stubEnv("PI_AGENT_DIR", dir);
	vi.stubEnv("PI_CODING_AGENT_DIR", dir);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("ghost-text preferences", () => {
	it("uses isolated defaults with no credentials", () => {
		expect(loadConfig()).toMatchObject({ enabled: true, debounceMs: 400, minChars: 3, triggerMode: "both", timeoutMs: 2000, apiKey: "", baseUrl: "" });
	});
	it("resolves provider credentials and normalizes the endpoint", () => {
		fs.writeFileSync(path.join(dir, "models.json"), JSON.stringify({ providers: { gemini: { baseUrl: "https://example.invalid/v1/", apiKey: "fixture-key" } } }));
		expect(loadConfig()).toMatchObject({ baseUrl: "https://example.invalid/v1", apiKey: "fixture-key" });
	});
	it("ignores invalid throttles", () => {
		fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ ghostText: { timeoutMs: -1, debounceMs: "bad", minChars: 0, temperature: 9 } }));
		vi.stubEnv("PI_GHOST_TEXT_DEBOUNCE_MS", "400junk");
		expect(loadConfig()).toMatchObject({ timeoutMs: 2000, debounceMs: 400, minChars: 3, temperature: 0.2 });
	});
	it("honors environment overrides", () => {
		vi.stubEnv("PI_GHOST_TEXT_DEBOUNCE_MS", "300");
		vi.stubEnv("PI_GHOST_TEXT_TRIGGER_MODE", "typing");
		vi.stubEnv("PI_GHOST_TEXT_ENABLED", "false");
		expect(loadConfig()).toMatchObject({ debounceMs: 300, triggerMode: "typing", enabled: false });
	});
	it("saves only preferences while preserving unrelated settings and existing secrets", () => {
		const destination = path.join(dir, "settings.json");
		fs.writeFileSync(destination, JSON.stringify({ theme: "light", packages: ["other-plugin"], ghostText: { apiKey: "existing-key", baseUrl: "https://existing.invalid", extra: true } }));
		expect(saveConfig({ ...testConfig, debounceMs: 300, triggerMode: "typing" })).toBe(destination);
		const saved = JSON.parse(fs.readFileSync(destination, "utf8"));
		expect(saved).toMatchObject({ theme: "light", packages: ["other-plugin"], ghostText: { debounceMs: 300, triggerMode: "typing", apiKey: "existing-key", baseUrl: "https://existing.invalid", extra: true } });
		expect(saved.ghostText.apiKey).not.toBe(testConfig.apiKey);
		expect(fs.readdirSync(dir)).toEqual(["settings.json"]);
	});
	it("does not overwrite malformed settings", () => {
		const destination = path.join(dir, "settings.json");
		fs.writeFileSync(destination, "invalid json");
		expect(() => saveConfig(testConfig)).toThrow();
		expect(fs.readFileSync(destination, "utf8")).toBe("invalid json");
	});
	it("uses the active Pi configuration directory", () => {
		vi.stubEnv("PI_AGENT_DIR", path.join(dir, "other"));
		expect(saveConfig(testConfig)).toBe(path.join(dir, "settings.json"));
	});
	it("does not persist API credentials into a new settings file", () => {
		const destination = saveConfig(testConfig);
		const saved = JSON.parse(fs.readFileSync(destination, "utf8"));
		expect(saved.ghostText.apiKey).toBeUndefined();
		expect(saved.ghostText.baseUrl).toBeUndefined();
	});
});
