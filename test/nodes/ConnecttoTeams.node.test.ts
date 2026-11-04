import type { INodePropertyOptions } from 'n8n-workflow';

import { ConnecttoTeams } from '../../nodes/ConnecttoTeamsConnector/ConnecttoTeams/ConnecttoTeams.node';
import { ConnecttoTeamsTrigger } from '../../nodes/ConnecttoTeamsConnector/ConnecttoTeamsTrigger/ConnecttoTeamsTrigger.node';
import { createMockExecuteFunctions } from '../helpers/mockExecuteFunctions';

// The node panel shows "ConnecttoTeams" as one app whose actions are the
// operations' `action` labels, with the trigger listed alongside because its
// type-ID is the action node's plus "Trigger".

const node = new ConnecttoTeams();

function actionsFor(resource: string): string[] {
	const operation = node.description.properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
	);
	return ((operation?.options ?? []) as INodePropertyOptions[]).map((o) => String(o.action));
}

describe('ConnecttoTeams node', () => {
	it('is one node with the four actions grouped by resource', () => {
		expect(node.description.name).toBe('connecttoTeams');
		expect(actionsFor('message')).toEqual(['Relay an inbound SMS', 'Send a group SMS', 'Send an SMS']);
		expect(actionsFor('deliveryStatus')).toEqual(['Update a delivery status']);
	});

	it('shows each field only for its own operation', () => {
		const fields = node.description.properties.filter((p) => !['resource', 'operation'].includes(p.name));
		for (const field of fields) {
			expect(field.displayOptions?.show?.resource).toHaveLength(1);
			expect(field.displayOptions?.show?.operation).toHaveLength(1);
		}
	});

	it('names the trigger so n8n lists it in the same app panel', () => {
		// n8n pairs an app with its trigger by type-ID (`x` / `xTrigger`), not by display name.
		const trigger = new ConnecttoTeamsTrigger();
		expect(trigger.description.name).toBe(`${node.description.name}Trigger`);
		expect(trigger.description.displayName).toBe(`${node.description.displayName} Trigger`);
	});

	it('labels the trigger\'s one event for the node panel', () => {
		const event = new ConnecttoTeamsTrigger().description.properties.find((p) => p.name === 'event');
		expect(event?.type).toBe('options');
		expect(event?.default).toBe('outboundSms');
		expect((event?.options as INodePropertyOptions[]).map((o) => o.action)).toEqual([
			'On outbound SMS from ConnecttoTeams',
		]);
	});

	it('rejects an unknown operation as a configuration error, without sending', async () => {
		const httpRequest = jest.fn();
		const context = createMockExecuteFunctions({
			items: [{ json: {} }],
			params: [{ resource: 'message', operation: 'nope' }],
			credentials: [{ accessToken: 't' }],
			httpRequest,
		});

		await expect(node.execute.call(context)).rejects.toThrow(/"nope" is not supported for resource "message"/);
		expect(httpRequest).not.toHaveBeenCalled();
	});
});
