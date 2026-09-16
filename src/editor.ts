import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { EditorOptions, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { injectGhostTextIntoLine } from "./editor-utils.ts";

export interface GhostTextCallbacks {
	onAccept?: (acceptedText: string) => void;
	onDismiss?: () => void;
	onTextChanged?: (text: string) => void;
}

export class GhostTextEditor extends CustomEditor {
	private ghostText: string | null = null;
	private callbacks?: GhostTextCallbacks;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: any,
		options?: EditorOptions,
		callbacks?: GhostTextCallbacks
	) {
		super(tui, theme, keybindings, options);
		this.callbacks = callbacks;
	}

	public setCallbacks(callbacks: GhostTextCallbacks): void {
		this.callbacks = callbacks;
	}

	public setGhostText(text: string | null): void {
		if (this.ghostText === text) return;
		this.ghostText = text && text.trim().length > 0 ? text : null;
		this.tui.requestRender();
	}

	public getGhostText(): string | null {
		return this.ghostText;
	}

	public clearGhostText(): void {
		this.setGhostText(null);
	}

	public acceptGhostText(): boolean {
		if (!this.ghostText) return false;
		const toInsert = this.ghostText;
		this.ghostText = null;

		if (this.getText().length === 0) {
			this.setText(toInsert);
		} else {
			this.insertTextAtCursor(toInsert);
		}

		this.tui.requestRender();
		this.callbacks?.onAccept?.(toInsert);
		return true;
	}

	public dismissGhostText(): boolean {
		if (!this.ghostText) return false;
		this.ghostText = null;
		this.tui.requestRender();
		this.callbacks?.onDismiss?.();
		return true;
	}

	handleInput(data: string): void {
		// 1. If native autocomplete list is showing, let parent handle it with highest priority
		if (this.isShowingAutocomplete()) {
			super.handleInput(data);
			return;
		}

		// 2. Tab key accepts ghost text if present
		if ((data === "\t" || data === "\x09") && this.ghostText) {
			this.acceptGhostText();
			return;
		}

		// 3. Right Arrow key accepts ghost text if cursor is at the end of input
		if ((data === "\x1b[C" || data === "\x1bOC") && this.ghostText) {
			const cursor = this.getCursor();
			const lines = this.getLines();
			const isAtEnd =
				cursor.line === lines.length - 1 &&
				cursor.col === (lines[cursor.line]?.length ?? 0);
			if (isAtEnd) {
				this.acceptGhostText();
				return;
			}
		}

		// 4. Escape dismisses ghost text
		if (data === "\x1b" && this.ghostText) {
			this.dismissGhostText();
			return;
		}

		// 5. Delegate to CustomEditor for normal editing and app keybindings
		const prevText = this.getText();
		super.handleInput(data);
		const newText = this.getText();

		if (newText !== prevText) {
			// If user typed forward matching the start of current ghost text, shrink ghost text
			if (
				this.ghostText &&
				newText.startsWith(prevText) &&
				newText.length > prevText.length
			) {
				const typedChar = newText.slice(prevText.length);
				if (this.ghostText.startsWith(typedChar)) {
					this.ghostText = this.ghostText.slice(typedChar.length) || null;
					this.tui.requestRender();
					return;
				}
			}

			// Text changed and diverged from ghost text: clear current ghost text and notify
			this.ghostText = null;
			this.callbacks?.onTextChanged?.(newText);
		}
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (!this.ghostText || this.isShowingAutocomplete()) {
			return lines;
		}

		// Only show ghost text when cursor is at the very end of input
		const cursor = this.getCursor();
		const allLines = this.getLines();
		const isAtEnd =
			cursor.line === allLines.length - 1 &&
			cursor.col === (allLines[cursor.line]?.length ?? 0);

		if (!isAtEnd) {
			return lines;
		}

		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes("\x1b[7m \x1b[0m")) {
				lines[i] = injectGhostTextIntoLine(lines[i], this.ghostText, width);
				break;
			}
		}

		return lines;
	}
}
