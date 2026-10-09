import type { ExtensionAPI, ExtensionContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GhostTextConfig } from "../src/config.ts";
import { GhostTextEditor } from "../src/editor.ts";
import extension from "../src/index.ts";
import { createEditor, createKeybindings, createTui, predictionResponse, testConfig, testTheme } from "./fixtures.ts";

const config = vi.hoisted(() => ({ value: {} as GhostTextConfig }));
vi.mock("../src/config.ts", () => ({ loadConfig: () => ({ ...config.value }), saveConfig: vi.fn() }));

type Handler = (event: never, ctx: ExtensionContext) => void | Promise<void>;

function createSession() {
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
	let factory: Parameters<ExtensionUIContext["setEditorComponent"]>[0];
	let editor: GhostTextEditor;
	const keybindings = createKeybindings();
	const ctx = {
		mode: "tui",
		hasUI: true,
		isIdle: () => true,
		sessionManager: { getBranch: () => [] },
		ui: {
			getEditorComponent: () => factory,
			setEditorComponent: (next: typeof factory) => {
				factory = next;
				if (next) editor = next(createTui(), testTheme, keybindings) as GhostTextEditor;
			},
			getEditorText: () => editor?.getText() ?? "",
			notify: vi.fn(),
			theme: { fg: (_color: string, text: string) => text },
		},
	} as unknown as ExtensionContext;
	const api = {
		on: (name: string, handler: Handler) => handlers.set(name, handler),
		registerFlag: vi.fn(),
		getFlag: () => undefined,
		registerCommand: (name: string, command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => {
			commands.set(name, command.handler);
		},
	} as unknown as ExtensionAPI;
	extension(api);
	return {
		ctx,
		get editor() { return editor; },
		emit: async (name: string, event: unknown = { type: name }) => {
			await handlers.get(name)?.(event as never, ctx);
		},
		command: async (args: string) => commands.get("ghost-text")?.(args, ctx),
	};
}

let session: ReturnType<typeof createSession> | undefined;
beforeEach(() => {
	vi.useFakeTimers();
	config.value = { ...testConfig };
});
afterEach(async () => {
	await session?.emit("session_shutdown");
	session = undefined;
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("ghost-text extension", () => {
	it("updates dialogue and tool context in typing-only mode", async () => {
		config.value.triggerMode = "typing";
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(predictionResponse("的空格"));
		vi.stubGlobal("fetch", fetchMock);
		session = createSession();
		await session.emit("session_start");
		await session.emit("agent_end", { type: "agent_end", messages: [
			{ role: "user", content: "只检查，不要提交" },
			{ role: "assistant", content: [
				{ type: "toolCall", id: "1", name: "read", arguments: {} },
				{ type: "text", text: "发现续写空格问题" },
			] },
		] });
		session.editor.setText("修复");
		session.editor.handleInput("这");
		await vi.advanceTimersByTimeAsync(700);
		const body = fetchMock.mock.lastCall?.[1]?.body;
		expect(typeof body).toBe("string");
		const payload = JSON.parse(body as string) as { messages: { content: string }[] };
		expect(payload.messages[1]?.content).toContain("只检查，不要提交");
		expect(payload.messages[1]?.content).toContain("发现续写空格问题");
		expect(payload.messages[1]?.content).toContain("read");
	});

	it("drops old results even when the input changes back to the same text", async () => {
		let resolve: (response: Response) => void = () => undefined;
		vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
		session = createSession();
		await session.emit("session_start");
		session.editor.setText("gi");
		session.editor.handleInput("t");
		await vi.advanceTimersByTimeAsync(700);
		session.editor.handleInput("x");
		session.editor.handleInput("\x7f");
		expect(session.editor.getText()).toBe("git");
		resolve(predictionResponse(" stale"));
		await vi.advanceTimersByTimeAsync(0);
		expect(session.editor.getGhostText()).toBeNull();
	});

	it("restores cached suffixes immediately after backspace", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(predictionResponse(" status"));
		vi.stubGlobal("fetch", fetchMock);
		session = createSession();
		await session.emit("session_start");
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(700);
		session.editor.handleInput("x");
		session.editor.handleInput("\x7f");
		expect(session.editor.getGhostText()).toBe(" status");
		await vi.advanceTimersByTimeAsync(700);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not restore a dismissed prediction", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(predictionResponse(" status"));
		vi.stubGlobal("fetch", fetchMock);
		session = createSession();
		await session.emit("session_start");
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(700);
		session.editor.render(80);
		session.editor.handleInput("\x1b");
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(1000);
		expect(session.editor.getGhostText()).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each(["model another-model", "mode typing"])("invalidates cache after %s", async (command) => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(predictionResponse(" status"));
		vi.stubGlobal("fetch", fetchMock);
		session = createSession();
		await session.emit("session_start");
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(700);
		await session.command(command);
		expect(session.editor.getGhostText()).toBeNull();
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(700);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("invalidates suggestions after dialogue changes", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(predictionResponse(" status"));
		vi.stubGlobal("fetch", fetchMock);
		session = createSession();
		await session.emit("session_start");
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(700);
		await session.emit("agent_end", { type: "agent_end", messages: [{ role: "user", content: "new task" }] });
		expect(session.editor.getGhostText()).toBeNull();
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(700);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("does not predict explicit paths before a native menu opens", async () => {
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);
		session = createSession();
		await session.emit("session_start");
		session.editor.setText("look at src/comp");
		await vi.advanceTimersByTimeAsync(700);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not replace an existing editor factory", async () => {
		session = createSession();
		const foreign = () => createEditor();
		session.ctx.ui.setEditorComponent(foreign);
		await session.emit("session_start");
		await session.command("on");
		expect(session.ctx.ui.getEditorComponent()).toBe(foreign);
		await session.command("status");
		expect(session.ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("another extension owns"), "info");
	});

	it("does not reset an editor installed by another extension", async () => {
		session = createSession();
		await session.emit("session_start");
		const foreign = () => createEditor();
		session.ctx.ui.setEditorComponent(foreign);
		await session.command("off");
		expect(session.ctx.ui.getEditorComponent()).toBe(foreign);
	});

	it("does not install a terminal editor in RPC mode", async () => {
		session = createSession();
		session.ctx.mode = "rpc";
		await session.emit("session_start");
		expect(session.ctx.ui.getEditorComponent()).toBeUndefined();
	});

	it("uses current theme colors at render time", async () => {
		vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(predictionResponse(" status")));
		session = createSession();
		await session.emit("session_start");
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(700);
		const fg = vi.spyOn(session.ctx.ui.theme, "fg");
		fg.mockImplementation((_color, text) => "\x1b[31m" + text + "\x1b[0m");
		expect(session.editor.render(80).join("\n")).toContain("\x1b[31m");
		fg.mockImplementation((_color, text) => "\x1b[32m" + text + "\x1b[0m");
		expect(session.editor.render(80).join("\n")).toContain("\x1b[32m");
	});

	it.each([300, 400, 700])("measures %dms debounce with a simulated 120ms network", async (debounceMs) => {
		config.value.debounceMs = debounceMs;
		const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(predictionResponse(" status")), 120)));
		vi.stubGlobal("fetch", fetchMock);
		session = createSession();
		await session.emit("session_start");
		session.editor.setText("git");
		await vi.advanceTimersByTimeAsync(debounceMs - 1);
		expect(fetchMock).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(120);
		expect(session.editor.getGhostText()).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(session.editor.getGhostText()).toBe(" status");
		await session.command("status");
		expect(session.ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("Last request: 120ms"), "info");
	});
});
