import React from 'react';
import {Text} from 'ink';
import zod from 'zod';
import {argument, option} from 'pastel';
import {useInstagramClient} from '../../ui/hooks/use-instagram-client.js';
import {fail, ok, printJson} from '../../utils/llm.js';

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
	hours: zod
		.number()
		.int()
		.min(1)
		.max(168)
		.default(24)
		.describe(option({description: 'Lookback hours'})),
	maxBullets: zod
		.number()
		.int()
		.min(1)
		.max(20)
		.default(8)
		.describe(option({description: 'Maximum summary bullets'})),
	maxMessages: zod
		.number()
		.int()
		.min(1)
		.max(200)
		.default(80)
		.describe(option({description: 'Maximum messages to inspect'})),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function LlmSummarize({args, options}: Properties) {
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
				const {messages} = await client.getMessages(threadId);
				const cutoff = Date.now() - options.hours * 60 * 60 * 1000;
				const recent = messages
					.filter(message => message.timestamp.getTime() >= cutoff)
					.slice(-options.maxMessages)
					.filter(
						(
							message,
						): message is Extract<
							(typeof messages)[number],
							{itemType: 'text'}
						> => message.itemType === 'text' && message.text.trim().length > 0,
					);

				const bullets = recent
					.map(message => `@${message.username}: ${message.text.trim()}`)
					.slice(-options.maxBullets);

				setOutput(
					printJson(
						ok({
							threadId,
							hours: options.hours,
							messageCount: recent.length,
							bullets,
						}),
					),
				);
			} catch (error_) {
				setOutput(
					printJson(
						fail(
							'SUMMARY_FAILED',
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
		options.hours,
		options.maxBullets,
		options.maxMessages,
		output,
		threadId,
	]);

	return <Text>{output || printJson(ok({status: 'loading'}))}</Text>;
}
