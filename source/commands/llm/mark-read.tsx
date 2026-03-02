import React from 'react';
import {Text} from 'ink';
import zod from 'zod';
import {argument} from 'pastel';
import {useInstagramClient} from '../../ui/hooks/use-instagram-client.js';
import {fail, ok, printJson} from '../../utils/llm.js';

export const args = zod.tuple([
	zod.string().describe(argument({name: 'threadId', description: 'Thread ID'})),
	zod
		.string()
		.describe(
			argument({name: 'itemId', description: 'Latest item/message ID'}),
		),
	zod
		.string()
		.optional()
		.describe(
			argument({name: 'username', description: 'Session username (optional)'}),
		),
]);

type Properties = {readonly args: zod.infer<typeof args>};

export default function LlmMarkRead({args}: Properties) {
	const [threadId, itemId, username] = args;
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
				await client.markThreadAsSeen(threadId, itemId);
				setOutput(printJson(ok({marked: true, threadId, itemId})));
			} catch (error_) {
				setOutput(
					printJson(
						fail(
							'MARK_READ_FAILED',
							error_ instanceof Error ? error_.message : String(error_),
							true,
						),
					),
				);
			}
		};

		void run();
	}, [client, error, isLoading, itemId, output, threadId]);

	return <Text>{output || printJson(ok({status: 'loading'}))}</Text>;
}
