import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
	it("loads default config with sensible throttles", () => {
		const config = loadConfig();
		expect(config.debounceMs).toBe(700);
		expect(config.minChars).toBe(3);
		expect(config.triggerMode).toBe("both");
		expect(config.timeoutMs).toBe(2000);
	});
});
