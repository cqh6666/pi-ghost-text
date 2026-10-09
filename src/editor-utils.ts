import { visibleWidth } from "@earendil-works/pi-tui";

/**
 * Truncates string to a max visible width, appending ellipsis if truncated.
 */
export function truncateToWidth(str: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(str) <= maxWidth) return str;

	let result = "";
	for (const char of str) {
		if (visibleWidth(result + char + "…") > maxWidth) {
			return result + "…";
		}
		result += char;
	}
	return result;
}

/**
 * Injects ghost text into a rendered editor line right after the cursor.
 * The cursor at the end of input is rendered by pi as `\x1b[7m \x1b[0m` (inverse space).
 * Right after the cursor are padding spaces that fill the line up to `width`.
 * We replace part of those padding spaces with dim ghost text, ensuring the total
 * visible width of the line is strictly preserved.
 */
export function injectGhostTextIntoLine(
	line: string,
	ghostText: string,
	lineWidth: number,
	options?: {
		showHint?: boolean;
		dimColor?: string;
		hintColor?: string;
		styleGhost?: (text: string) => string;
	}
): string {
	if (!ghostText || lineWidth <= 0 || visibleWidth(ghostText) <= 0) return line;

	const cursorPattern = "\x1b[7m \x1b[0m";
	const cursorIndex = line.indexOf(cursorPattern);
	if (cursorIndex === -1) {
		return line;
	}

	const beforeCursor = line.slice(0, cursorIndex);
	const afterCursor = line.slice(cursorIndex + cursorPattern.length);

	// Count leading spaces in afterCursor (which is the padding)
	let leadingSpacesCount = 0;
	while (leadingSpacesCount < afterCursor.length && afterCursor[leadingSpacesCount] === " ") {
		leadingSpacesCount++;
	}

	if (leadingSpacesCount <= 2) {
		// Not enough room to render ghost text
		return line;
	}

	const trailingContent = afterCursor.slice(leadingSpacesCount);

	// Reusing the cursor cell (1 col) + padding spaces
	const availableWidth = 1 + leadingSpacesCount;

	const showHint = options?.showHint ?? false;
	const hintText = showHint ? " (Tab)" : "";
	const hintWidth = visibleWidth(hintText);

	let formattedGhost = ghostText;
	let formattedHint = "";

	const totalNeeded = visibleWidth(formattedGhost) + hintWidth;

	if (totalNeeded <= availableWidth) {
		if (showHint && availableWidth - visibleWidth(formattedGhost) >= hintWidth) {
			formattedHint = hintText;
		}
	} else {
		// Needs truncation
		const maxGhostWidth = availableWidth - (availableWidth > 15 && showHint ? hintWidth : 0);
		formattedGhost = truncateToWidth(ghostText, maxGhostWidth);
		if (formattedGhost.length === 0) {
			return line;
		}
		if (showHint && availableWidth - visibleWidth(formattedGhost) >= hintWidth) {
			formattedHint = hintText;
		}
	}

	const usedWidth = visibleWidth(formattedGhost) + visibleWidth(formattedHint);
	const remainingSpaces = Math.max(0, availableWidth - usedWidth);

	const dimColor = options?.dimColor ?? "\x1b[2m";
	const hintColor = options?.hintColor ?? dimColor;
	const reset = "\x1b[0m";

	const renderedGhost = options?.styleGhost ? options.styleGhost(formattedGhost) : `${dimColor}${formattedGhost}${reset}`;
	const renderedHint = formattedHint ? `${hintColor}${formattedHint}${reset}` : "";

	return `${beforeCursor}${renderedGhost}${renderedHint}${" ".repeat(remainingSpaces)}${trailingContent}`;
}
