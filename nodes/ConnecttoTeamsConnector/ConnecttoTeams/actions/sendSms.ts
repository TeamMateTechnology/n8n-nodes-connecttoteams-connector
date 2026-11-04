import { NodeOperationError, type IDataObject, type IExecuteFunctions, type INodeProperties } from 'n8n-workflow';

import { NUMBER_SEPARATORS, pruneEmpty, SEND_URL, smsrRequest, toList, toText, URL_SEPARATORS } from '../../shared/transport';

/**
 * Message → Send SMS: one outbound SMS/MMS to a single recipient through
 * the SMS Responder's send endpoint. The SMS Responder picks the carrier from
 * the Source DID's settings; there is no carrier payload.
 *
 * Exactly one destination: it is split the way the SMS Responder splits
 * number lists (commas, semicolons, new lines,
 * not spaces, so "(413) 414-4414" is one number) and a list is rejected;
 * several recipients are Send Group SMS's job.
 */

const SOURCE_APP = 'n8n-app';
const MSG_TYPE = 'broadcast_sms';

const show = { resource: ['message'], operation: ['send'] };

export const description: INodeProperties[] = [
	{
		displayName: 'Source (Sender DID)',
		name: 'source',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+15551230000',
		description:
			'Your ConnecttoTeams phone number to send from. Any common format works (+15551230000, 5551230000, (555) 123-0000).',
		displayOptions: { show },
	},
	{
		displayName: 'Destination',
		name: 'destination',
		type: 'string',
		required: true,
		default: '',
		placeholder: '+15559876543',
		description:
			'The one phone number to send to. For several recipients in one conversation, use the Send Group SMS operation.',
		displayOptions: { show },
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		description: 'Text body of the message',
		displayOptions: { show },
	},
	{
		displayName: 'Media URLs',
		name: 'media',
		type: 'string',
		default: '',
		description:
			'Optional publicly reachable image URLs to send as MMS, separated by commas or new lines (or an array from an expression)',
		displayOptions: { show },
	},
];

export async function execute(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const destinations = toList(this.getNodeParameter('destination', i), NUMBER_SEPARATORS);
	if (destinations.length > 1) {
		throw new NodeOperationError(
			this.getNode(),
			'Send SMS accepts exactly one destination. Use the Send Group SMS operation to message multiple recipients at once.',
			{ itemIndex: i },
		);
	}

	const body = pruneEmpty({
		source: toText(this.getNodeParameter('source', i)).trim(),
		destination: destinations[0] ?? '',
		message: toText(this.getNodeParameter('message', i)),
		source_app: SOURCE_APP,
		msg_type: MSG_TYPE,
		media: toList(this.getNodeParameter('media', i, ''), URL_SEPARATORS),
	});

	return await smsrRequest.call(this, i, SEND_URL, body);
}
