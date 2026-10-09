import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiPredictorClient } from "../src/gemini-client.ts";
import { predictionResponse, testConfig } from "./fixtures.ts";

afterEach(() => vi.unstubAllGlobals());

describe("GeminiPredictorClient", () => {
	it("keeps both the goal and trailing constraints in the prompt", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(predictionResponse("建议"));
		vi.stubGlobal("fetch", fetchMock);
		const client = new GeminiPredictorClient(testConfig);
		await client.predict({ lastUserMessage: "GOAL: inspect only " + "x".repeat(400) + " CONSTRAINT: never commit", currentInput: "检查这" });
		const body = fetchMock.mock.lastCall?.[1]?.body;
		const payload = JSON.parse(body as string) as { messages: { content: string }[] };
		expect(payload.messages[1]?.content).toContain("GOAL: inspect only");
		expect(payload.messages[1]?.content).toContain("CONSTRAINT: never commit");
		expect(payload.messages[0]?.content).toContain("same language");
		expect(payload.messages[0]?.content).toContain("paths");
	});

	it("reports failures without exposing credentials", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
		const client = new GeminiPredictorClient(testConfig);
		await client.predict({ currentInput: "git" });
		expect(client.getStatus().reason).toBe("HTTP 401");
		expect(JSON.stringify(client.getStatus())).not.toContain(testConfig.apiKey);
	});
	it("does not generate suggestions without credentials", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const client = new GeminiPredictorClient({ ...testConfig, apiKey: "" });
		expect(await client.predict({ lastAssistantMessage: "no errors" })).toBeNull();
		expect(await client.predict({ currentInput: "npm" })).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns null when disabled", async () => {
		const client = new GeminiPredictorClient({ ...testConfig, enabled: false });
		expect(await client.predict({ lastAssistantMessage: "done" })).toBeNull();
	});

	it.each([" unit tests", "\" unit tests\"", " unit tests  \nextra"])(
		"preserves leading continuation whitespace for %j", async (content) => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(predictionResponse(content)));
			const client = new GeminiPredictorClient(testConfig);
			expect(await client.predict({ currentInput: "run the" })).toBe(" unit tests");
		},
	);

	it("strips a repeated input without losing its separator", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(predictionResponse("run the unit tests")));
		const client = new GeminiPredictorClient(testConfig);
		expect(await client.predict({ currentInput: "run the" })).toBe(" unit tests");
	});

	it("does not fall back on an HTTP failure", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
		const client = new GeminiPredictorClient(testConfig);
		expect(await client.predict({ currentInput: "npm", lastAssistantMessage: "no errors" })).toBeNull();
	});

	it("does not fall back on a network failure", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
		const client = new GeminiPredictorClient(testConfig);
		expect(await client.predict({ lastAssistantMessage: "failed" })).toBeNull();
	});

	it("never calls fetch for an already cancelled request", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const controller = new AbortController();
		controller.abort();
		const client = new GeminiPredictorClient(testConfig);
		expect(await client.predict({ currentInput: "git", signal: controller.signal })).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects a zero-width-only response", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(predictionResponse("\u200b")));
		expect(await new GeminiPredictorClient(testConfig).predict({ currentInput: "git" })).toBeNull();
	});

	it("normalizes tabs before caching and preview", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(predictionResponse("\tstatus")));
		expect(await new GeminiPredictorClient(testConfig).predict({ currentInput: "git" })).toBe("    status");
	});
});
