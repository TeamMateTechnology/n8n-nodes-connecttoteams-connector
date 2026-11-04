import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Holds the SMS Responder's per-DID n8n auth token, used by all four action
 * operations of the ConnecttoTeams node (Send SMS, Send Group SMS, Relay Inbound SMS,
 * Update Delivery Status) and sent as `Authorization: Bearer <token>`
 * (verified by the SMS Responder).
 *
 * The Access Token field supports expressions. The responder looks up the
 * auth key per phone number, not per
 * enterprise, so a single workflow sending on behalf of several DIDs needs a
 * different token per item. Nodes fetch this credential with the current item
 * index (`this.getCredentials('connecttoTeamsConnectorApi', i)`) and pass the
 * resolved value to `httpRequestWithAuthentication` as `credentialsDecrypted`,
 * so `authenticate` below is applied with that item's token.
 *
 * No `test` request is defined, deliberately: both endpoints this token
 * authenticates (`/n8n-inbound`, `/n8n-send`) have real side effects (they
 * relay or send an actual message) and only return 2xx after successfully
 * doing so. A request built to short-circuit before that (e.g. an empty
 * body) hits `verify_n8n_token!` first, but then fails body validation with
 * a 400 regardless of whether the token was valid — n8n's credential test
 * would report a genuinely valid token as failed. There is no endpoint that
 * validates this token without either of those problems.
 */
// eslint-disable-next-line @n8n/community-nodes/credential-test-required -- see class comment above
export class ConnecttoTeamsConnectorApi implements ICredentialType {
	name = 'connecttoTeamsConnectorApi';
	displayName = 'ConnecttoTeams Enterprise API';
	documentationUrl = 'https://github.com/TeamMateTechnology/n8n-nodes-connecttoteams-connector#authentication';
	icon: Icon = 'file:../nodes/ConnecttoTeamsConnector/connecttoteams-logo.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'The token the SMS Responder issued for this phone number (DID). Supports expressions, so a single workflow can send on behalf of multiple DIDs, each with its own token.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken.trim()}}',
			},
		},
	};
}
