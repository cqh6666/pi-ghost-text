import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { injectGhostTextIntoLine, truncateToWidth } from "../src/editor-utils.ts";

describe("editor-utils", () => {
	it("truncates ASCII text properly", () => {
		expect(truncateToWidth("hello world", 5)).toBe("hell…");
		expect(truncateToWidth("hello", 10)).toBe("hello");
	});

	it("truncates wide CJK characters properly", () => {
		// "你好世界" is 8 columns wide
		const res = truncateToWidth("你好世界", 5);
		expect(visibleWidth(res)).toBeLessThanOrEqual(5);
	});

	it("injects ghost text into line while strictly preserving visible width", () => {
		const width = 60;
		const cursor = "\x1b[7m \x1b[0m";
		// Simulate a line rendered by Pi: 1 space left, cursor, 58 spaces padding
		const originalLine = ` ${cursor}${" ".repeat(58)}`;
		const originalWidth = visibleWidth(originalLine);
		expect(originalWidth).toBe(width);

		const ghost = "运行 npm run check";
		const injected = injectGhostTextIntoLine(originalLine, ghost, width);

		// Must contain the ghost text
		expect(injected).toContain(ghost);
		// Must preserve exact visible width so terminal line wraps never break!
		expect(visibleWidth(injected)).toBe(originalWidth);
	});

	it("preserves line untouched if no cursor is found", () => {
		const line = "normal line without cursor";
		expect(injectGhostTextIntoLine(line, "ghost", 30)).toBe(line);
	});

	it("handles very narrow available space gracefully", () => {
		const cursor = "\x1b[7m \x1b[0m";
		const line = `prefix${cursor}  `; // only 2 spaces padding
		expect(injectGhostTextIntoLine(line, "ghost text", 10)).toBe(line);
	});
});
