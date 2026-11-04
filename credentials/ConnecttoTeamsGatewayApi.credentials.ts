import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Holds the auth key the ConnecttoTeams Trigger expects on every
 * incoming request. The SMS Responder's GenericCarrierDispatcher sends the
 * carrier's `api_secret` as `Authorization: Bearer <api_secret>`, so this
 * value must equal the `api_secret` configured on the generic carrier whose
 * URL points at the trigger's webhook.
 *
 * Verifying it is the trigger's job, not the responder's: the responder only
 * sends the token, and records a 401 from the trigger as a credentials
 * rejection on the failed message.
 *
 * Distinct from ConnecttoTeamsConnectorApi: that credential holds the per-DID
 * auth key the action nodes present TO the responder; this one holds the
 * secret the responder presents to n8n.
 *
 * No `test` request is defined: the secret is only ever checked by the trigger
 * itself, so there is no remote endpoint to validate it against.
 */
// eslint-disable-next-line @n8n/community-nodes/credential-test-required -- see class comment above
export class ConnecttoTeamsGatewayApi implements ICredentialType {
	name = 'connecttoTeamsGatewayApi';
	displayName = 'ConnecttoTeams Gateway API';
	documentationUrl = 'https://github.com/TeamMateTechnology/n8n-nodes-connecttoteams-connector#authentication';
	icon: Icon = 'file:../nodes/ConnecttoTeamsConnector/connecttoteams-logo.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'Auth Key',
			name: 'authKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Must match the api_secret of the generic carrier that points at this webhook. The SMS Responder sends it as "Authorization: Bearer <key>"; requests without it are rejected with 401.',
		},
	];
}
