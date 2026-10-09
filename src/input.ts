export function isPathInput(input: string): boolean {
	if (input.trimStart().startsWith("/")) return true;
	const token = input.match(/(?:^|\s|["'`])([^\s"'`]*)$/u)?.[1] ?? "";
	return token.startsWith("@") || /[/\\]/.test(token) || /^\.(?:\.?$|[A-Za-z_])/.test(token);
}
