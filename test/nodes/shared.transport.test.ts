import { NodeApiError, NodeOperationError, type IExecuteFunctions } from 'n8n-workflow';

import { ConnecttoTeams } from '../../nodes/ConnecttoTeamsConnector/ConnecttoTeams/ConnecttoTeams.node';
import { createMockExecuteFunctions } from '../helpers/mockExecuteFunctions';

// Behaviour shared by the ConnecttoTeams node's actions via nodes/ConnecttoTeamsConnector/shared/transport.ts,
// exercised through the real node.

type Operation = { resource: string; operation: string };
const SEND: Operation = { resource: 'message', operation: 'send' };
const SEND_GROUP: Operation = { resource: 'message', operation: 'sendGroup' };
const RELAY_INBOUND: Operation = { resource: 'message', operation: 'relayInbound' };

function run(
	op: Operation,
	params: Record<string, unknown>,
	options?: { httpRequest?: jest.Mock; continueOnFail?: boolean; accessToken?: unknown },
) {
	const httpRequest = options?.httpRequest ?? jest.fn().mockResolvedValue({ smsr_id: 1, carrier_msg_id: 'cm-1' });
	const context = createMockExecuteFunctions({
		items: [{ json: {} }],
		params: [{ ...op, ...params }],
		credentials: [{ accessToken: options && 'accessToken' in options ? options.accessToken : 'secret-token' }],
		httpRequest,
		continueOnFail: options?.continueOnFail,
	});
	return { result: new ConnecttoTeams().execute.call(context as IExecuteFunctions), context, httpRequest };
}

/** Stand-in for axios' error class: NodeApiError keys off `constructor.name === 'AxiosError'`. */
class AxiosError extends Error {
	isAxiosError = true;
	constructor(
		message: string,
		public response: { status: number; data: unknown },
	) {
		super(message);
	}
}

/** The AxiosError httpRequest throws for an SMSR error response (the mock wraps it in NodeApiError). */
function smsrRejection(status: number, data: unknown) {
	return new AxiosError(`Request failed with status code ${status}`, { status, data });
}

const sendParams = { source: '+15551230000', destination: '+15559876543', message: 'Hi' };

describe('shared transport', () => {
	describe('authentication', () => {
		it('sends through httpRequestWithAuthentication with the per-item credential as credentialsDecrypted', async () => {
			const { result, context } = run(SEND, sendParams, { accessToken: '  secret-token \n' });
			await result;

			const call = (context.helpers.httpRequestWithAuthentication as jest.Mock).mock.calls[0];
			expect(call[0]).toBe('connecttoTeamsConnectorApi');
			expect(call[2]).toEqual({
				credentialsDecrypted: expect.objectContaining({
					type: 'connecttoTeamsConnectorApi',
					data: { accessToken: 'secret-token' },
				}),
			});
		});

		it.each([[''], ['   '], [undefined], [null]])(
			'rejects a missing Access Token (%p) as a configuration error, without sending',
			async (accessToken) => {
				const { result, httpRequest } = run(SEND, sendParams, { accessToken });

				await expect(result).rejects.toThrow(NodeOperationError);
				await expect(result).rejects.toThrow(/no Access Token/);
				expect(httpRequest).not.toHaveBeenCalled();
			},
		);
	});

	describe('SMSR error text', () => {
		it("leads with SMSR's `errors` text and the HTTP code instead of a generic message", async () => {
			const httpRequest = jest
				.fn()
				.mockRejectedValue(smsrRejection(404, { errors: 'No message with message_id "x" sent from 15551230000' }));
			const { result } = run(SEND, sendParams, { httpRequest });

			await expect(result).rejects.toThrow(NodeApiError);
			await expect(result).rejects.toMatchObject({
				message: 'No message with message_id "x" sent from 15551230000',
				httpCode: '404',
			});
		});

		it('reads `message` too (SMSR 401 bodies)', async () => {
			const httpRequest = jest.fn().mockRejectedValue(smsrRejection(401, { message: 'Unauthorized request' }));
			const { result } = run(SEND, sendParams, { httpRequest });

			await expect(result).rejects.toMatchObject({ message: 'Unauthorized request', httpCode: '401' });
		});

		it('the installed n8n-workflow drops `cause` and keeps the body in context.data (the case this code handles)', () => {
			const wrapped = new NodeApiError(
				{ name: 'Test Node', type: 'test.node', typeVersion: 1 } as never,
				smsrRejection(400, { errors: 'x' }) as never,
			);

			expect(wrapped.message).toBe('Bad request - please check your parameters');
			expect(wrapped.httpCode).toBe('400');
			expect(wrapped.context.data).toEqual({ errors: 'x' });
		});

		it('finds the response on a NodeApiError that keeps `cause` (newer n8n)', async () => {
			const node = { name: 'Test Node', type: 'test.node', typeVersion: 1 } as never;
			const axios = smsrRejection(400, {
				errors: 'SMS gateway rejected the credentials for 15551230000 (HTTP 401): bad key',
			});
			const wrapped = new NodeApiError(node, { message: 'Bad request - please check your parameters' });
			Object.defineProperty(wrapped, 'cause', { value: axios });
			const httpRequest = jest.fn().mockRejectedValue(wrapped);
			const { result } = run(SEND, sendParams, { httpRequest });

			await expect(result).rejects.toMatchObject({
				message: 'SMS gateway rejected the credentials for 15551230000 (HTTP 401): bad key',
				httpCode: '400',
			});
		});

		it('ignores a non-HTTP httpCode (e.g. a network error code)', async () => {
			const network = Object.assign(new Error('getaddrinfo ENOTFOUND smsbot'), { code: 'ENOTFOUND' });
			const httpRequest = jest.fn().mockRejectedValue(network);
			const { result } = run(SEND, sendParams, { httpRequest, continueOnFail: true });

			const [items] = (await result) as Array<Array<{ json: Record<string, unknown> }>>;
			expect(items[0].json.http_code).toBeUndefined();
		});

		it('gives Continue On Fail items the SMSR text, HTTP code and response body', async () => {
			const data = { errors: 'Missing or invalid destination phonenumber' };
			const httpRequest = jest.fn().mockRejectedValue(smsrRejection(400, data));
			const { result } = run(SEND, sendParams, { httpRequest, continueOnFail: true });

			const [items] = (await result) as Array<Array<{ json: unknown }>>;
			expect(items[0].json).toEqual({
				error: 'Missing or invalid destination phonenumber',
				http_code: 400,
				response: data,
			});
		});

		it("keeps n8n's own message when there is no HTTP response (network error)", async () => {
			const httpRequest = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND smsbot'));
			const { result } = run(SEND, sendParams, { httpRequest, continueOnFail: true });

			const [items] = (await result) as Array<Array<{ json: { error: string } }>>;
			// n8n maps ENOTFOUND to its own descriptive connection message.
			expect(items[0].json.error).toMatch(/connection cannot be established/i);
		});
	});

	describe('response shape', () => {
		it.each([['a bare string', 'Errors: blocked'], ['an empty body', undefined]])(
			'wraps %s so the output item is always an object',
			async (_label, body) => {
				const httpRequest = jest.fn().mockResolvedValue(body);
				const { result } = run(SEND, sendParams, { httpRequest });

				const [items] = (await result) as Array<Array<{ json: unknown }>>;
				expect(items[0].json).toEqual({ response: body === undefined ? null : body });
			},
		);
	});

	describe('expression values that are not strings', () => {
		it('accepts a numeric destination and source (e.g. from a spreadsheet)', async () => {
			const { result, httpRequest } = run(SEND, {
				...sendParams,
				source: 15551230000,
				destination: 15559876543,
			});
			await result;
			expect(httpRequest.mock.calls[0][0].body).toMatchObject({ source: '15551230000', destination: '15559876543' });
		});

		it('accepts media as an array (e.g. the trigger\'s media_url output)', async () => {
			const { result, httpRequest } = run(SEND, {
				...sendParams,
				media: ['https://a/1.jpg', ' https://a/2.jpg '],
			});
			await result;
			expect(httpRequest.mock.calls[0][0].body.media).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
		});

		it('still rejects an array of two destinations', async () => {
			const { result, httpRequest } = run(SEND, {
				...sendParams,
				destination: ['+15559876543', '+15559876544'],
			});
			await expect(result).rejects.toThrow(/exactly one destination/);
			expect(httpRequest).not.toHaveBeenCalled();
		});

		it('accepts a group recipient row holding an array or a delimited list', async () => {
			const { result, httpRequest } = run(SEND_GROUP, {
				...sendParams,
				group_name: 'Test group',
				recipients: { recipients: [{ value: ['+15550000001', 15550000002] }, { value: '+15550000003; +15550000004' }] },
			});
			await result;
			expect(httpRequest.mock.calls[0][0].body.destination).toEqual([
				'+15550000001',
				'15550000002',
				'+15550000003',
				'+15550000004',
			]);
		});

		it('accepts an array in a Relay Inbound SMS media row', async () => {
			const { result, httpRequest } = run(RELAY_INBOUND, {
				source: '+15559876543',
				destination: '+15551230000',
				media_url: { medias: [{ value: ['https://a/1.jpg', 'https://a/2.jpg'] }] },
			});
			await result;
			expect(httpRequest.mock.calls[0][0].body.media_url).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
		});
	});
});
