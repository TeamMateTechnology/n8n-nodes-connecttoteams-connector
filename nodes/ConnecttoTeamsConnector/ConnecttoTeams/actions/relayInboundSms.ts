import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import {
	collectValues,
	INBOUND_URL,
	NUMBER_SEPARATORS,
	pruneEmpty,
	smsrRequest,
	toText,
	URL_SEPARATORS,
} from '../../shared/transport';

/**
 * Message → Relay Inbound SMS: puts an inbound SMS/MMS from a customer into
 * the matching Teams conversation through the SMS Responder's inbound endpoint.
 * `status: received` is what routes it as an inbound message (MT_ statuses
 * make it a delivery report instead); `provider` is fixed.
 *
 * Group Recipients is optional: SMSR shapes it like a carrier's inbound "to"
 * list (receiving DID added, sender removed, numbers normalized), which routes
 * the message into the group Teams conversation instead of a 1:1 chat.
 */

const STATUS = 'received';
const PROVIDER = 'generic';

const show = { resource: ['message'], operation: ['relayInbound'] };

export const description: INodeProperties[] = [
	{
		displayName: 'Source',
		name: 'source',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+15559876543',
		description: 'Who sent the message ("from") — the customer\'s phone number',
		displayOptions: { show },
	},
	{
		displayName: 'Destination',
		name: 'destination',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+15551230000',
		description:
			'Your ConnecttoTeams phone number that received the message ("to"). The credential\'s token must belong to this number. Any common format works.',
		displayOptions: { show },
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		description: 'Text body of the message',
		displayOptions: { show },
	},
	{
		displayName: 'Message ID',
		name: 'message_id',
		type: 'string',
		default: '',
		description: 'Optional identifier. The responder stores it as the message\'s carrier_msg_id.',
		displayOptions: { show },
	},
	{
		displayName: 'Media URLs',
		name: 'media_url',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		// For a fixedCollection, n8n uses the placeholder as the add-row button's label.
		placeholder: 'Add Media URL',
		default: {},
		description:
			'Optional image URLs (MMS). A row may also hold several URLs separated by commas or new lines, or an array from an expression.',
		options: [
			{
				name: 'medias',
				displayName: 'Media URL',
				values: [
					{
						displayName: 'URL',
						name: 'value',
						type: 'string',
						default: '',
						placeholder: 'https://example.com/image.jpg',
					},
				],
			},
		],
		displayOptions: { show },
	},
	{
		displayName: 'Group Recipients',
		name: 'group_recipients',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		// For a fixedCollection, n8n uses the placeholder as the add-row button's label.
		placeholder: 'Add Recipient',
		default: {},
		description:
			'Optional. The other participants in this group conversation, in any format (+14135550111, 4135550111, (413) 555-0111). The responder adds the receiving number and leaves out the sender, so you only need to list the others. Leave empty for a normal 1:1 relay; set it to route this message into the group Teams conversation instead.',
		options: [
			{
				name: 'recipients',
				displayName: 'Recipient',
				values: [
					{
						displayName: 'Phone Number',
						name: 'value',
						type: 'string',
						default: '',
						placeholder: '+15559876543',
					},
				],
			},
		],
		displayOptions: { show },
	},
];

export async function execute(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const body = pruneEmpty({
		message_id: toText(this.getNodeParameter('message_id', i, '')).trim(),
		status: STATUS,
		provider: PROVIDER,
		source: toText(this.getNodeParameter('source', i)).trim(),
		destination: toText(this.getNodeParameter('destination', i)).trim(),
		text: toText(this.getNodeParameter('message', i, '')),
		timestamp: new Date().toISOString(),
		media_url: collectValues(this.getNodeParameter('media_url', i, {}) as IDataObject, 'medias', URL_SEPARATORS),
		group_recipients: collectValues(
			this.getNodeParameter('group_recipients', i, {}) as IDataObject,
			'recipients',
			NUMBER_SEPARATORS,
		),
	});

	return await smsrRequest.call(this, i, INBOUND_URL, body);
}
