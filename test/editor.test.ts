import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "./fixtures.ts";
import { stripTerminalSequences, type AutocompleteProvider } from "@earendil-works/pi-tui";

afterEach(() => vi.restoreAllMocks());

describe("GhostTextEditor", () => {
	it("sets, gets and clears ghost text", () => {
		const editor = createEditor();
		expect(editor.getGhostText()).toBeNull();
		editor.setGhostText("git status");
		expect(editor.getGhostText()).toBe("git status");
		editor.clearGhostText();
		expect(editor.getGhostText()).toBeNull();
	});

	it("accepts visible ghost text on Tab", () => {
		const onAccept = vi.fn();
		const editor = createEditor({ onAccept });
		editor.setGhostText("运行 npm run check");
		editor.render(80);
		editor.handleInput("\t");
		expect(editor.getText()).toBe("运行 npm run check");
		expect(editor.getGhostText()).toBeNull();
		expect(onAccept).toHaveBeenCalledWith("运行 npm run check");
	});

	it("appends an accepted suffix", () => {
		const editor = createEditor();
		editor.setText("git ");
		editor.setGhostText("status");
		editor.render(80);
		editor.handleInput("\t");
		expect(editor.getText()).toBe("git status");
	});

	it.each(["\x1b", "\x1b[27u"])("dismisses on Escape encoding %j", (key) => {
		const onDismiss = vi.fn();
		const editor = createEditor({ onDismiss });
		editor.setGhostText("suggestion");
		editor.render(80);
		editor.handleInput(key);
		expect(editor.getGhostText()).toBeNull();
		expect(onDismiss).toHaveBeenCalled();
	});

	it("does not insert hidden text after moving the cursor", () => {
		const editor = createEditor();
		editor.setText("run the");
		editor.setGhostText(" unit tests");
		editor.render(80);
		editor.handleInput("\x1b[D");
		editor.handleInput("\t");
		expect(editor.getText()).toBe("run the");
		expect(editor.getGhostText()).toBeNull();
	});

	it("does not accept a suggestion that cannot fit beside the cursor", () => {
		const editor = createEditor();
		editor.setText("run the");
		editor.setGhostText(" unit tests");
		expect(editor.render(10).join("\n")).not.toContain("unit tests");
		editor.handleInput("\t");
		expect(editor.getText()).toBe("run the");
	});

	it("does not accept before a suggestion has been drawn", () => {
		const editor = createEditor();
		editor.setGhostText("invisible");
		editor.handleInput("\t");
		expect(editor.getText()).toBe("");
	});

	it("shrinks the suggestion when typing matches", () => {
		const editor = createEditor();
		editor.setText("gi");
		editor.setGhostText("t status");
		editor.render(80);
		editor.handleInput("t");
		expect(editor.getText()).toBe("git");
		expect(editor.getGhostText()).toBe(" status");
	});

	it("clears a suggestion when typing diverges", () => {
		const onTextChanged = vi.fn();
		const editor = createEditor({ onTextChanged });
		editor.setText("gi");
		editor.setGhostText("t status");
		editor.handleInput("x");
		expect(editor.getText()).toBe("gix");
		expect(editor.getGhostText()).toBeNull();
		expect(onTextChanged).toHaveBeenCalledWith("gix");
	});

	it("renders a suggestion without changing the input", () => {
		const editor = createEditor();
		editor.setGhostText("推荐的操作");
		expect(stripTerminalSequences(editor.render(80).join("\n"))).toContain("推荐的操作");
		expect(editor.getText()).toBe("");
	});

	it("keeps native autocomplete in charge", () => {
		const editor = createEditor();
		editor.setText("@src");
		editor.setGhostText("fake-path");
		vi.spyOn(editor, "isShowingAutocomplete").mockReturnValue(true);
		expect(editor.render(80).join("\n")).not.toContain("fake-path");
		editor.handleInput("\t");
		expect(editor.getText()).toBe("@src");
	});

	it.each(["\x1b[1;3C", "\x1b[1;5C", "\x1bf"])("accepts one word using %j", (key) => {
		const editor = createEditor();
		editor.setText("run the");
		editor.setGhostText(" unit tests");
		editor.render(80);
		editor.handleInput(key);
		expect(editor.getText()).toBe("run the unit");
		expect(editor.getGhostText()).toBe(" tests");
		editor.render(80);
		editor.handleInput("\t");
		expect(editor.getText()).toBe("run the unit tests");
	});

	it("segments Chinese rather than splitting only on spaces", () => {
		const editor = createEditor();
		editor.setGhostText("修复当前报错");
		editor.render(80);
		editor.handleInput("\x1b[1;3C");
		expect(editor.getText()).toBe("修复");
		expect(editor.getGhostText()).toBe("当前报错");
	});

	it("does not split emoji grapheme clusters", () => {
		const editor = createEditor();
		const family = "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}";
		editor.setGhostText(family);
		editor.render(80);
		editor.handleInput("\x1b[1;3C");
		expect(editor.getText()).toBe(family);
	});

	it("keeps accepted text atomic for undo", () => {
		const onDismiss = vi.fn();
		const editor = createEditor({ onDismiss });
		editor.setText("git");
		editor.setGhostText(" status");
		editor.render(80);
		editor.handleInput("\t");
		editor.handleInput("\x1b[45;5u");
		expect(editor.getText()).toBe("git");
		expect(editor.getGhostText()).toBeNull();
		expect(onDismiss).toHaveBeenCalled();
	});

	it("keeps native autocomplete in charge while its request is pending", async () => {
		const onInvalidate = vi.fn();
		const editor = createEditor({ onInvalidate });
		let complete: (value: null) => void = () => {};
		const pending = new Promise<null>((resolve) => { complete = resolve; });
		const provider: AutocompleteProvider = {
			getSuggestions: vi.fn(() => pending),
			shouldTriggerFileCompletion: () => true,
			applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
		};
		editor.setAutocompleteProvider(provider);
		editor.setText("git");
		onInvalidate.mockClear();
		editor.handleInput("\t");
		await vi.waitFor(() => expect(provider.getSuggestions).toHaveBeenCalled());
		expect(onInvalidate).toHaveBeenCalled();
		editor.setGhostText(" ghost");
		expect(editor.render(80).join("\n")).not.toContain("ghost");
		editor.handleInput("\t");
		expect(editor.getText()).toBe("git");
		complete(null);
		await vi.waitFor(() => expect(editor.canSuggest()).toBe(true));
	});

	it("normalizes tabs so preview matches insertion", () => {
		const editor = createEditor();
		editor.setText("git");
		editor.setGhostText("\tstatus");
		expect(editor.getGhostText()).toBe("    status");
		expect(stripTerminalSequences(editor.render(80).join("\n"))).toContain("git    status");
		editor.handleInput("\t");
		expect(editor.getText()).toBe("git    status");
	});

	it("rejects a suggestion with no display-width content", () => {
		const editor = createEditor();
		editor.setText("git");
		editor.setGhostText("\u200b");
		editor.render(80);
		editor.handleInput("\t");
		expect(editor.getText()).toBe("git");
		expect(editor.getGhostText()).toBeNull();
	});
});
