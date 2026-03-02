import React from 'react';
import {Text} from 'ink';
import zod from 'zod';
import {argument, option} from 'pastel';
import {useInstagramClient} from '../../ui/hooks/use-instagram-client.js';
import {
	fail,
	ok,
	pickFields,
	printJson,
	splitFields,
	toIso,
} from '../../utils/llm.js';
import {formatUsernamesInText} from '../../utils/notifications.js';

export const args = zod.tuple([
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
		.describe(option({description: 'Max notifications'})),
	fields: zod
		.string()
		.optional()
		.describe(option({description: 'Comma-separated fields'})),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function LlmNotify({args, options}: Properties) {
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
				const newsInbox = await client.getInstagramClient().news.inbox();
				const fields = splitFields(options.fields);
				const stories = [
					...(newsInbox.new_stories ?? []),
					...(newsInbox.old_stories ?? []),
				]
					.slice(0, options.limit)
					.map(story => {
						const s = story as unknown as {
							pk?: string | number;
							id?: string | number;
							story_type?: string | number;
							args?: {rich_text?: string; timestamp?: number};
						};
						const richText = s.args?.rich_text ?? '';
						const timestamp = s.args?.timestamp ?? 0;
						return pickFields(
							{
								id: s.pk ?? s.id,
								text: formatUsernamesInText(richText),
								timestamp: toIso(timestamp * 1000),
								type: s.story_type,
							},
							fields,
						);
					});
				setOutput(printJson(ok(stories, {count: stories.length})));
			} catch (error_) {
				setOutput(
					printJson(
						fail(
							'NOTIFY_FETCH_FAILED',
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
