import { describe, expect, it } from "vitest";
import { GeminiPredictorClient } from "../src/gemini-client.ts";

describe("GeminiPredictorClient", () => {
	it("initializes with default config and resolves models.json credentials", () => {
		const client = new GeminiPredictorClient();
		const cfg = client.getConfig();
		expect(cfg.model).toBe("gemini-3.1-flash-lite");
		expect(cfg.enabled).toBe(true);
		expect(cfg.baseUrl).toBeTruthy();
		expect(cfg.apiKey).toBeTruthy();
	});

	it("falls back to heuristic prediction when needed", async () => {
		const client = new GeminiPredictorClient({
			enabled: true,
			model: "test-model",
			baseUrl: "",
			apiKey: "",
			temperature: 0.2,
			maxTokens: 20,
			timeoutMs: 1000,
			debounceMs: 300,
		});

		const pred1 = await client.predict({
			lastAssistantMessage: "Compilation failed with 2 errors in src/main.ts",
		});
		expect(pred1).toBe("修复报错并重新测试");

		const pred2 = await client.predict({
			currentInput: "git",
		});
		expect(pred2).toBe(" status");
	});

	it("returns null if disabled", async () => {
		const client = new GeminiPredictorClient({
			enabled: false,
			model: "test-model",
			baseUrl: "",
			apiKey: "",
			temperature: 0.2,
			maxTokens: 20,
			timeoutMs: 1000,
			debounceMs: 300,
		});

		const res = await client.predict({ lastAssistantMessage: "done" });
		expect(res).toBeNull();
	});
});
