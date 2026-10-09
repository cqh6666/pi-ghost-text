import { describe, expect, it } from "vitest";
import { CURSOR_MARKER, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { injectGhostTextIntoLine, truncateToWidth } from "../src/editor-utils.ts";

const cursor = "\x1b[7m \x1b[0m";

describe("editor-utils", () => {
  it("truncates ASCII text properly", () => {
    expect(truncateToWidth("hello world", 5)).toBe("hell…");
    expect(truncateToWidth("hello", 10)).toBe("hello");
  });
  it("truncates wide CJK characters properly", () => {
    expect(visibleWidth(truncateToWidth("你好世界", 5))).toBeLessThanOrEqual(5);
  });
  it("truncates complete graphemes", () => {
    const family = "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}";
    expect(truncateToWidth(family + "XY", 3)).toBe(family + "…");
  });
  it("injects ghost text while preserving visible width", () => {
    const original = " " + cursor + " ".repeat(58);
    const injected = injectGhostTextIntoLine(original, "运行 npm run check", 60);
    expect(stripTerminalSequences(injected)).toContain("运行 npm run check");
    expect(visibleWidth(injected)).toBe(visibleWidth(original));
  });
  it.each([" status", "status", "检查当前变更"])("reuses the cursor cell for %j", (suffix) => {
    const original = "git" + CURSOR_MARKER + cursor + " ".repeat(30);
    const injected = injectGhostTextIntoLine(original, suffix, visibleWidth(original));
    expect(stripTerminalSequences(injected).trimEnd()).toBe("git" + suffix);
    expect(injected).toContain(CURSOR_MARKER);
    expect(visibleWidth(injected)).toBe(visibleWidth(original));
  });
  it("does not draw zero-width suggestions", () => {
    const original = "git" + cursor + " ".repeat(30);
    expect(injectGhostTextIntoLine(original, "\u200b", 34)).toBe(original);
  });
  it("preserves lines without a cursor", () => {
    const original = "normal line without cursor";
    expect(injectGhostTextIntoLine(original, "ghost", 30)).toBe(original);
  });
  it("does not draw in insufficient space", () => {
    const original = "prefix" + cursor + "  ";
    expect(injectGhostTextIntoLine(original, "ghost text", 10)).toBe(original);
  });
});
