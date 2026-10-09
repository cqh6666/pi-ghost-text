import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PredictionCache } from "../src/prediction-cache.ts";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

describe("PredictionCache", () => {
	it("restores continuations after typing and backspacing", () => {
		const cache = new PredictionCache();
		cache.set("git", " status");
		expect(cache.get("git s")).toBe("tatus");
		expect(cache.get("git")).toBe(" status");
		expect(cache.get("git diff")).toBeNull();
	});
	it("does not mix unrelated input prefixes", () => {
		const cache = new PredictionCache();
		cache.set("修复这", "个问题");
		expect(cache.get("修复")).toBe("这个问题");
		expect(cache.get("检查")).toBeNull();
	});
	it("expires entries", () => {
		const cache = new PredictionCache(32, 100);
		cache.set("git", " status");
		vi.advanceTimersByTime(100);
		expect(cache.get("git")).toBeNull();
	});
	it("bounds memory and favors recent entries", () => {
		const cache = new PredictionCache(2);
		cache.set("one", " suffix");
		cache.set("two", " suffix");
		cache.set("three", " suffix");
		expect(cache.get("one")).toBeNull();
		expect(cache.get("three")).toBe(" suffix");
	});
	it("clears the previous model and dialogue scope", () => {
		const cache = new PredictionCache();
		cache.set("git", " status");
		cache.clear();
		expect(cache.get("git")).toBeNull();
	});
});
