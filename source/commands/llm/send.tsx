import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import React from 'react';
import {Text} from 'ink';
import zod from 'zod';
import {argument, option} from 'pastel';
import {useInstagramClient} from '../../ui/hooks/use-instagram-client.js';
import {fail, ok, printJson} from '../../utils/llm.js';

const IDEMPOTENCY_PATH = path.join(
	os.homedir(),
	'.instagram-cli',
	'llm-idempotency.json',
);

type IdempotencyStore = Record<string, {timestamp: string}>;

async function loadStore(): Promise<IdempotencyStore> {
	try {
		const data = await fs.readFile(IDEMPOTENCY_PATH, 'utf8');
		return JSON.parse(data) as IdempotencyStore;
	} catch {
		return {};
	}
}

async function saveStore(store: IdempotencyStore): Promise<void> {
	await fs.mkdir(path.dirname(IDEMPOTENCY_PATH), {recursive: true});
	await fs.writeFile(IDEMPOTENCY_PATH, JSON.stringify(store), 'utf8');
}

export const args = zod.tuple([
	zod
		.string()
		.describe(argument({name: 'threadId', description: 'Target thread ID'})),
	zod.string().describe(argument({name: 'text', description: 'Message text'})),
	zod
		.string()
		.optional()
		.describe(
			argument({name: 'username', description: 'Session username (optional)'}),
		),
]);

export const options = zod.object({
	idempotencyKey: zod
		.string()
		.optional()
		.describe(option({description: 'Prevent duplicate sends for same key'})),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function LlmSend({args, options}: Properties) {
	const [threadId, text, username] = args;
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
				if (options.idempotencyKey) {
					const store = await loadStore();
					if (store[options.idempotencyKey]) {
						setOutput(
							printJson(
								ok({
									sent: false,
									duplicate: true,
									idempotencyKey: options.idempotencyKey,
								}),
							),
						);
						return;
					}

					await client.sendMessage(threadId, text);
					store[options.idempotencyKey] = {timestamp: new Date().toISOString()};
					await saveStore(store);
					setOutput(
						printJson(
							ok({
								sent: true,
								duplicate: false,
								idempotencyKey: options.idempotencyKey,
							}),
						),
					);
					return;
				}

				await client.sendMessage(threadId, text);
				setOutput(printJson(ok({sent: true})));
			} catch (error_) {
				setOutput(
					printJson(
						fail(
							'SEND_FAILED',
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
		options.idempotencyKey,
		output,
		text,
		threadId,
	]);

	return <Text>{output || printJson(ok({status: 'loading'}))}</Text>;
}
