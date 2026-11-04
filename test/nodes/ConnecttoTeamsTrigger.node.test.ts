import type { IWebhookFunctions } from 'n8n-workflow';

import { ConnecttoTeamsTrigger } from '../../nodes/ConnecttoTeamsConnector/ConnecttoTeamsTrigger/ConnecttoTeamsTrigger.node';

/**
 * Minimal fake IWebhookFunctions — only what webhook() calls: getCredentials,
 * getHeaderData, getBodyData and getResponseObject (the 200 ack and the 401).
 */
function createMockWebhookFunctions(options: {
	authKey?: string;
	authorization?: string;
	body?: Record<string, unknown>;
}) {
	const json = jest.fn();
	const status = jest.fn(() => ({ json }));
	const context = {
		getCredentials: jest.fn(async () => ({ authKey: options.authKey ?? '' })),
		getHeaderData: jest.fn(() =>
			options.authorization === undefined ? {} : { authorization: options.authorization },
		),
		getBodyData: jest.fn(() => options.body ?? {}),
		getResponseObject: jest.fn(() => ({ status })),
	};
	return { context: context as unknown as IWebhookFunctions, status, json };
}

const DISPATCHER_BODY = {
	source: '+15551230000',
	destination: '15559876543',
	text: 'hello',
	media_url: ['https://cdn/img.jpg'],
	recpients: ['+15550000001'],
};

describe('ConnecttoTeamsTrigger', () => {
	const trigger = new ConnecttoTeamsTrigger();

	it('requires the gateway auth key credential', () => {
		expect(trigger.description.credentials).toEqual([
			{ name: 'connecttoTeamsGatewayApi', required: true },
		]);
	});

	it('acknowledges a correctly authenticated request and starts the workflow', async () => {
		const { context, status, json } = createMockWebhookFunctions({
			authKey: 'gw-secret',
			authorization: 'Bearer gw-secret',
			body: DISPATCHER_BODY,
		});

		const result = await trigger.webhook.call(context);

		// The ack is written directly: n8n 2.14 ignores `webhookResponse` in
		// onReceived mode and would answer "firstEntryJson" instead.
		expect(status).toHaveBeenCalledWith(200);
		expect(json).toHaveBeenCalledTimes(1);
		const carrierMsgId = (json.mock.calls[0] as unknown as [{ carrier_msg_id: string }])[0].carrier_msg_id;
		expect(carrierMsgId).toEqual(expect.any(String));
		expect(result.noWebhookResponse).toBe(true);
		expect(result.webhookResponse).toBeUndefined();
		expect(result.workflowData).toEqual([
			[
				{
					json: {
						source: '+15551230000',
						// The dispatcher sends the destination without "+"; output is E.164.
						destination: '+15559876543',
						recipients: ['+15559876543'],
						is_group: false,
						text: 'hello',
						media_url: ['https://cdn/img.jpg'],
						carrier_msg_id: carrierMsgId,
					},
				},
			],
		]);
	});

	it('keeps the recipients of a group text (destination arrives as an array)', async () => {
		const { context } = createMockWebhookFunctions({
			authKey: 'gw-secret',
			authorization: 'Bearer gw-secret',
			body: {
				source: '+15551230000',
				// GenericCarrierDispatcher: every participant except the sender.
				destination: ['15550000001', '15550000002'],
				text: 'group hello',
				recpients: ['15550000001', '15550000002', '15551230000'],
			},
		});

		const result = await trigger.webhook.call(context);
		const json = result.workflowData?.[0][0].json;

		expect(json).toMatchObject({
			source: '+15551230000',
			destination: '+15550000001,+15550000002',
			recipients: ['+15550000001', '+15550000002'],
			is_group: true,
		});
	});

	it('keeps media sent as { url } objects (media already hosted by SMSR, e.g. an image sent from Teams)', async () => {
		const { context } = createMockWebhookFunctions({
			authKey: 'k',
			authorization: 'Bearer k',
			body: {
				source: '+15551230000',
				destination: '15559876543',
				media_url: [
					{ url: 'https://smsbot/bot_actions/file_preview/abc/photo.jpg', fileName: 'photo.jpg' },
					'https://cdn/img.png',
					{ fileName: 'no-url.jpg' },
				],
			},
		});

		const result = await trigger.webhook.call(context);

		expect(result.workflowData?.[0][0].json.media_url).toEqual([
			'https://smsbot/bot_actions/file_preview/abc/photo.jpg',
			'https://cdn/img.png',
		]);
	});

	it('emits the full fixed shape for an empty body', async () => {
		const { context } = createMockWebhookFunctions({ authKey: 'k', authorization: 'Bearer k', body: {} });

		const result = await trigger.webhook.call(context);

		expect(result.workflowData?.[0][0].json).toEqual({
			source: '',
			destination: '',
			recipients: [],
			is_group: false,
			text: '',
			media_url: [],
			carrier_msg_id: expect.any(String),
		});
	});


	it('tolerates surrounding whitespace in the stored key and the header', async () => {
		const { context, status } = createMockWebhookFunctions({
			authKey: '  gw-secret \n',
			authorization: 'bearer   gw-secret ',
		});

		const result = await trigger.webhook.call(context);

		expect(status).toHaveBeenCalledWith(200);
		expect(result.workflowData).toBeDefined();
	});

	it.each([
		['a wrong key', 'Bearer not-the-secret'],
		['a key without the Bearer scheme', 'gw-secret'],
		['an empty Bearer value', 'Bearer '],
		['no Authorization header', undefined],
	])('rejects %s with 401 and does not start the workflow', async (_label, authorization) => {
		const { context, status, json } = createMockWebhookFunctions({
			authKey: 'gw-secret',
			authorization,
			body: DISPATCHER_BODY,
		});

		const result = await trigger.webhook.call(context);

		expect(status).toHaveBeenCalledWith(401);
		// GenericCarrierDispatcher reads `error` off the body as the rejection reason.
		expect(json).toHaveBeenCalledWith({ error: 'Invalid or missing gateway auth key' });
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('fails closed when the credential has a blank auth key', async () => {
		const { context, status } = createMockWebhookFunctions({
			authKey: '   ',
			authorization: 'Bearer ',
		});

		const result = await trigger.webhook.call(context);

		expect(status).toHaveBeenCalledWith(401);
		expect(result).toEqual({ noWebhookResponse: true });
	});
});
