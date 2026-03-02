import React from 'react';
import {Text} from 'ink';
import zod from 'zod';
import {argument, option} from 'pastel';
import {useInstagramClient} from '../../ui/hooks/use-instagram-client.js';
import {
	ok,
	fail,
	pickFields,
	printJson,
	splitFields,
	toIso,
} from '../../utils/llm.js';

export const args = zod.tuple([
	zod
		.string()
		.optional()
		.describe(
			argument({
				name: 'username',
				description: 'Username to use session for (optional)',
			}),
		),
]);

export const options = zod.object({
	limit: zod
		.number()
		.int()
		.min(1)
		.max(100)
		.default(20)
		.describe(option({description: 'Maximum threads to return'})),
	fields: zod
		.string()
		.optional()
		.describe(option({description: 'Comma-separated fields'})),
	plain: zod
		.boolean()
		.default(true)
		.describe(option({description: 'Plain output (no styling)'})),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function LlmThreads({args, options}: Properties) {
	const {client, isLoading, error} = useInstagramClient(args[0], {
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
				const result = await client.getThreads(false);
				const fields = splitFields(options.fields);
				const items = result.threads.slice(0, options.limit).map(thread =>
					pickFields(
						{
							id: thread.id,
							title: thread.title,
							lastActivity: toIso(thread.lastActivity),
							unread: thread.unread,
							usernames: thread.users.map(user => user.username),
							lastMessageText:
								thread.lastMessage?.itemType === 'text'
									? thread.lastMessage.text
									: undefined,
						},
						fields,
					),
				);
				setOutput(
					printJson(ok(items, {count: items.length, hasMore: result.hasMore})),
				);
			} catch (error_) {
				setOutput(
					printJson(
						fail(
							'THREADS_FETCH_FAILED',
							error_ instanceof Error ? error_.message : String(error_),
							true,
						),
					),
				);
			}
		};

		void run();
	}, [client, error, isLoading, options.fields, options.limit, output]);

	return <Text>{output || printJson(ok([], {status: 'loading'}))}</Text>;
}
