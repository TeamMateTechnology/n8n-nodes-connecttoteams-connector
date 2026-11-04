import { ConnecttoTeams } from '../../nodes/ConnecttoTeamsConnector/ConnecttoTeams/ConnecttoTeams.node';
import { createMockExecuteFunctions } from '../helpers/mockExecuteFunctions';

// Mirrors SEND_URL / INBOUND_URL in shared/transport.ts (production host).
const ENDPOINT_URL = 'https://smsbot.connecttoteams.com/n8n-inbound';

describe('ConnecttoTeams → Delivery Status → Update', () => {
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
			params: params.map((p) => ({ resource: 'deliveryStatus', operation: 'update', ...p })),
			credentials,
			httpRequest,
			continueOnFail: options?.continueOnFail,
		});
		const node = new ConnecttoTeams();
		return { result: node.execute.call(context), context, httpRequest };
	}

	it('POSTs to the fixed inbound endpoint with the chosen status and the credential token', async () => {
		const { result, httpRequest } = run(
			[
				{
					source: '+15551230000',
					destination: '+15559876543',
					message_id: 'msg-1',
					status: 'MT_DELIVERED',
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
					destination: '+15559876543',
					message_id: 'msg-1',
					status: 'MT_DELIVERED',
					provider: 'generic',
				}),
			}),
		);
		// No text/media_url/group_recipients — handle_delivery_report doesn't read them.
		expect(httpRequest.mock.calls[0][0].body).not.toHaveProperty('text');
		expect(httpRequest.mock.calls[0][0].body).not.toHaveProperty('media_url');
	});

	it('trims whitespace around the access token, like the send nodes', async () => {
		const { result, httpRequest } = run(
			[{ source: '+1', destination: '+2', message_id: 'msg-1', status: 'MT_DELIVERED' }],
			[{ accessToken: '  secret-token \n' }],
		);
		await result;
		expect(httpRequest.mock.calls[0][0].headers.Authorization).toBe('Bearer secret-token');
	});

	it('offers exactly the MT_ delivery-report statuses SMSR accepts', () => {
		const statusProperty = new ConnecttoTeams().description.properties.find(
			(property) => property.name === 'status',
		);
		expect(statusProperty?.type).toBe('options');
		expect(statusProperty?.default).toBe('MT_DELIVERED');
		expect(statusProperty?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'MT_DELIVERED',
			'MT_REJECTED',
		]);
	});

	it.each(['MT_DELIVERED', 'MT_REJECTED'])('sends %s as the status value untouched', async (status) => {
		const { result, httpRequest } = run(
			[{ source: '+1', destination: '+2', message_id: 'msg-1', status }],
			[{ accessToken: 't' }],
		);
		await result;
		expect(httpRequest.mock.calls[0][0].body.status).toBe(status);
	});

	// The credential is fetched with the current item index specifically so
	// an expression in the Access Token field can resolve differently per
	// item — this is the behavior most likely to silently regress.
	it('resolves the credential per item, not once for the whole batch', async () => {
		const params = [
			{ source: '+1', destination: '+2', message_id: 'msg-1', status: 'MT_DELIVERED' },
			{ source: '+3', destination: '+4', message_id: 'msg-2', status: 'MT_REJECTED' },
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
			[{ source: '+1', destination: '+2', message_id: 'msg-1', status: 'MT_DELIVERED' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: true },
		);

		const [returnData] = await result;
		expect(returnData[0].json).toEqual({ error: 'boom' });
	});

	it('throws when continueOnFail is not set', async () => {
		const httpRequest = jest.fn().mockRejectedValue(new Error('boom'));
		const { result } = run(
			[{ source: '+1', destination: '+2', message_id: 'msg-1', status: 'MT_DELIVERED' }],
			[{ accessToken: 't' }],
			{ httpRequest, continueOnFail: false },
		);

		await expect(result).rejects.toThrow();
	});
});
