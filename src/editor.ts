import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type EditorOptions, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { injectGhostTextIntoLine } from "./editor-utils.ts";
import { isPathInput } from "./input.ts";

export interface GhostTextOptions extends EditorOptions {
	styleGhost?: (text: string) => string;
}

export interface GhostTextCallbacks {
	onAccept?: (acceptedText: string) => void;
	onDismiss?: () => void;
	onTextChanged?: (text: string) => void;
	onInvalidate?: () => void;
}

export class GhostTextEditor extends CustomEditor {
	private ghostText: string | null = null;
	private ghostInput = "";
	private visible = false;
	private ghostKeybindings: KeybindingsManager;
	private callbacks?: GhostTextCallbacks;
	private styleGhost?: (text: string) => string;

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, options?: GhostTextOptions, callbacks?: GhostTextCallbacks) {
		super(tui, theme, keybindings, options);
		this.ghostKeybindings = keybindings;
		this.callbacks = callbacks;
		this.styleGhost = options?.styleGhost;

		const originalStart = (this as any).startAutocompleteRequest;
		if (typeof originalStart === "function") {
			(this as any).startAutocompleteRequest = (...args: any[]) => {
				this.clearGhostText();
				this.callbacks?.onInvalidate?.();
				return originalStart.apply(this, args);
			};
		}
	}

	setCallbacks(callbacks: GhostTextCallbacks): void {
		this.callbacks = callbacks;
	}

	setGhostText(text: string | null): void {
		const normalized = text ? text.replaceAll("\t", "    ") : null;
		this.ghostText = normalized && visibleWidth(normalized) > 0 ? normalized : null;
		this.ghostInput = this.getText();
		this.visible = false;
		this.tui.requestRender();
	}

	getGhostText(): string | null {
		return this.ghostText;
	}

	clearGhostText(): void {
		this.setGhostText(null);
	}

	isAtEnd(): boolean {
		const cursor = this.getCursor();
		const lines = this.getLines();
		return cursor.line === lines.length - 1 && cursor.col === (lines[cursor.line]?.length ?? 0);
	}

	private isAutocompletePending(): boolean {
		return Boolean((this as any).autocompleteAbort || (this as any).autocompleteDebounceTimer);
	}

	canSuggest(): boolean {
		return this.isAtEnd() && !this.isShowingAutocomplete() && !this.isAutocompletePending() && !isPathInput(this.getText());
	}

	private canAccept(): boolean {
		return this.visible && !!this.ghostText && this.canSuggest() && this.getText() === this.ghostInput;
	}

	acceptGhostText(partial = false): boolean {
		if (!this.canAccept() || !this.ghostText) return false;
		const suffix = this.ghostText;
		let text = suffix;
		if (partial) {
			text = "";
			for (const segment of new Intl.Segmenter(undefined, { granularity: "word" }).segment(suffix)) {
				text += segment.segment;
				if (segment.isWordLike) break;
			}
		}
		this.clearGhostText();
		this.insertTextAtCursor(text);
		this.setGhostText(suffix.slice(text.length));
		this.callbacks?.onAccept?.(text);
		return true;
	}

	dismissGhostText(): boolean {
		const hadSuggestion = !!this.ghostText;
		this.clearGhostText();
		this.callbacks?.onDismiss?.();
		return hadSuggestion;
	}

	override setText(text: string): void {
		super.setText(text);
		this.clearGhostText();
		this.callbacks?.onTextChanged?.(this.getText());
	}

	override handleInput(data: string): void {
		if (this.isShowingAutocomplete()) {
			this.clearGhostText();
			this.callbacks?.onInvalidate?.();
			super.handleInput(data);
			return;
		}

		if (this.ghostKeybindings.matches(data, "app.interrupt")) {
			const wasVisible = this.canAccept();
			this.dismissGhostText();
			if (wasVisible) return;
		}

		if (this.canAccept() && (this.ghostKeybindings.matches(data, "tui.input.tab") || this.ghostKeybindings.matches(data, "tui.editor.cursorRight"))) {
			this.acceptGhostText();
			return;
		}

		if (this.canAccept() && this.ghostKeybindings.matches(data, "tui.editor.cursorWordRight")) {
			this.acceptGhostText(true);
			return;
		}

		const before = this.getText();
		super.handleInput(data);
		if (this.ghostKeybindings.matches(data, "tui.editor.undo")) {
			this.dismissGhostText();
			return;
		}
		const after = this.getText();
		if (!this.isAtEnd()) {
			this.clearGhostText();
			this.callbacks?.onInvalidate?.();
		} else if (after !== before) {
			const typed = after.startsWith(before) ? after.slice(before.length) : "";
			if (typed && this.ghostText?.startsWith(typed) && this.ghostInput === before) {
				this.ghostText = this.ghostText.slice(typed.length) || null;
				this.ghostInput = after;
				this.visible = false;
				this.tui.requestRender();
			} else {
				this.clearGhostText();
			}
			this.callbacks?.onTextChanged?.(after);
		}
	}

	override invalidate(): void {
		super.invalidate();
		this.visible = false;
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		this.visible = false;
		if (!this.ghostText || !this.canSuggest() || this.getText() !== this.ghostInput) return lines;
		for (let i = 0; i < lines.length; i++) {
			const before = lines[i]!;
			const after = injectGhostTextIntoLine(before, this.ghostText, width, { styleGhost: this.styleGhost });
			if (after !== before) {
				lines[i] = after;
				this.visible = true;
				break;
			}
		}
		return lines;
	}
}
