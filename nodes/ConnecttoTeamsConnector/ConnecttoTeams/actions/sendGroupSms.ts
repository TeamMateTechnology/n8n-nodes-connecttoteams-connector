import { NodeOperationError, type IDataObject, type IExecuteFunctions, type INodeProperties } from 'n8n-workflow';

import {
	collectValues,
	NUMBER_SEPARATORS,
	pruneEmpty,
	SEND_URL,
	smsrRequest,
	toList,
	toText,
	URL_SEPARATORS,
} from '../../shared/transport';

/**
 * Message → Send Group SMS: one group text through
 * the SMS Responder's send endpoint, distinguished from Send SMS purely by
 * `msg_type: group_text` (broadcast_sms with several destinations would fan
 * out as separate 1:1 messages instead of one group conversation).
 *
 * No `group_recipients` key: on the group_text branch SMSR falls back to the
 * parsed `destination` array, adds the source number to the group, and derives
 * the per-message destination itself.
 */

const SOURCE_APP = 'n8n-app';
const MSG_TYPE = 'group_text';

const show = { resource: ['message'], operation: ['sendGroup'] };

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
		displayName: 'Recipients',
		name: 'recipients',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		// For a fixedCollection, n8n uses the placeholder as the add-row button's label.
		placeholder: 'Add Recipient',
		default: {},
		required: true,
		description:
			'Phone numbers in this group text. The source number is added to the group automatically, so list only the other participants. A row may also hold several numbers separated by commas, semicolons or new lines, or an array from an expression.',
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
		displayName: 'Group Name',
		name: 'group_name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Site crew',
		description:
			'Name of the group conversation in Teams. Every send sets it, replacing a different stored name, so later incoming group texts keep this name.',
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
	const destination = collectValues(
		this.getNodeParameter('recipients', i, {}) as IDataObject,
		'recipients',
		NUMBER_SEPARATORS,
	);
	if (destination.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Send Group SMS requires at least one destination phone number.', {
			itemIndex: i,
		});
	}

	// SMSR stores whatever group_name a send carries; a send without one blanks
	// the group's stored name, and the next incoming group text then renames the
	// Teams chat to a generated "GroupText_…" (SD-1275). So a name is required.
	const groupName = toText(this.getNodeParameter('group_name', i, '')).trim();
	if (!groupName) {
		throw new NodeOperationError(this.getNode(), 'Send Group SMS requires a Group Name.', {
			itemIndex: i,
			description: 'Set Group Name to the name of the group conversation. If it is an expression, check that it resolves to a value for this item.',
		});
	}

	const body = pruneEmpty({
		source: toText(this.getNodeParameter('source', i)).trim(),
		destination,
		group_name: groupName,
		message: toText(this.getNodeParameter('message', i)),
		source_app: SOURCE_APP,
		msg_type: MSG_TYPE,
		media: toList(this.getNodeParameter('media', i, ''), URL_SEPARATORS),
	});

	return await smsrRequest.call(this, i, SEND_URL, body);
}
