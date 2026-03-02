export type LlmEnvelope<T> = {
	ok: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
		retryable: boolean;
	};
	meta?: Record<string, unknown>;
};

export function splitFields(fields?: string): string[] | undefined {
	if (!fields) return undefined;
	const parsed = fields
		.split(',')
		.map(value => value.trim())
		.filter(Boolean);
	return parsed.length > 0 ? parsed : undefined;
}

export function pickFields<T extends Record<string, unknown>>(
	value: T,
	fields?: string[],
): Record<string, unknown> {
	if (!fields || fields.length === 0) return value;
	const out: Record<string, unknown> = {};
	for (const field of fields) {
		if (field in value) out[field] = value[field as keyof T];
	}

	return out;
}

export function truncateText(text: string, maxChars?: number): string {
	if (!maxChars || maxChars <= 0) return text;
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}...[truncated]`;
}

export function toIso(
	value: Date | string | number | undefined,
): string | undefined {
	if (value === undefined) return undefined;
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return undefined;
	return d.toISOString();
}

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function printJson(payload: unknown): string {
	return JSON.stringify(payload);
}

export function ok<T>(data: T, meta?: Record<string, unknown>): LlmEnvelope<T> {
	return {ok: true, data, meta};
}

export function fail(
	code: string,
	message: string,
	retryable = false,
): LlmEnvelope<never> {
	return {
		ok: false,
		error: {code, message, retryable},
	};
}
