import { InvestecApiError, InvestecValidationError } from './errors';
import type {
  Account,
  AccountBalance,
  AccountBalanceResponse,
  AccountDocumentsResponse,
  AccountResponse,
  AccountTransaction,
  AccountTransactionResponse,
  ApiLinks,
  ApiMeta,
  AuthResponse,
} from './types';

/** Refresh tokens this many seconds before actual expiry. */
const TOKEN_EXPIRY_SKEW_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HOST = 'https://openapi.investec.com';
const DEFAULT_RETRY_DELAY_MS = 500;
/** Upper bound for any single retry wait, including a server's Retry-After. */
const MAX_RETRY_DELAY_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Joins the host and an absolute API path, keeping any path prefix on the
 * host (e.g. a reverse proxy at https://proxy.example/investec).
 */
const createEndpoint = (host: string, path: string) =>
  new URL(`${host.replace(/\/+$/, '')}${path}`).toString();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Throws InvestecValidationError naming the first empty argument. */
function requireParams(params: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      throw new InvestecValidationError(name);
    }
  }
}

/**
 * Options for `new InvestecMauApi({...})`.
 */
export interface InvestecMauApiOptions {
  clientId: string;
  clientSecret: string;
  apiKey: string;
  /** API host. Defaults to Investec production, https://openapi.investec.com. */
  host?: string;
  /**
   * fetch implementation to use, e.g. for proxies, logging or tests.
   * Defaults to the global fetch at call time.
   */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /**
   * How many times to retry a request that fails with 429, 500, 502, 503 or
   * 504, or with a network error or timeout. The token request is never
   * retried. Defaults to 0 (no retries).
   */
  retries?: number;
  /**
   * Base delay before the first retry, doubled on each further attempt.
   * A 429's Retry-After header is used instead when present. Defaults to 500.
   */
  retryDelayMs?: number;
}

/** Raw wire shape from Mauritius accounts endpoints (extra nesting under data.accounts). */
interface WireEnvelope<T> {
  data?: {
    accounts?: T;
  };
  links?: ApiLinks;
  meta?: ApiMeta;
}

function normalizeAccountsResponse(
  raw: WireEnvelope<{ accounts?: Account[] }> | undefined,
): AccountResponse {
  return {
    data: {
      accounts: raw?.data?.accounts?.accounts ?? [],
    },
    ...(raw?.links ? { links: raw.links } : {}),
    ...(raw?.meta ? { meta: raw.meta } : {}),
  };
}

function normalizeBalanceResponse(
  raw: WireEnvelope<{ balance?: AccountBalance }> | undefined,
): AccountBalanceResponse {
  const balance = raw?.data?.accounts?.balance;
  if (!balance) {
    throw new Error('Unexpected balance response shape');
  }
  return {
    data: balance,
    ...(raw?.links ? { links: raw.links } : {}),
    ...(raw?.meta ? { meta: raw.meta } : {}),
  };
}

function normalizeTransactionsResponse(
  raw: WireEnvelope<{ transactions?: AccountTransaction[] }> | undefined,
): AccountTransactionResponse {
  return {
    data: {
      transactions: raw?.data?.accounts?.transactions ?? [],
    },
    ...(raw?.links ? { links: raw.links } : {}),
    ...(raw?.meta ? { meta: raw.meta } : {}),
  };
}
/**
 * Main API client for Investec Mauritius Open Banking API.
 * Handles authentication and provides methods for account, transaction, and document operations.
 *
 * @example
 * const api = new InvestecMauApi(clientId, clientSecret, apiKey);
 * const accounts = await api.getAccounts();
 */
export class InvestecMauApi {
  private readonly host: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private token: string | undefined;
  private expiresIn: Date = new Date(0);
  private refreshPromise: Promise<string> | null = null;

  /**
   * Create a new InvestecMauApi instance.
   *
   * @example
   * new InvestecMauApi({ clientId, clientSecret, apiKey, retries: 2 });
   * new InvestecMauApi(clientId, clientSecret, apiKey, host); // positional form
   */
  constructor(options: InvestecMauApiOptions);
  /**
   * @param clientId OAuth client ID
   * @param clientSecret OAuth client secret
   * @param apiKey API key from Investec
   * @param host Optional API host (defaults to Investec production)
   */
  constructor(
    clientId: string,
    clientSecret: string,
    apiKey: string,
    host?: string,
  );
  constructor(
    optionsOrClientId: InvestecMauApiOptions | string,
    clientSecret?: string,
    apiKey?: string,
    host?: string,
  ) {
    const options: InvestecMauApiOptions =
      typeof optionsOrClientId === 'string'
        ? {
            clientId: optionsOrClientId,
            clientSecret: clientSecret as string,
            apiKey: apiKey as string,
            host,
          }
        : optionsOrClientId;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.apiKey = options.apiKey;
    this.host = options.host ?? DEFAULT_HOST;
    this.fetchImpl = options.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = Math.max(0, Math.floor(options.retries ?? 0));
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /**
   * Get a valid OAuth token, refreshing if necessary.
   * Concurrent callers share a single in-flight refresh.
   * @returns Access token string
   */
  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.expiresIn.getTime()) {
      return this.token;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async refreshAccessToken(): Promise<string> {
    const result = await this.getAccessToken();
    return result.access_token;
  }

  /**
   * Request a new OAuth access token from Investec.
   * @returns AuthResponse object
   * @throws InvestecApiError if authentication fails
   */
  async getAccessToken(): Promise<AuthResponse> {
    const endpoint = createEndpoint(this.host, `/identity/v2/oauth2/token`);
    const response = await this.send(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
        'x-api-key': this.apiKey,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw await this.toApiError(response, endpoint);
    }

    const raw = (await response.json()) as AuthResponse;
    // Some servers send expires_in as a string; normalise it.
    const result: AuthResponse = { ...raw, expires_in: Number(raw.expires_in) };
    this.token = result.access_token;
    this.expiresIn = new Date(
      Date.now() +
        Math.max((result.expires_in || 0) - TOKEN_EXPIRY_SKEW_SECONDS, 0) *
          1000,
    );
    return result;
  }

  /**
   * Retrieve all accounts for the authenticated user.
   * Flattens the API's nested `data.accounts.accounts` into `data.accounts`.
   * @returns AccountResponse
   */
  async getAccounts(): Promise<AccountResponse> {
    const endpoint = createEndpoint(this.host, `/mu/pb/v1/accounts`);
    const raw =
      await this.fetchGet<WireEnvelope<{ accounts?: Account[] }>>(endpoint);
    return normalizeAccountsResponse(raw);
  }

  /**
   * Get the balance for a specific account.
   * Flattens the API's nested `data.accounts.balance` into `data`.
   * @param accountId The account ID
   * @returns AccountBalanceResponse
   * @throws InvestecValidationError if accountId is missing
   * @throws InvestecApiError if the API call fails
   */
  async getAccountBalances(
    accountId: number | string,
  ): Promise<AccountBalanceResponse> {
    requireParams({ accountId });
    const endpoint = createEndpoint(
      this.host,
      `/mu/pb/v1/accounts/${encodeURIComponent(String(accountId))}/balance`,
    );
    const raw =
      await this.fetchGet<WireEnvelope<{ balance?: AccountBalance }>>(endpoint);
    return normalizeBalanceResponse(raw);
  }

  /**
   * Get transactions for a specific account within a date range.
   * Flattens the API's nested `data.accounts.transactions` into `data.transactions`.
   * @param accountId The account ID
   * @param fromDate Start date (YYYY-MM-DD)
   * @param toDate End date (YYYY-MM-DD)
   * @returns AccountTransactionResponse
   * @throws InvestecValidationError if a parameter is missing
   * @throws InvestecApiError if the API call fails
   */
  async getAccountTransactions(
    accountId: number | string,
    fromDate: string,
    toDate: string,
  ): Promise<AccountTransactionResponse> {
    requireParams({ accountId, fromDate, toDate });
    const params = new URLSearchParams({ fromDate, toDate });
    const endpoint = createEndpoint(
      this.host,
      `/mu/pb/v1/accounts/${encodeURIComponent(
        String(accountId),
      )}/transactions?${params.toString()}`,
    );
    const raw =
      await this.fetchGet<
        WireEnvelope<{ transactions?: AccountTransaction[] }>
      >(endpoint);
    return normalizeTransactionsResponse(raw);
  }

  /**
   * List available documents (e.g. bank statements) for an account within a date range.
   * @param accountId The account ID
   * @param fromDate Start date (YYYY-MM-DD)
   * @param toDate End date (YYYY-MM-DD)
   * @returns AccountDocumentsResponse
   * @throws InvestecValidationError if a parameter is missing
   * @throws InvestecApiError if the API call fails
   */
  async getAccountDocuments(
    accountId: number | string,
    fromDate: string,
    toDate: string,
  ): Promise<AccountDocumentsResponse> {
    requireParams({ accountId, fromDate, toDate });
    const params = new URLSearchParams({ fromDate, toDate });
    const endpoint = createEndpoint(
      this.host,
      `/mu/pb/v1/accounts/${encodeURIComponent(
        String(accountId),
      )}/documents?${params.toString()}`,
    );
    return this.fetchGet<AccountDocumentsResponse>(endpoint);
  }

  /**
   * Download a statement PDF for a specific document date.
   * @param accountId The account ID
   * @param date Document date (YYYY-MM-DD)
   * @returns PDF contents as an ArrayBuffer
   * @throws InvestecValidationError if a parameter is missing
   * @throws InvestecApiError if the API call fails
   */
  async downloadAccountStatement(
    accountId: number | string,
    date: string,
  ): Promise<ArrayBuffer> {
    requireParams({ accountId, date });
    const endpoint = createEndpoint(
      this.host,
      `/mu/pb/v1/accounts/${encodeURIComponent(
        String(accountId),
      )}/document/statement/${encodeURIComponent(date)}`,
    );
    return this.fetchBinary(endpoint);
  }

  private async fetchGet<T>(endpoint: string): Promise<T> {
    return this.authorizedRequest<T>(endpoint, { method: 'GET' });
  }

  /**
   * Sends an authorized request and parses the JSON body. An empty body
   * (e.g. 204 No Content) resolves to undefined.
   */
  private async authorizedRequest<T>(
    endpoint: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await this.authorizedFetch(endpoint, init);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async fetchBinary(endpoint: string): Promise<ArrayBuffer> {
    const response = await this.authorizedFetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/pdf' },
    });
    return response.arrayBuffer();
  }

  /**
   * Sends an authorized request, refreshing the token and retrying once on
   * 401, and retrying GETs on transient failures when `retries` is set.
   * Throws InvestecApiError on any other non-2xx response.
   */
  private async authorizedFetch(
    endpoint: string,
    init: RequestInit,
  ): Promise<Response> {
    const canRetry = init.method === 'GET';
    for (let attempt = 0; ; attempt++) {
      const retriesLeft = canRetry && attempt < this.retries;
      let response: Response;
      try {
        response = await this.sendAuthorized(endpoint, init);
        if (response.status === 401) {
          this.invalidateToken();
          response = await this.sendAuthorized(endpoint, init);
        }
      } catch (error) {
        if (!retriesLeft || error instanceof InvestecApiError) throw error;
        await sleep(this.retryDelay(attempt));
        continue;
      }
      if (response.ok) return response;
      if (retriesLeft && RETRYABLE_STATUSES.has(response.status)) {
        await response.body?.cancel().catch(() => {});
        await sleep(this.retryDelay(attempt, response));
        continue;
      }
      throw await this.toApiError(response, endpoint);
    }
  }

  /** Exponential backoff, or the server's Retry-After (seconds) on a 429. */
  private retryDelay(attempt: number, response?: Response): number {
    const retryAfter = Number(response?.headers.get('retry-after'));
    const delay =
      response?.status === 429 && retryAfter > 0
        ? retryAfter * 1000
        : this.retryDelayMs * 2 ** attempt;
    return Math.min(delay, MAX_RETRY_DELAY_MS);
  }

  private async sendAuthorized(
    endpoint: string,
    init: RequestInit,
  ): Promise<Response> {
    const token = await this.getToken();
    return this.send(endpoint, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
  }

  /** fetch with the configured implementation and per-request timeout. */
  private send(endpoint: string, init: RequestInit): Promise<Response> {
    const doFetch = this.fetchImpl ?? globalThis.fetch;
    return doFetch(endpoint, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private invalidateToken(): void {
    this.token = undefined;
    this.expiresIn = new Date(0);
  }

  private async toApiError(
    response: Response,
    endpoint: string,
  ): Promise<InvestecApiError> {
    let body: string | undefined;
    try {
      body = await response.text();
    } catch {
      body = undefined;
    }
    return new InvestecApiError(
      response.status,
      endpoint,
      response.statusText,
      body,
    );
  }
}
