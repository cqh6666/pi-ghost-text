import { describe, expect, it, vi } from "vitest";
import { GhostTextEditor } from "../src/editor.ts";

function createMockTui(cols = 80, rows = 24) {
	return {
		terminal: { cols, rows },
		requestRender: vi.fn(),
	} as any;
}

const testTheme = {
	borderColor: (s: string) => s,
	selectList: {
		selectedPrefix: (s: string) => s,
		selectedText: (s: string) => s,
		description: (s: string) => s,
		scrollInfo: (s: string) => s,
		unselectedPrefix: (s: string) => s,
	},
} as any;

const mockKeybindings = {
	matches: () => false,
} as any;

describe("GhostTextEditor", () => {
	it("sets, gets and clears ghost text", () => {
		const tui = createMockTui();
		const editor = new GhostTextEditor(tui, testTheme, mockKeybindings);

		expect(editor.getGhostText()).toBeNull();

		editor.setGhostText("git commit -m 'feat'");
		expect(editor.getGhostText()).toBe("git commit -m 'feat'");
		expect(tui.requestRender).toHaveBeenCalled();

		editor.clearGhostText();
		expect(editor.getGhostText()).toBeNull();
	});

	it("accepts ghost text on Tab key", () => {
		const tui = createMockTui();
		const onAccept = vi.fn();
		const editor = new GhostTextEditor(tui, testTheme, mockKeybindings, undefined, { onAccept });

		editor.setGhostText("运行 npm test");
		expect(editor.getText()).toBe("");

		// Send Tab
		editor.handleInput("\t");

		expect(editor.getText()).toBe("运行 npm test");
		expect(editor.getGhostText()).toBeNull();
		expect(onAccept).toHaveBeenCalledWith("运行 npm test");
	});

	it("accepts ghost text and appends to existing text", () => {
		const tui = createMockTui();
		const editor = new GhostTextEditor(tui, testTheme, mockKeybindings);
		editor.setText("git ");

		editor.setGhostText("status");
		editor.handleInput("\t");

		expect(editor.getText()).toBe("git status");
		expect(editor.getGhostText()).toBeNull();
	});

	it("dismisses ghost text on Escape key", () => {
		const tui = createMockTui();
		const onDismiss = vi.fn();
		const editor = new GhostTextEditor(tui, testTheme, mockKeybindings, undefined, { onDismiss });

		editor.setGhostText("some suggestion");
		editor.handleInput("\x1b"); // Escape

		expect(editor.getText()).toBe("");
		expect(editor.getGhostText()).toBeNull();
		expect(onDismiss).toHaveBeenCalled();
	});

	it("shrinks ghost text as user types matching characters", () => {
		const tui = createMockTui();
		const editor = new GhostTextEditor(tui, testTheme, mockKeybindings);

		editor.setText("gi");
		editor.setGhostText("t status");

		// User types "t"
		editor.handleInput("t");

		expect(editor.getText()).toBe("git");
		expect(editor.getGhostText()).toBe(" status");
	});

	it("clears ghost text and notifies onTextChanged when user diverges", () => {
		const tui = createMockTui();
		const onTextChanged = vi.fn();
		const editor = new GhostTextEditor(tui, testTheme, mockKeybindings, undefined, { onTextChanged });

		editor.setText("gi");
		editor.setGhostText("t status");

		// User types "x" instead of "t"
		editor.handleInput("x");

		expect(editor.getText()).toBe("gix");
		expect(editor.getGhostText()).toBeNull();
		expect(onTextChanged).toHaveBeenCalledWith("gix");
	});

	it("renders ghost text into the editor output line", () => {
		const tui = createMockTui(80, 24);
		const editor = new GhostTextEditor(tui, testTheme, mockKeybindings);

		editor.setGhostText("推荐的操作");
		const rendered = editor.render(80);

		// Must render top border, content line, bottom border
		expect(rendered.length).toBeGreaterThanOrEqual(3);
		const content = rendered.join("\n");
		expect(content).toContain("推荐的操作");
	});
});
