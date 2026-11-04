import { ConnecttoTeamsGatewayApi } from '../../credentials/ConnecttoTeamsGatewayApi.credentials';

describe('ConnecttoTeamsGatewayApi credential', () => {
	it('has the expected type name (used by the trigger\'s "credentials" declaration)', () => {
		const credential = new ConnecttoTeamsGatewayApi();
		expect(credential.name).toBe('connecttoTeamsGatewayApi');
	});

	it('exposes a single required, password-masked Auth Key field', () => {
		const credential = new ConnecttoTeamsGatewayApi();
		expect(credential.properties).toHaveLength(1);

		const [authKey] = credential.properties;
		expect(authKey.name).toBe('authKey');
		expect(authKey.type).toBe('string');
		expect(authKey.required).toBe(true);
		expect(authKey.typeOptions).toEqual(expect.objectContaining({ password: true }));
	});
});
