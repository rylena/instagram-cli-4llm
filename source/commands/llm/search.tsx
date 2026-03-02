import React from 'react';
import {Text} from 'ink';
import zod from 'zod';
import {argument, option} from 'pastel';
import {useInstagramClient} from '../../ui/hooks/use-instagram-client.js';
import type {SearchResult} from '../../client.js';
import {
	fail,
	ok,
	pickFields,
	printJson,
	splitFields,
	toIso,
} from '../../utils/llm.js';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'query',
			description: 'Search query (title or username)',
		}),
	),
	zod
		.string()
		.optional()
		.describe(
			argument({name: 'username', description: 'Session username (optional)'}),
		),
]);

export const options = zod.object({
	mode: zod
		.enum(['auto', 'title', 'username'])
		.default('auto')
		.describe(option({description: 'Search mode'})),
	limit: zod
		.number()
		.int()
		.min(1)
		.max(100)
		.default(20)
		.describe(option({description: 'Maximum results'})),
	fields: zod
		.string()
		.optional()
		.describe(option({description: 'Comma-separated fields'})),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function LlmSearch({args, options}: Properties) {
	const [query, username] = args;
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
				let results: SearchResult[] = [];

				if (options.mode === 'title') {
					results = await client.searchThreadsByTitle(query, {
						maxThreadsToSearch: Math.max(options.limit, 40),
					});
				} else if (options.mode === 'username') {
					results = await client.searchThreadByUsername(query, {
						forceExact: false,
					});
				} else {
					const [titleMatches, userMatches] = await Promise.all([
						client.searchThreadsByTitle(query, {
							maxThreadsToSearch: Math.max(options.limit, 40),
						}),
						client.searchThreadByUsername(query, {forceExact: false}),
					]);

					const merged = new Map<string, SearchResult>();
					for (const match of [...titleMatches, ...userMatches]) {
						const existing = merged.get(match.thread.id);
						if (!existing || match.score > existing.score) {
							merged.set(match.thread.id, match);
						}
					}

					results = [...merged.values()].sort((a, b) => b.score - a.score);
				}

				const fields = splitFields(options.fields);
				const items = results.slice(0, options.limit).map(result => {
					const {thread} = result;
					return pickFields(
						{
							id: thread.id,
							title: thread.title,
							score: Number(result.score.toFixed(4)),
							isGroup: (thread.users?.length ?? 0) > 1,
							participants: (thread.users ?? []).map(user => user.username),
							lastActivity: toIso(thread.lastActivity),
							unread: thread.unread,
						},
						fields,
					);
				});

				setOutput(
					printJson(
						ok(items, {
							query,
							mode: options.mode,
							count: items.length,
						}),
					),
				);
			} catch (error_) {
				setOutput(
					printJson(
						fail(
							'SEARCH_FAILED',
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
		options.fields,
		options.limit,
		options.mode,
		output,
		query,
	]);

	return <Text>{output || printJson(ok([], {status: 'loading'}))}</Text>;
}
