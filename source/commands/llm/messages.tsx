import React from 'react';
import {Text} from 'ink';
import zod from 'zod';
import {argument, option} from 'pastel';
import {useInstagramClient} from '../../ui/hooks/use-instagram-client.js';
import {
	estimateTokens,
	fail,
	ok,
	pickFields,
	printJson,
	splitFields,
	toIso,
	truncateText,
} from '../../utils/llm.js';

export const args = zod.tuple([
	zod.string().describe(argument({name: 'threadId', description: 'Thread ID'})),
	zod
		.string()
		.optional()
		.describe(
			argument({name: 'username', description: 'Session username (optional)'}),
		),
]);

export const options = zod.object({
	limit: zod
		.number()
		.int()
		.min(1)
		.max(100)
		.default(20)
		.describe(option({description: 'Max messages'})),
	cursor: zod
		.string()
		.optional()
		.describe(option({description: 'Fetch older page cursor'})),
	fields: zod
		.string()
		.optional()
		.describe(option({description: 'Comma-separated fields'})),
	since: zod
		.string()
		.optional()
		.describe(option({description: 'ISO timestamp filter (newer than)'})),
	maxChars: zod
		.number()
		.int()
		.min(1)
		.max(20_000)
		.optional()
		.describe(option({description: 'Max chars per text field'})),
	maxTokensEst: zod
		.number()
		.int()
		.min(1)
		.max(100_000)
		.optional()
		.describe(option({description: 'Approx token budget'})),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function LlmMessages({args, options}: Properties) {
	const [threadId, username] = args;
	const {client, isLoading, error} = useInstagramClient(username, {
		realtime: false,
	});
	const [output, setOutput] = React.useState<string>('');

	React.useEffect(() => {
		const run = async () => {
			if (isLoading || output) return;
			if (error) {
				setOutput(printJson(fail('AUTH_ERROR', error)));
				return;
			}

			if (!client) return;
			try {
				const {messages, cursor} = await client.getMessages(
					threadId,
					options.cursor,
				);
				const fields = splitFields(options.fields);
				const sinceTs = options.since
					? new Date(options.since).getTime()
					: undefined;
				let budget = options.maxTokensEst ?? Number.POSITIVE_INFINITY;
				const mapped = [] as Array<Record<string, unknown>>;
				for (const message of messages) {
					const ts = message.timestamp.getTime();
					if (sinceTs && ts <= sinceTs) continue;
					const text =
						message.itemType === 'text'
							? truncateText(message.text, options.maxChars)
							: undefined;
					const base = pickFields(
						{
							id: message.id,
							threadId: message.threadId,
							userId: message.userId,
							username: message.username,
							itemType: message.itemType,
							isOutgoing: message.isOutgoing,
							timestamp: toIso(message.timestamp),
							text,
						},
						fields,
					);
					const cost = estimateTokens(JSON.stringify(base));
					if (cost > budget) break;
					budget -= cost;
					mapped.push(base);
					if (mapped.length >= options.limit) break;
				}

				setOutput(
					printJson(
						ok(mapped, {
							count: mapped.length,
							cursor,
							remainingTokenBudget: Number.isFinite(budget)
								? budget
								: undefined,
						}),
					),
				);
			} catch (error_) {
				setOutput(
					printJson(
						fail(
							'MESSAGES_FETCH_FAILED',
							error_ instanceof Error ? error_.message : String(error_),
							true,
						),
					),
				);
			}
		};

		void run();
	}, [
		client,
		error,
		isLoading,
		options.cursor,
		options.fields,
		options.limit,
		options.maxChars,
		options.maxTokensEst,
		options.since,
		output,
		threadId,
	]);

	return <Text>{output || printJson(ok([], {status: 'loading'}))}</Text>;
}
