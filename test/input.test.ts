import { describe, expect, it } from "vitest";
import { isPathInput } from "../src/input.ts";

describe("path and native completion contexts", () => {
	it.each(["/ghost-text", "@src", "看下 src/comp", "查看 ./src/", "查看 ../src", "打开 .env", "打开 \"src/comp", "看下 C:\\src\\file", "访问 https://example.com"])("protects %j", (input) => {
		expect(isPathInput(input)).toBe(true);
	});
	it.each(["", "继续优化", "修复版本 v1.2", "调整到 0.5", "使用 object.property", "查看 src/file.ts 后的改动"])("allows prose %j", (input) => {
		expect(isPathInput(input)).toBe(false);
	});
});
