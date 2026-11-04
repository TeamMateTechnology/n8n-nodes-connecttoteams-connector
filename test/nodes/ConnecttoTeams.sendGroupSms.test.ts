import { ConnecttoTeams } from '../../nodes/ConnecttoTeamsConnector/ConnecttoTeams/ConnecttoTeams.node';
import { createMockExecuteFunctions } from '../helpers/mockExecuteFunctions';

// Mirrors SEND_URL / INBOUND_URL in shared/transport.ts (production host).
const ENDPOINT_URL = 'https://smsbot.connecttoteams.com/n8n-send';

function recipients(...values: string[]) {
	return { recipients: values.map((value) => ({ value })) };
}

describe('ConnecttoTeams → Message → Send Group SMS', () => {
	function run(
		params: Array<Record<string, unknown>>,
		credentials: Array<Record<string, unknown>>,
		options?: { httpRequest?: jest.Mock; continueOnFail?: boolean },
	) {
		const httpRequest = options?.httpRequest ?? jest.fn().mockResolvedValue({ ok: true });
		const items = params.map(() => ({ json: {} }));
		const context = createMockExecuteFunctions({
			items,
			// Group Name is required; tests that don't care about it get a default.
			params: params.map((p) => ({ resource: 'message', operation: 'sendGroup', group_name: 'Test group', ...p })),
			credentials,
			httpRequest,
			continueOnFail: options?.continueOnFail,
		});
		const node = new ConnecttoTeams();
		return { result: node.execute.call(context), context, httpRequest };
	}

	it('POSTs to the fixed endpoint with msg_type=group_text, destination as an array, and the credential token as a Bearer header', async () => {
		const { result, httpRequest } = run(
			[
				{
					source: '+15551230000',
					recipients: recipients('+15559876543', '+15551112222'),
					message: 'Hi team',
				},
			],
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
					destination: ['+15559876543', '+15551112222'],
					message: 'Hi team',
					source_app: 'n8n-app',
					msg_type: 'group_text',
				}),
			}),
		);
		// No group_recipients key at all — SMSR falls back to `destination`
		// when it's absent, so it isn't sent twice.
		expect(httpRequest.mock.calls[0][0].body).not.toHaveProperty('group_recipients');
	});

	it('rejects an empty destination instead of silently omitting it from the request', async () => {
		const httpRequest = jest.fn();
		const { result } = run(
			[{ source: '+1', recipients: recipients(), message: 'Hi' }],
			[{ accessToken: 't' }],
			{ httpRequest },
		);

		await expect(result).rejects.toThrow(/at least one destination/);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it('still reports an empty-destination rejection through continueOnFail rather than throwing', async () => {
		const httpRequest = jest.fn();
		const { result } = run(
			[{ source: '+1', recipients: recipients('  '), message: 'Hi' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: true },
		);

		const [returnData] = await result;
		expect(returnData[0].json.error).toMatch(/at least one destination/);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it('flattens the destination fixedCollection into a plain array, dropping blank entries', async () => {
		const { result, httpRequest } = run(
			[
				{
					source: '+1',
					recipients: recipients('+2', '  ', '+3'),
					message: 'Hi',
				},
			],
			[{ accessToken: 't' }],
		);
		await result;

		expect(httpRequest.mock.calls[0][0].body.destination).toEqual(['+2', '+3']);
	});

	it('passes group_name through, trimmed', async () => {
		const { result, httpRequest } = run(
			[{ source: '+1', recipients: recipients('+2', '+3'), message: 'Hi', group_name: '  Sales team ' }],
			[{ accessToken: 't' }],
		);
		await result;
		expect(httpRequest.mock.calls[0][0].body.group_name).toBe('Sales team');
	});

	it('marks Group Name as a required field', () => {
		const field = new ConnecttoTeams().description.properties.find(
			(p) => p.name === 'group_name' && p.displayOptions?.show?.operation?.includes('sendGroup'),
		);
		expect(field?.required).toBe(true);
	});

	// SD-1275: a group send without a name blanks the stored group name, and the
	// next incoming group text renames the Teams chat to "GroupText_…".
	it.each([
		['missing', undefined],
		['empty', ''],
		['whitespace only', '   '],
	])('rejects a %s Group Name without sending', async (_label, groupName) => {
		const httpRequest = jest.fn();
		const { result } = run(
			[{ source: '+1', recipients: recipients('+2', '+3'), message: 'Hi', group_name: groupName }],
			[{ accessToken: 't' }],
			{ httpRequest },
		);

		await expect(result).rejects.toThrow(/requires a Group Name/);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it('reports a missing Group Name through continueOnFail rather than throwing', async () => {
		const httpRequest = jest.fn();
		const { result } = run(
			[{ source: '+1', recipients: recipients('+2', '+3'), message: 'Hi', group_name: '' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: true },
		);

		const [returnData] = await result;
		expect(returnData[0].json.error).toMatch(/requires a Group Name/);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it('parses comma-separated media into an array and omits it when empty', async () => {
		const withMedia = run(
			[
				{
					source: '+1',
					recipients: recipients('+2', '+3'),
					message: 'Hi',
					media: 'https://a, https://b',
				},
			],
			[{ accessToken: 't' }],
		);
		await withMedia.result;
		expect(withMedia.httpRequest.mock.calls[0][0].body.media).toEqual(['https://a', 'https://b']);

		const noMedia = run(
			[{ source: '+1', recipients: recipients('+2', '+3'), message: 'Hi', media: '' }],
			[{ accessToken: 't' }],
		);
		await noMedia.result;
		expect(noMedia.httpRequest.mock.calls[0][0].body).not.toHaveProperty('media');
	});

	// Same per-item credential concern as Send SMS — see ConnecttoTeams.sendSms.test.ts.
	it('resolves the credential per item, not once for the whole batch', async () => {
		const params = [
			{ source: '+1', recipients: recipients('+2', '+3'), message: 'A' },
			{ source: '+4', recipients: recipients('+5', '+6'), message: 'B' },
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
		const { result } = run(
			[{ source: '+1', recipients: recipients('+2', '+3'), message: 'A' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: true },
		);

		const [returnData] = await result;
		expect(returnData[0].json).toEqual({ error: 'boom' });
	});

	it('throws when continueOnFail is not set', async () => {
		const httpRequest = jest.fn().mockRejectedValue(new Error('boom'));
		const { result } = run(
			[{ source: '+1', recipients: recipients('+2', '+3'), message: 'A' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: false },
		);

		await expect(result).rejects.toThrow();
	});
});
