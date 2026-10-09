export class PredictionCache {
	private entries = new Map<string, { completion: string; expires: number }>();
	private limit: number;
	private ttlMs: number;

	constructor(limit = 32, ttlMs = 30_000) {
		this.limit = limit;
		this.ttlMs = ttlMs;
	}

	set(input: string, suffix: string): void {
		this.entries.delete(input);
		this.entries.set(input, { completion: input + suffix, expires: Date.now() + this.ttlMs });
		while (this.entries.size > this.limit) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.entries.delete(oldest);
		}
	}

	get(input: string): string | null {
		for (const [prefix, entry] of [...this.entries].reverse()) {
			if (entry.expires <= Date.now()) {
				this.entries.delete(prefix);
				continue;
			}
			if ((input.startsWith(prefix) || prefix.startsWith(input)) && entry.completion.startsWith(input)) {
				const suffix = entry.completion.slice(input.length);
				if (suffix.trim()) return suffix;
			}
		}
		return null;
	}

	clear(): void {
		this.entries.clear();
	}
}
