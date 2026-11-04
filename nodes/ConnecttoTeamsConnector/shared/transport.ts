import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type JsonObject,
} from 'n8n-workflow';

/**
 * Shared request and value helpers for the four SMS Responder (SMSR) action
 * nodes. Each node resolves its credential per item, so one workflow can act
 * for several DIDs, each with its own token.
 */

export const CREDENTIAL_TYPE = 'connecttoTeamsConnectorApi';

/**
 * SMS Responder host: production. Fixed, not exposed in the UI.
 */
export const SMSR_BASE_URL = 'https://smsbot.connecttoteams.com';
/** Send endpoint (Send SMS, Send Group SMS). */
export const SEND_URL = `${SMSR_BASE_URL}/n8n-send`;
/** Inbound endpoint (Relay Inbound SMS, Update Delivery Status). */
export const INBOUND_URL = `${SMSR_BASE_URL}/n8n-inbound`;

/**
 * POSTs `body` to an SMSR endpoint, authenticated with the item's
 * "ConnecttoTeams Enterprise API" credential.
 *
 * The credential is resolved with the item index (so an expression in the
 * Access Token can differ per item) and handed to httpRequestWithAuthentication
 * as `credentialsDecrypted`, which n8n then authenticates with the credential's
 * own `authenticate` block (Authorization: Bearer <token>).
 */
export async function smsrRequest(
	this: IExecuteFunctions,
	itemIndex: number,
	url: string,
	body: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials<{ accessToken?: unknown }>(CREDENTIAL_TYPE, itemIndex);
	const accessToken = toText(credentials?.accessToken).trim();
	if (!accessToken) {
		throw new NodeOperationError(
			this.getNode(),
			'The ConnecttoTeams Enterprise API credential has no Access Token for this item.',
			{
				itemIndex,
				description:
					'Set the Access Token on the credential. If it is an expression, check that it resolves to a value for this item.',
			},
		);
	}

	const response: unknown = await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIAL_TYPE,
		{ method: 'POST', url, body, json: true, headers: { 'Content-Type': 'application/json' } },
		{
			credentialsDecrypted: {
				id: '',
				name: CREDENTIAL_TYPE,
				type: CREDENTIAL_TYPE,
				data: { accessToken },
			},
		},
	);

	// SMSR answers JSON objects; anything else (an empty body, a bare string)
	// is wrapped so the output item is always an object.
	if (response !== null && typeof response === 'object' && !Array.isArray(response)) {
		return response as IDataObject;
	}
	return { response: response === undefined ? null : (response as IDataObject[keyof IDataObject]) };
}

interface ResponseLike {
	status?: number;
	data?: unknown;
}

interface ErrorLike {
	response?: ResponseLike;
	cause?: { response?: ResponseLike };
	httpCode?: unknown;
	context?: { data?: unknown };
}

/**
 * The HTTP response behind an error. httpRequestWithAuthentication throws a
 * NodeApiError wrapping the AxiosError, and what survives depends on the n8n
 * version: newer releases keep the AxiosError as `cause`, but n8n-workflow
 * <= 2.33 drops `cause` and keeps only `httpCode` plus the JSON body in
 * `context.data`. Read the raw/cause response first, then fall back to those.
 */
function responseOf(error: unknown): ResponseLike | undefined {
	const candidate = error as ErrorLike | null;
	const direct = candidate?.response ?? candidate?.cause?.response;
	if (direct) return direct;

	// httpCode can also hold a non-HTTP code (e.g. "ENOTFOUND") for network errors.
	const code = typeof candidate?.httpCode === 'string' ? candidate.httpCode : String(candidate?.httpCode ?? '');
	const status = /^\d{3}$/.test(code) ? Number(code) : undefined;
	const data = candidate?.context?.data;
	if (status === undefined && data === undefined) return undefined;
	return { status, data };
}

/**
 * SMSR's own error text from a failed request. SMSR answers `{ errors: "..." }`
 * (validation, 404s, failed sends) or `{ message: "..." }` (401); n8n's default
 * NodeApiError only reads `message`, so `errors` would otherwise be lost.
 */
function smsrErrorText(data: unknown): string | undefined {
	if (typeof data === 'string') return data.trim() || undefined;
	if (data === null || typeof data !== 'object') return undefined;
	const body = data as { errors?: unknown; message?: unknown; error?: unknown };
	for (const value of [body.errors, body.message, body.error]) {
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (Array.isArray(value) && value.length) return value.map(String).join('; ');
	}
	return undefined;
}

/**
 * Turns a caught error into what the node surfaces: a NodeApiError that leads
 * with SMSR's message, plus the fields for a Continue On Fail item.
 * NodeOperationErrors (the node's own validation) pass through unchanged.
 */
export function describeFailure(
	this: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): { error: NodeApiError | NodeOperationError; item: IDataObject } {
	if (error instanceof NodeOperationError) {
		return { error, item: { error: error.message } };
	}

	const response = responseOf(error);
	const httpCode = response?.status;
	const text = smsrErrorText(response?.data);

	if (text !== undefined || httpCode !== undefined) {
		const message = text ?? `The SMS Responder answered HTTP ${httpCode}`;
		const description = httpCode !== undefined ? `HTTP ${httpCode} from the SMS Responder` : undefined;
		const apiError = new NodeApiError(
			this.getNode(),
			{ message, ...(httpCode !== undefined ? { httpCode: String(httpCode) } : {}) } as JsonObject,
			{
				message,
				description,
				httpCode: httpCode !== undefined ? String(httpCode) : undefined,
				itemIndex,
			},
		);
		const item: IDataObject = { error: message };
		if (httpCode !== undefined) item.http_code = httpCode;
		if (response?.data !== undefined) item.response = response.data as IDataObject;
		return { error: apiError, item };
	}

	// No HTTP response at all (DNS, timeout, connection refused): keep n8n's own message.
	const apiError = new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
	return { error: apiError, item: { error: apiError.message } };
}

/** Coerces an expression result to text: numbers become strings, anything else non-string becomes ''. */
export function toText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'bigint') return String(value);
	return '';
}

/**
 * Splits a list field into trimmed, non-empty strings. Accepts a delimited
 * string, a number, or an array (e.g. mapped straight from a previous node's
 * output), so an expression never crashes the node on `.split`.
 */
export function toList(value: unknown, separator: RegExp): string[] {
	const entries: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
	return entries
		.flatMap((entry) => (Array.isArray(entry) ? (entry as unknown[]) : [entry]))
		.flatMap((entry) => toText(entry).split(separator))
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

/** Phone-number separators, matching how the SMS Responder splits number lists (not spaces). */
export const NUMBER_SEPARATORS = /[,;\r\n]+/;
/** URL list separators: commas or newlines (URLs may contain semicolons). */
export const URL_SEPARATORS = /[,\r\n]+/;

/** Pulls the trimmed, non-empty `value` entries out of a fixedCollection; array values are flattened. */
export function collectValues(collection: IDataObject | undefined, key: string, separator: RegExp): string[] {
	const entries = (collection?.[key] as Array<{ value?: unknown }> | undefined) ?? [];
	return toList(
		entries.map((entry) => entry?.value),
		separator,
	);
}

/** Drops empty strings, null/undefined, and empty arrays from a request body. */
export function pruneEmpty(input: IDataObject): IDataObject {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => {
			if (value === '' || value === null || value === undefined) return false;
			if (Array.isArray(value) && value.length === 0) return false;
			return true;
		}),
	);
}
