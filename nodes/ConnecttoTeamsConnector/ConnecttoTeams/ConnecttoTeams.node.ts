import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

import { CREDENTIAL_TYPE, describeFailure } from '../shared/transport';
import * as relayInboundSms from './actions/relayInboundSms';
import * as sendGroupSms from './actions/sendGroupSms';
import * as sendSms from './actions/sendSms';
import * as updateDeliveryStatus from './actions/updateDeliveryStatus';

/**
 * ConnecttoTeams — the single action node. Each Resource → Operation pair is
 * one action, which is what makes n8n's node panel show "ConnecttoTeams" as an
 * app with a list of actions (and the ConnecttoTeams Trigger alongside them).
 *
 * Every action talks to the SMS Responder with the item's ConnecttoTeams
 * Enterprise API credential (see shared/transport.ts). The actions live in
 * ./actions, one file per operation: its fields and its request body.
 */

type Action = (this: IExecuteFunctions, itemIndex: number) => Promise<IDataObject>;

const ACTIONS: Record<string, Action> = {
	'message:send': sendSms.execute,
	'message:sendGroup': sendGroupSms.execute,
	'message:relayInbound': relayInboundSms.execute,
	'deliveryStatus:update': updateDeliveryStatus.execute,
};

export class ConnecttoTeams implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ConnecttoTeams',
		// Type-ID: changing it breaks every saved workflow that uses this node.
		name: 'connecttoTeams',
		// Single icon for both themes — see connecttoteams-logo.svg's own comment.
		icon: 'file:../connecttoteams-logo.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send and relay SMS through ConnecttoTeams, and report carrier delivery status',
		defaults: {
			name: 'ConnecttoTeams',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: CREDENTIAL_TYPE,
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Delivery Status', value: 'deliveryStatus' },
					{ name: 'Message', value: 'message' },
				],
				default: 'message',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'Relay Inbound SMS',
						value: 'relayInbound',
						description: 'Deliver an SMS/MMS a customer sent to one of your numbers into the matching Teams conversation',
						action: 'Relay an inbound SMS',
					},
					{
						name: 'Send Group SMS',
						value: 'sendGroup',
						description: 'Send one group text from one of your numbers to several recipients',
						action: 'Send a group SMS',
					},
					{
						name: 'Send SMS',
						value: 'send',
						description: 'Send a text or picture message from one of your numbers to one recipient',
						action: 'Send an SMS',
					},
				],
				default: 'send',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['deliveryStatus'] } },
				options: [
					{
						name: 'Update',
						value: 'update',
						description: 'Report whether the carrier delivered or rejected a message you sent',
						action: 'Update a delivery status',
					},
				],
				default: 'update',
			},
			...sendSms.description,
			...sendGroupSms.description,
			...relayInboundSms.description,
			...updateDeliveryStatus.description,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const action = ACTIONS[`${resource}:${operation}`];
				if (!action) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}"`,
						{ itemIndex: i },
					);
				}

				const response = await action.call(this, i);
				returnData.push({ json: response, pairedItem: { item: i } });
			} catch (error) {
				const failure = describeFailure.call(this, error, i);
				if (this.continueOnFail()) {
					returnData.push({ json: failure.item, pairedItem: { item: i } });
					continue;
				}
				throw failure.error;
			}
		}

		return [returnData];
	}
}
