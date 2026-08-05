import type {
  AuthResponse,
  AccountResponse,
  AccountBalanceResponse,
  AccountTransactionResponse,
  AccountDocumentsResponse,
} from './types';
import { InvestecApiError } from './errors';

/** Refresh tokens this many seconds before actual expiry. */
const TOKEN_EXPIRY_SKEW_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 30_000;

const createEndpoint = (host: string, path: string) =>
  new URL(path, host).toString();

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
  private token: string | undefined;
  private expiresIn: Date = new Date(0);
  private refreshPromise: Promise<string> | null = null;

  /**
   * Create a new InvestecMauApi instance.
   * @param clientId OAuth client ID
   * @param clientSecret OAuth client secret
   * @param apiKey API key from Investec
   * @param host Optional API host (defaults to Investec production)
   */
  constructor(
    clientId: string,
    clientSecret: string,
    apiKey: string,
    host: string = 'https://openapi.investec.com',
  ) {
    this.host = host;
    this.apiKey = apiKey;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
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
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(this.clientId + ':' + this.clientSecret).toString(
            'base64',
          ),
        'x-api-key': this.apiKey,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw await this.toApiError(response, endpoint);
    }

    const result = (await response.json()) as AuthResponse;
    this.token = result.access_token;
    this.expiresIn = new Date(
      Date.now() +
        Math.max(result.expires_in - TOKEN_EXPIRY_SKEW_SECONDS, 0) * 1000,
    );
    return result;
  }

  /**
   * Retrieve all accounts for the authenticated user.
   * @returns AccountResponse
   */
  async getAccounts(): Promise<AccountResponse> {
    const endpoint = createEndpoint(this.host, `/mu/pb/v1/accounts`);
    return this.fetchGet<AccountResponse>(endpoint);
  }

  /**
   * Get the balance for a specific account.
   * @param accountId The account ID
   * @returns AccountBalanceResponse
   * @throws Error if accountId is missing or API call fails
   */
  async getAccountBalances(
    accountId: number | string,
  ): Promise<AccountBalanceResponse> {
    if (accountId === '' || accountId === null || accountId === undefined) {
      throw new Error('Missing required parameters');
    }
    const endpoint = createEndpoint(
      this.host,
      `/mu/pb/v1/accounts/${encodeURIComponent(String(accountId))}/balance`,
    );
    return this.fetchGet<AccountBalanceResponse>(endpoint);
  }

  /**
   * Get transactions for a specific account within a date range.
   * @param accountId The account ID
   * @param fromDate Start date (YYYY-MM-DD)
   * @param toDate End date (YYYY-MM-DD)
   * @returns AccountTransactionResponse
   * @throws Error if required parameters are missing or API call fails
   */
  async getAccountTransactions(
    accountId: number | string,
    fromDate: string,
    toDate: string,
  ): Promise<AccountTransactionResponse> {
    if (
      accountId === '' ||
      accountId === null ||
      accountId === undefined ||
      !fromDate ||
      !toDate
    ) {
      throw new Error('Missing required parameters');
    }
    const params = new URLSearchParams({ fromDate, toDate });
    const endpoint = createEndpoint(
      this.host,
      `/mu/pb/v1/accounts/${encodeURIComponent(
        String(accountId),
      )}/transactions?${params.toString()}`,
    );
    return this.fetchGet<AccountTransactionResponse>(endpoint);
  }

  /**
   * List available documents (e.g. bank statements) for an account within a date range.
   * @param accountId The account ID
   * @param fromDate Start date (YYYY-MM-DD)
   * @param toDate End date (YYYY-MM-DD)
   * @returns AccountDocumentsResponse
   * @throws Error if required parameters are missing or API call fails
   */
  async getAccountDocuments(
    accountId: number | string,
    fromDate: string,
    toDate: string,
  ): Promise<AccountDocumentsResponse> {
    if (
      accountId === '' ||
      accountId === null ||
      accountId === undefined ||
      !fromDate ||
      !toDate
    ) {
      throw new Error('Missing required parameters');
    }
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
   * @throws Error if required parameters are missing or API call fails
   */
  async downloadAccountStatement(
    accountId: number | string,
    date: string,
  ): Promise<ArrayBuffer> {
    if (
      accountId === '' ||
      accountId === null ||
      accountId === undefined ||
      !date
    ) {
      throw new Error('Missing required parameters');
    }
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

  private async authorizedRequest<T>(
    endpoint: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await this.sendAuthorized(endpoint, init);
    if (response.status === 401) {
      this.invalidateToken();
      const retry = await this.sendAuthorized(endpoint, init);
      if (!retry.ok) {
        throw await this.toApiError(retry, endpoint);
      }
      return (await retry.json()) as T;
    }
    if (!response.ok) {
      throw await this.toApiError(response, endpoint);
    }
    return (await response.json()) as T;
  }

  private async fetchBinary(endpoint: string): Promise<ArrayBuffer> {
    const init: RequestInit = {
      method: 'GET',
      headers: { Accept: 'application/pdf' },
    };
    const response = await this.sendAuthorized(endpoint, init);
    if (response.status === 401) {
      this.invalidateToken();
      const retry = await this.sendAuthorized(endpoint, init);
      if (!retry.ok) {
        throw await this.toApiError(retry, endpoint);
      }
      return retry.arrayBuffer();
    }
    if (!response.ok) {
      throw await this.toApiError(response, endpoint);
    }
    return response.arrayBuffer();
  }

  private async sendAuthorized(
    endpoint: string,
    init: RequestInit,
  ): Promise<Response> {
    const token = await this.getToken();
    return fetch(endpoint, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
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
