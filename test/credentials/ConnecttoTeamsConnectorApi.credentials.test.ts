import { ConnecttoTeamsConnectorApi } from '../../credentials/ConnecttoTeamsConnectorApi.credentials';

describe('ConnecttoTeamsConnectorApi credential', () => {
	it('has the expected type name (used by node "credentials" declarations and demo workflows)', () => {
		const credential = new ConnecttoTeamsConnectorApi();
		expect(credential.name).toBe('connecttoTeamsConnectorApi');
	});

	it('exposes a single password-masked Access Token field', () => {
		const credential = new ConnecttoTeamsConnectorApi();
		expect(credential.properties).toHaveLength(1);

		const [accessToken] = credential.properties;
		expect(accessToken.name).toBe('accessToken');
		expect(accessToken.type).toBe('string');
		expect(accessToken.typeOptions).toEqual(expect.objectContaining({ password: true }));
		expect(accessToken.required).toBe(true);
	});

	it('authenticates requests with a Bearer header built from the (trimmed) Access Token', () => {
		const credential = new ConnecttoTeamsConnectorApi();
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: { headers: { Authorization: '=Bearer {{$credentials.accessToken.trim()}}' } },
		});
	});
});
