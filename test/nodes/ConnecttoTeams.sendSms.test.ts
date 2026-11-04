import { ConnecttoTeams } from '../../nodes/ConnecttoTeamsConnector/ConnecttoTeams/ConnecttoTeams.node';
import { createMockExecuteFunctions } from '../helpers/mockExecuteFunctions';

// Mirrors SEND_URL / INBOUND_URL in shared/transport.ts (production host).
const ENDPOINT_URL = 'https://smsbot.connecttoteams.com/n8n-send';

describe('ConnecttoTeams → Message → Send SMS', () => {
	function run(
		params: Array<Record<string, unknown>>,
		credentials: Array<Record<string, unknown>>,
		options?: { httpRequest?: jest.Mock; continueOnFail?: boolean },
	) {
		const httpRequest = options?.httpRequest ?? jest.fn().mockResolvedValue({ ok: true });
		const items = params.map(() => ({ json: {} }));
		const context = createMockExecuteFunctions({
			items,
			params: params.map((p) => ({ resource: 'message', operation: 'send', ...p })),
			credentials,
			httpRequest,
			continueOnFail: options?.continueOnFail,
		});
		const node = new ConnecttoTeams();
		return { result: node.execute.call(context), context, httpRequest };
	}

	it('POSTs to the fixed endpoint with the credential token as a Bearer header', async () => {
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
					message: 'Hi',
					source_app: 'n8n-app',
					msg_type: 'broadcast_sms',
				}),
			}),
		);
	});

	it('sends a single destination as a plain string', async () => {
		const single = run(
			[{ source: '+1', destination: '+15559876543', message: 'Hi' }],
			[{ accessToken: 't' }],
		);
		await single.result;
		expect(single.httpRequest.mock.calls[0][0].body.destination).toBe('+15559876543');
	});

	it('rejects more than one destination — that is Send Outbound Group SMS\'s job now', async () => {
		const httpRequest = jest.fn();
		const { result } = run(
			[{ source: '+1', destination: '+1555,+1666', message: 'Hi' }],
			[{ accessToken: 't' }],
			{ httpRequest },
		);

		await expect(result).rejects.toThrow(/exactly one destination/);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it.each([
		['semicolon', '+15551230001;+15551230002'],
		['newline', '+15551230001\n+15551230002'],
	])('also rejects a %s-separated list — SMSR would fan it out', async (_label, destination) => {
		const httpRequest = jest.fn();
		const { result } = run(
			[{ source: '+1', destination, message: 'Hi' }],
			[{ accessToken: 't' }],
			{ httpRequest },
		);

		await expect(result).rejects.toThrow(/exactly one destination/);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it('keeps a formatted single number with spaces as one destination', async () => {
		const { result, httpRequest } = run(
			[{ source: '+1', destination: '(413) 414-4414', message: 'Hi' }],
			[{ accessToken: 't' }],
		);
		await result;
		expect(httpRequest.mock.calls[0][0].body.destination).toBe('(413) 414-4414');
	});

	it('still reports a multi-destination rejection through continueOnFail rather than throwing', async () => {
		const httpRequest = jest.fn();
		const { result } = run(
			[{ source: '+1', destination: '+1555,+1666', message: 'Hi' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: true },
		);

		const [returnData] = await result;
		expect(returnData[0].json.error).toMatch(/exactly one destination/);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it('parses comma-separated media into an array and omits it when empty', async () => {
		const withMedia = run(
			[{ source: '+1', destination: '+2', message: 'Hi', media: 'https://a, https://b' }],
			[{ accessToken: 't' }],
		);
		await withMedia.result;
		expect(withMedia.httpRequest.mock.calls[0][0].body.media).toEqual([
			'https://a',
			'https://b',
		]);

		const noMedia = run(
			[{ source: '+1', destination: '+2', message: 'Hi', media: '' }],
			[{ accessToken: 't' }],
		);
		await noMedia.result;
		expect(noMedia.httpRequest.mock.calls[0][0].body).not.toHaveProperty('media');
	});

	// The credential is fetched with the current item index specifically so
	// an expression in the Access Token field can resolve differently per
	// item — this is the behavior most likely to silently regress.
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
		const { result } = run(
			[{ source: '+1', destination: '+2', message: 'A' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: true },
		);

		const [returnData] = await result;
		expect(returnData[0].json).toEqual({ error: 'boom' });
	});

	it('throws when continueOnFail is not set', async () => {
		const httpRequest = jest.fn().mockRejectedValue(new Error('boom'));
		const { result } = run(
			[{ source: '+1', destination: '+2', message: 'A' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: false },
		);

		await expect(result).rejects.toThrow();
	});
});
