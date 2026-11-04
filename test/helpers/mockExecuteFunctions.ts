import { NodeApiError, type IExecuteFunctions, type INode, type INodeExecutionData, type JsonObject } from 'n8n-workflow';

/**
 * Minimal fake IExecuteFunctions context for testing a node's execute().
 * Only implements what the ConnecttoTeams node's execute() and its actions
 * actually call — getInputData, getNodeParameter, getCredentials,
 * continueOnFail, getNode, and helpers.httpRequest / httpRequestWithAuthentication.
 *
 * `params` and `credentials` are indexed by item — params[i] / credentials[i]
 * is what getNodeParameter(name, i) / getCredentials(type, i) returns for
 * item i, so tests can assert per-item resolution instead of just the first
 * item.
 */
export interface MockExecuteFunctionsOptions {
	items: INodeExecutionData[];
	params: Array<Record<string, unknown>>;
	credentials: Array<Record<string, unknown>>;
	httpRequest: jest.Mock;
	continueOnFail?: boolean;
}

export function createMockExecuteFunctions(
	options: MockExecuteFunctionsOptions,
): IExecuteFunctions {
	const { items, params, credentials, httpRequest, continueOnFail = false } = options;
	const node = { name: 'Test Node', type: 'test.node', typeVersion: 1 } as unknown as INode;

	const getNodeParameter = jest.fn((name: string, itemIndex: number, fallback?: unknown) => {
		const value = params[itemIndex]?.[name];
		return value !== undefined ? value : fallback;
	});

	const getCredentials = jest.fn(async (_type: string, itemIndex: number) => {
		return credentials[itemIndex];
	});

	const context = {
		getInputData: jest.fn(() => items),
		getNodeParameter,
		getCredentials,
		continueOnFail: jest.fn(() => continueOnFail),
		getNode: jest.fn(() => node),
		helpers: {
			httpRequest,
			// Mirrors n8n-core: the credential passed as credentialsDecrypted is
			// applied through the credential type's authenticate block
			// (Authorization: Bearer <accessToken>), then the request is sent.
			// A failure is rethrown wrapped in a real NodeApiError, as n8n-core
			// does, so tests see exactly what the installed n8n-workflow keeps
			// (on <= 2.33: httpCode + context.data, no cause).
			httpRequestWithAuthentication: jest.fn(
				async (
					_type: string,
					requestOptions: { headers?: Record<string, string> },
					additional?: { credentialsDecrypted?: { data?: { accessToken?: string } } },
				) => {
					try {
						return await httpRequest({
							...requestOptions,
							headers: {
								...requestOptions.headers,
								Authorization: `Bearer ${additional?.credentialsDecrypted?.data?.accessToken ?? ''}`,
							},
						});
					} catch (error) {
						throw new NodeApiError(node, error as JsonObject);
					}
				},
			),
		},
	};

	return context as unknown as IExecuteFunctions;
}
