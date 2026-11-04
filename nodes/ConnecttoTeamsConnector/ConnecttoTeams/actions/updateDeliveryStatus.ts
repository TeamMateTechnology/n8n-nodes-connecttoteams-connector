import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import { INBOUND_URL, pruneEmpty, smsrRequest, toText } from '../../shared/transport';

/**
 * Delivery Status → Update: reports a carrier delivery receipt for a
 * previously sent message through the SMS Responder's inbound endpoint.
 * SMSR treats the request as a delivery report because the status is one of
 * its delivery-report statuses (MT_DELIVERED / MT_REJECTED);
 * any other status is a 400, so Delivery Status is an enum, never free text.
 *
 * SMSR looks the message up by carrier_msg_id (= Message ID) AND source and
 * answers 404 when nothing matches. The token is verified against SOURCE, the
 * DID that sent the original message.
 */

const PROVIDER = 'generic';

const show = { resource: ['deliveryStatus'], operation: ['update'] };

export const description: INodeProperties[] = [
	{
		displayName: 'Source',
		name: 'source',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+15551230000',
		description:
			'Sender of the original message ("from") — your ConnecttoTeams phone number. The credential\'s token must belong to this number. Any common format works.',
		displayOptions: { show },
	},
	{
		displayName: 'Destination',
		name: 'destination',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+15559876543',
		description: 'Recipient of the original message ("to")',
		displayOptions: { show },
	},
	{
		displayName: 'Message ID',
		name: 'message_id',
		type: 'string',
		required: true,
		default: '',
		description:
			'The carrier_msg_id in the output of the Send SMS / Send Group SMS operations (for the generic carrier, the ID the ConnecttoTeams Trigger acknowledged with). Must match a message sent from Source — the responder returns a 404 error otherwise.',
		displayOptions: { show },
	},
	{
		displayName: 'Delivery Status',
		name: 'status',
		type: 'options',
		required: true,
		default: 'MT_DELIVERED',
		// Exactly SMSR's delivery-report statuses; it rejects any other status.
		options: [
			{
				name: 'Delivered (MT_DELIVERED)',
				value: 'MT_DELIVERED',
				description: 'The carrier confirmed delivery to the handset',
			},
			{
				name: 'Rejected (MT_REJECTED)',
				value: 'MT_REJECTED',
				description: 'The carrier rejected or could not deliver the message',
			},
		],
		description: 'What happened to the message on the carrier side',
		displayOptions: { show },
	},
];

export async function execute(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const body = pruneEmpty({
		message_id: toText(this.getNodeParameter('message_id', i)).trim(),
		status: toText(this.getNodeParameter('status', i)),
		provider: PROVIDER,
		source: toText(this.getNodeParameter('source', i)).trim(),
		destination: toText(this.getNodeParameter('destination', i)).trim(),
	});

	return await smsrRequest.call(this, i, INBOUND_URL, body);
}
