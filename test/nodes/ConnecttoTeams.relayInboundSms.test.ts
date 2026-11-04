import { ConnecttoTeams } from '../../nodes/ConnecttoTeamsConnector/ConnecttoTeams/ConnecttoTeams.node';
import { createMockExecuteFunctions } from '../helpers/mockExecuteFunctions';

// Mirrors SEND_URL / INBOUND_URL in shared/transport.ts (production host).
const ENDPOINT_URL = 'https://smsbot.connecttoteams.com/n8n-inbound';

describe('ConnecttoTeams → Message → Relay Inbound SMS', () => {
	function run(
		params: Array<Record<string, unknown>>,
		credentials: Array<Record<string, unknown>>,
		options?: { httpRequest?: jest.Mock; continueOnFail?: boolean },
	) {
		const httpRequest =
			options?.httpRequest ?? jest.fn().mockResolvedValue({ message: 'Received JSON message' });
		const items = params.map(() => ({ json: {} }));
		const context = createMockExecuteFunctions({
			items,
			params: params.map((p) => ({ resource: 'message', operation: 'relayInbound', ...p })),
			credentials,
			httpRequest,
			continueOnFail: options?.continueOnFail,
		});
		const node = new ConnecttoTeams();
		return { result: node.execute.call(context), context, httpRequest };
	}

	it('POSTs to the fixed endpoint with fixed status/provider and the credential token', async () => {
		const { result, httpRequest } = run(
			[{ source: '+15551230000', destination: '+15559876543', message: 'Hi' }],
			[{ accessToken: 'secret-token' }],
		);
		await result;

		expect(httpRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				method: 'POST',
				url: ENDPOINT_URL,
				headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
				body: expect.objectContaining({
					source: '+15551230000',
					destination: '+15559876543',
					text: 'Hi',
					status: 'received',
					provider: 'generic',
				}),
			}),
		);
	});

	it('trims whitespace around the access token, like the send nodes', async () => {
		const { result, httpRequest } = run(
			[{ source: '+1', destination: '+2', message: 'Hi' }],
			[{ accessToken: '  secret-token \n' }],
		);
		await result;
		expect(httpRequest.mock.calls[0][0].headers.Authorization).toBe('Bearer secret-token');
	});

	it('passes message_id through and omits it when not set', async () => {
		const withId = run(
			[{ source: '+1', destination: '+2', message: 'Hi', message_id: 'abc-123' }],
			[{ accessToken: 't' }],
		);
		await withId.result;
		expect(withId.httpRequest.mock.calls[0][0].body.message_id).toBe('abc-123');

		const withoutId = run([{ source: '+1', destination: '+2', message: 'Hi' }], [{ accessToken: 't' }]);
		await withoutId.result;
		expect(withoutId.httpRequest.mock.calls[0][0].body).not.toHaveProperty('message_id');
	});

	it('flattens the media_url fixedCollection into a plain array', async () => {
		const { result, httpRequest } = run(
			[
				{
					source: '+1',
					destination: '+2',
					message: 'Hi',
					media_url: { medias: [{ value: 'https://a' }, { value: '  ' }, { value: 'https://b' }] },
				},
			],
			[{ accessToken: 't' }],
		);
		await result;
		expect(httpRequest.mock.calls[0][0].body.media_url).toEqual(['https://a', 'https://b']);
	});

	it('flattens the group_recipients fixedCollection into a plain array, and omits it when empty', async () => {
		const withRecipients = run(
			[
				{
					source: '+1',
					destination: '+2',
					message: 'Hi',
					group_recipients: { recipients: [{ value: '+3' }, { value: '  ' }, { value: '+4' }] },
				},
			],
			[{ accessToken: 't' }],
		);
		await withRecipients.result;
		expect(withRecipients.httpRequest.mock.calls[0][0].body.group_recipients).toEqual(['+3', '+4']);

		const withoutRecipients = run(
			[{ source: '+1', destination: '+2', message: 'Hi' }],
			[{ accessToken: 't' }],
		);
		await withoutRecipients.result;
		expect(withoutRecipients.httpRequest.mock.calls[0][0].body).not.toHaveProperty('group_recipients');
	});

	// Same per-item credential concern as Send SMS — see ConnecttoTeams.sendSms.test.ts.
	it('resolves the credential per item, not once for the whole batch', async () => {
		const params = [
			{ source: '+1', destination: '+2', message: 'A' },
			{ source: '+3', destination: '+4', message: 'B' },
		];
		const credentials = [{ accessToken: 'token-0' }, { accessToken: 'token-1' }];
		const { result, context, httpRequest } = run(params, credentials);
		await result;

		expect((context.getCredentials as jest.Mock).mock.calls).toEqual([
			['connecttoTeamsConnectorApi', 0],
			['connecttoTeamsConnectorApi', 1],
		]);
		expect(httpRequest.mock.calls[0][0].headers.Authorization).toBe('Bearer token-0');
		expect(httpRequest.mock.calls[1][0].headers.Authorization).toBe('Bearer token-1');
	});

	it('reports the error per item and continues when continueOnFail is set', async () => {
		const httpRequest = jest.fn().mockRejectedValue(new Error('boom'));
		const { result } = run([{ source: '+1', destination: '+2', message: 'A' }], [{ accessToken: 't' }], {
			httpRequest,
			continueOnFail: true,
		});

		const [returnData] = await result;
		expect(returnData[0].json).toEqual({ error: 'boom' });
	});

	it('throws when continueOnFail is not set', async () => {
		const httpRequest = jest.fn().mockRejectedValue(new Error('boom'));
		const { result } = run([{ source: '+1', destination: '+2', message: 'A' }], [{ accessToken: 't' }], {
			httpRequest,
			continueOnFail: false,
		});

		await expect(result).rejects.toThrow();
	});
});
