import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import {
	NodeConnectionTypes,
	type IDataObject,
	type IWebhookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookResponseData,
} from 'n8n-workflow';

/**
 * ConnecttoTeams Trigger (formerly "SMS From ConnecttoTeams Trigger") — listener / trigger node.
 * n8n lists it in the ConnecttoTeams app panel because its type-ID is the action
 * node's type-ID plus "Trigger" (connecttoTeams / connecttoTeamsTrigger).
 *
 * Registers a POST webhook at a user-defined path and starts the workflow when
 * the ConnecttoTeams platform posts an SMS event. "From ConnecttoTeams" = the message flows
 * from the platform into n8n.
 *
 * INPUT is fixed to what GenericCarrierDispatcher#send_message_via_gateway
 * actually POSTs (the SMS Responder's app/lib/dispatchers/generic_carrier_dispatcher.rb):
 *   { source, destination, text, media_url[], recpients[] }
 * Only those key names are read — no aliases (`from`/`to`/`message`/…).
 * `destination` is a single number for a 1:1 message but an ARRAY for a group
 * text (every participant except the sender). `recpients` — misspelled in the
 * dispatcher — is the full group including the sender, so it adds nothing over
 * `destination` and is not read.
 *
 * OUTPUT:
 *   { source, destination, recipients[], is_group, text, media_url[], carrier_msg_id }
 * `recipients` is every number to deliver to (one entry for 1:1); `destination`
 * is the same list comma-joined, so 1:1 workflows can keep mapping a single
 * string. Numbers are emitted as E.164 with a leading "+" (the dispatcher sends
 * the destination without one).
 * All keys are always present, whatever the incoming payload looks like.
 * That is what makes the fields mappable in downstream nodes before the trigger
 * has ever fired — n8n derives its output schema from the emitted item, so the
 * shape must not vary with the request body.
 *
 * The dispatcher is acknowledged IMMEDIATELY (`responseMode: onReceived`) with
 * `{ carrier_msg_id }`; the workflow then runs on without it waiting.
 *
 * AUTH: the dispatcher sends `Authorization: Bearer <carrier api_secret>`.
 * Verifying it is this node's job (the responder only sends it), so every
 * request must carry the key from the required "ConnecttoTeams Gateway
 * API" credential. A missing or wrong key gets a 401 `{ error }` and the
 * workflow does not start — the responder records that as a credentials
 * rejection on the failed message.
 */

const GATEWAY_CREDENTIAL = 'connecttoTeamsGatewayApi';

/**
 * Constant-time check of an `Authorization: Bearer <key>` header against the
 * expected key. Both sides are hashed first so timingSafeEqual always compares
 * equal-length buffers and the key length isn't leaked. A blank expected key
 * fails closed rather than letting every request through.
 */
function isAuthorized(authorizationHeader: string | undefined, expectedKey: string): boolean {
	const expected = (expectedKey ?? '').trim();
	if (!expected) return false;

	const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader ?? '');
	if (!match) return false;

	const presented = createHash('sha256').update(match[1].trim()).digest();
	return timingSafeEqual(presented, createHash('sha256').update(expected).digest());
}

/**
 * The dispatcher payload this node accepts. `recpients` is not read (see above).
 *
 * Deliberately NOT `extends IDataObject`: the values arrive unvalidated, and
 * `unknown` is not assignable to that interface's index signature. The helpers
 * below narrow each field instead.
 */
interface CarrierDispatchBody {
	source?: unknown;
	destination?: unknown;
	/** The dispatcher sends the body as `text`. */
	text?: unknown;
	media_url?: unknown;
}

/** The output contract. Every emitted item has exactly these keys. */
interface ConnecttoTeamsTriggerOutput extends IDataObject {
	source: string;
	/** Comma-joined `recipients` — a single number for 1:1 messages. */
	destination: string;
	/** Every number to deliver to: one entry for 1:1, all participants but the sender for a group. */
	recipients: string[];
	/** True when the dispatcher sent a group text (`destination` as an array). */
	is_group: boolean;
	text: string;
	media_url: string[];
	/** Added in webhook(); the same id sent back to the dispatcher as the ack. */
	carrier_msg_id?: string;
}

/** Coerces a dispatcher scalar to a string; anything else becomes ''. */
function toText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	return '';
}

/**
 * Formats a dispatcher phone number as E.164 with a leading "+". The responder
 * sends normalized digits without it (e.g. "15559876543"); anything that isn't
 * bare digits is passed through trimmed rather than guessed at.
 */
function toE164(value: unknown): string {
	const text = toText(value).trim();
	return /^\d+$/.test(text) ? `+${text}` : text;
}

/** Coerces the destination (number, or array of numbers for a group) to a clean string[]. */
function toNumberList(value: unknown): string[] {
	const entries: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
	return entries.map(toE164).filter((entry) => entry.length > 0);
}

/**
 * Coerces the media field (array, bare string, or absent) to a clean string[].
 * Entries may be URL strings or objects with a `url` — SMSR forwards media
 * already hosted on its file_preview endpoint (e.g. an image sent from Teams)
 * as `{ url, fileName }` objects, which must not be silently dropped.
 */
function toUrlList(value: unknown): string[] {
	// Typed explicitly: Array.isArray() widens an `unknown` to `any[]`.
	const entries: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
	return entries
		.map((entry) => {
			if (typeof entry === 'string') return entry.trim();
			if (entry !== null && typeof entry === 'object') {
				const url = (entry as { url?: unknown }).url;
				return typeof url === 'string' ? url.trim() : '';
			}
			return '';
		})
		.filter((entry) => entry.length > 0);
}

/** Maps the dispatcher payload onto the fixed output contract. */
function toOutput(body: CarrierDispatchBody): ConnecttoTeamsTriggerOutput {
	const recipients = toNumberList(body.destination);
	return {
		source: toE164(body.source),
		destination: recipients.join(','),
		recipients,
		is_group: Array.isArray(body.destination),
		text: toText(body.text),
		media_url: toUrlList(body.media_url),
	};
}

export class ConnecttoTeamsTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ConnecttoTeams Trigger',
		// Type-ID: changing it breaks every saved workflow that uses this trigger.
		// Must stay `<action node name>Trigger`, or n8n lists it as a separate app.
		// (Was connecttoTeamsSmsTrigger before the action nodes were merged.)
		name: 'connecttoTeamsTrigger',
		// Single icon for both themes — see connecttoteams-logo.svg's own comment for why
		// it's a wrapped raster image rather than real vector artwork.
		icon: 'file:../connecttoteams-logo.svg',
		group: ['trigger'],
		version: 1,
		description:
			'Start a workflow whenever ConnecttoTeams hands this workflow an outgoing SMS to deliver (generic carrier), e.g. to send it through your own SMS provider',
		defaults: {
			name: 'ConnecttoTeams Trigger',
		},
		// Lets a manual run resolve immediately instead of blocking on a live POST,
		// so the output shape is available to downstream nodes right away.
		mockManualExecution: true,
		// Required by the community-nodes lint, and the type only allows `true`.
		// It has no effect here: n8n builds agent tools from nodes with an
		// execute(), which a webhook trigger doesn't have.
		usableAsTool: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: GATEWAY_CREDENTIAL,
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				// Acknowledge as soon as the message is received — the workflow runs on
				// afterwards without the dispatcher waiting for it. The ack body itself
				// is built in webhook() below.
				responseMode: 'onReceived',
				path: '={{$parameter["path"]}}',
			},
		],
		properties: [
			{
				// n8n's node panel lists a trigger's events from its "event" options,
				// using each option's `action` as the label; without this field it
				// shows the generic "On new ConnecttoTeams event". There is one event.
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Outbound SMS',
						value: 'outboundSms',
						description: 'A message sent from Teams that ConnecttoTeams hands this workflow to deliver',
						action: 'On outbound SMS from ConnecttoTeams',
					},
				],
				default: 'outboundSms',
				description: 'The ConnecttoTeams event that starts this workflow',
			},
			{
				displayName:
					'Point a ConnecttoTeams generic carrier at this webhook URL and set the carrier\'s api_secret to this trigger\'s Gateway API Auth Key; requests without that key are rejected (401). Each message is acknowledged immediately and outputs <code>source</code>, <code>destination</code>, <code>recipients</code>, <code>is_group</code>, <code>text</code>, <code>media_url</code> and <code>carrier_msg_id</code> (use it as the Message ID in the ConnecttoTeams node’s Update Delivery Status action).',
				name: 'outputNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Webhook Path',
				name: 'path',
				type: 'string',
				required: true,
				default: 'connecttoteams-incoming',
				placeholder: 'connecttoteams-incoming',
				description:
					'Last segment of this trigger\'s webhook URL. Copy the full Production URL from Webhook URLs above; n8n puts an ID before the path (POST /webhook/&lt;ID&gt;/&lt;path&gt;). Must be unique across your active workflows — give each trigger its own path, e.g. one per generic carrier or DID; two active workflows on the same path conflict.',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const { authKey } = await this.getCredentials<{ authKey: string }>(GATEWAY_CREDENTIAL);
		if (!isAuthorized(this.getHeaderData().authorization, authKey)) {
			// `error` is the first key GenericCarrierDispatcher reads off a non-2xx body.
			this.getResponseObject().status(401).json({ error: 'Invalid or missing gateway auth key' });
			return { noWebhookResponse: true };
		}

		const body = (this.getBodyData() ?? {}) as CarrierDispatchBody;

		// One id per received message, generated here because the dispatcher's
		// payload carries none. It is both the acknowledgement the dispatcher stores
		// and a field on the emitted item, so the workflow can correlate the two.
		const carrierMsgId = randomUUID();

		// The ack is written here, before the workflow runs:
		// GenericCarrierDispatcher#get_carrier_msg_id_from_response parses exactly
		// this key off the 2xx body and stores it on the outbound history.
		// It is sent directly (like the 401 above) rather than returned as
		// `webhookResponse`: with responseMode onReceived, n8n 2.14 ignores
		// `webhookResponse` and answers with the literal text "firstEntryJson",
		// which left SMSR with no carrier_msg_id to match delivery reports against.
		this.getResponseObject().status(200).json({ carrier_msg_id: carrierMsgId });

		// An empty or partial body still yields the same keys (empty values), so the
		// output schema never varies between requests.
		return {
			noWebhookResponse: true,
			workflowData: [[{ json: { ...toOutput(body), carrier_msg_id: carrierMsgId } }]],
		};
	}
}
