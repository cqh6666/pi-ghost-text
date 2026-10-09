import type { KeybindingsManager as AppKeybindingsManager } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, TUI_KEYBINDINGS, setKeybindings, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { vi } from "vitest";
import type { GhostTextConfig } from "../src/config.ts";
import { GhostTextEditor, type GhostTextCallbacks } from "../src/editor.ts";

export const testConfig: GhostTextConfig = {
	enabled: true,
	model: "test-model",
	baseUrl: "https://predictor.invalid/v1",
	apiKey: "test-key",
	temperature: 0.2,
	maxTokens: 30,
	timeoutMs: 2000,
	debounceMs: 700,
	minChars: 3,
	triggerMode: "both",
};

export const testTheme: EditorTheme = {
	borderColor: (text) => text,
	selectList: {
		selectedPrefix: (text) => text,
		selectedText: (text) => text,
		description: (text) => text,
		scrollInfo: (text) => text,
		noMatch: (text) => text,
	},
};

export function createTui(columns = 80): TUI {
	return { terminal: { columns, rows: 24 }, requestRender: vi.fn() } as unknown as TUI;
}

export function createKeybindings(): AppKeybindingsManager {
	const keybindings = new KeybindingsManager({ ...TUI_KEYBINDINGS, "app.interrupt": { defaultKeys: "escape" } });
	setKeybindings(keybindings);
	return keybindings as unknown as AppKeybindingsManager;
}

export function createEditor(callbacks?: GhostTextCallbacks): GhostTextEditor {
	return new GhostTextEditor(createTui(), testTheme, createKeybindings(), undefined, callbacks);
}

export function predictionResponse(content: string): Response {
	return Response.json({ choices: [{ message: { content } }] });
}
