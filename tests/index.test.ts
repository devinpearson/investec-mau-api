import { afterEach, describe, expect, test, vi } from 'vitest';
import { InvestecApiError, InvestecMauApi } from '../src/index';

const HOST = 'https://openapi.investec.com';
const SANDBOX = 'https://openapisandbox.investec.com';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(body: string, status: number, statusText = 'Error') {
  return new Response(body, {
    status,
    statusText,
    headers: { 'content-type': 'text/plain' },
  });
}

function binaryResponse(body: ArrayBuffer, status = 200): Response {
  return new Response(body, {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/pdf' },
  });
}

function authResponse(expiresIn = 3600, accessToken = 'test-token') {
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: 'accounts',
  };
}

function setupFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('InvestecApiError', () => {
  test('prefers trimmed body in message', () => {
    const error = new InvestecApiError(
      500,
      'https://example/x',
      'Internal Server Error',
      '  boom  ',
    );
    expect(error.name).toBe('InvestecApiError');
    expect(error.message).toBe('Investec API request failed (500): boom');
    expect(error.status).toBe(500);
    expect(error.endpoint).toBe('https://example/x');
    expect(error.body).toBe('  boom  ');
  });

  test('falls back to statusText when body is empty', () => {
    const error = new InvestecApiError(
      403,
      'https://example/x',
      'Forbidden',
      '',
    );
    expect(error.message).toBe('Investec API request failed (403): Forbidden');
  });

  test('omits detail when body and statusText are empty', () => {
    const error = new InvestecApiError(418, 'https://example/x', '');
    expect(error.message).toBe('Investec API request failed (418)');
    expect(error.body).toBeUndefined();
  });
});

describe('InvestecMauApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('defaults to production host', async () => {
    const fetchMock = setupFetch(jsonResponse(authResponse()));
    const mau = new InvestecMauApi('id', 'secret', 'key');
    await mau.getAccessToken();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${HOST}/identity/v2/oauth2/token`,
    );
  });

  test('uses custom host when provided', async () => {
    const fetchMock = setupFetch(jsonResponse(authResponse()));
    const mau = new InvestecMauApi('id', 'secret', 'key', SANDBOX);
    await mau.getAccessToken();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${SANDBOX}/identity/v2/oauth2/token`,
    );
  });

  test('should instantiate', () => {
    const mau = new InvestecMauApi('id', 'secret', 'key');
    expect(mau).toBeInstanceOf(InvestecMauApi);
  });

  test('getAccountBalances throws with missing accountId', async () => {
    const mau = new InvestecMauApi('id', 'secret', 'key');
    await expect(mau.getAccountBalances('')).rejects.toThrow(
      'Missing required parameters',
    );
  });

  test('getAccountTransactions throws with missing params', async () => {
    const mau = new InvestecMauApi('id', 'secret', 'key');
    await expect(
      mau.getAccountTransactions('', '2024-01-01', '2024-01-31'),
    ).rejects.toThrow('Missing required parameters');
    await expect(
      mau.getAccountTransactions(5331, '', '2024-01-31'),
    ).rejects.toThrow('Missing required parameters');
    await expect(
      mau.getAccountTransactions(5331, '2024-01-01', ''),
    ).rejects.toThrow('Missing required parameters');
  });

  test('getAccountDocuments throws with missing params', async () => {
    const mau = new InvestecMauApi('id', 'secret', 'key');
    await expect(
      mau.getAccountDocuments('', '2024-01-01', '2024-01-31'),
    ).rejects.toThrow('Missing required parameters');
  });

  test('downloadAccountStatement throws with missing params', async () => {
    const mau = new InvestecMauApi('id', 'secret', 'key');
    await expect(
      mau.downloadAccountStatement('', '2025-01-31'),
    ).rejects.toThrow('Missing required parameters');
    await expect(mau.downloadAccountStatement(5331, '')).rejects.toThrow(
      'Missing required parameters',
    );
  });

  test('getAccessToken posts to identity endpoint and stores token', async () => {
    const fetchMock = setupFetch(jsonResponse(authResponse()));
    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const result = await mau.getAccessToken();

    expect(result.access_token).toBe('test-token');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${HOST}/identity/v2/oauth2/token`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('grant_type=client_credentials');
    expect(init.headers['x-api-key']).toBe('key');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('id:secret').toString('base64')}`,
    );
  });

  test('getAccessToken throws InvestecApiError on failure', async () => {
    setupFetch(textResponse('bad credentials', 401, 'Unauthorized'));
    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const error = await mau.getAccessToken().catch((e) => e);

    expect(error).toBeInstanceOf(InvestecApiError);
    expect(error.status).toBe(401);
    expect(error.body).toBe('bad credentials');
  });

  test('getToken returns cached token until expiry', async () => {
    const fetchMock = setupFetch(jsonResponse(authResponse(3600)));
    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);

    const first = await mau.getToken();
    const second = await mau.getToken();
    expect(first).toBe('test-token');
    expect(second).toBe('test-token');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('getAccounts flattens nested data.accounts.accounts', async () => {
    const fetchMock = setupFetch(
      jsonResponse(authResponse()),
      jsonResponse({
        data: {
          accounts: {
            accounts: [
              {
                accountId: 5331,
                accountNumber: '10101010101',
                accountName: 'XYZ PTY LTD USD',
                accountCurrency: 'USD',
                profileId: 9633,
                profileName: 'XYZ PTY LTD',
              },
            ],
          },
        },
        links: { self: `${HOST}/mu/pb/v1/accounts` },
        meta: { totalPages: 1 },
      }),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const accounts = await mau.getAccounts();

    expect(accounts.data.accounts).toHaveLength(1);
    expect(accounts.data.accounts[0]?.accountId).toBe(5331);
    expect(accounts.links?.self).toBe(`${HOST}/mu/pb/v1/accounts`);
    expect(accounts.meta?.totalPages).toBe(1);
    // Nested wire shape must not leak to consumers
    expect(
      (accounts.data.accounts as unknown as { accounts?: unknown }).accounts,
    ).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`${HOST}/mu/pb/v1/accounts`);
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  test('getAccountBalances flattens nested data.accounts.balance', async () => {
    const fetchMock = setupFetch(
      jsonResponse(authResponse()),
      jsonResponse({
        data: {
          accounts: {
            balance: {
              accountNumber: '10101010101',
              accountType: 'CALL DEPOSIT',
              accountShortName: 'XYZ PTY LTD',
              balance: 1043966.3,
              availableBalance: 635506.65,
              encumbrances: 152139.76,
              currency: 'USD',
              debitInterestRate: 0,
              creditInterestRate: 1.1375,
              creditInterestAccrued: 465.19,
              debitInterestAccrued: 0,
              overDraftLimit: 0,
            },
          },
        },
      }),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const balance = await mau.getAccountBalances('acc/1');

    expect(balance.data.availableBalance).toBe(635506.65);
    expect(balance.data.currency).toBe('USD');
    expect(fetchMock.mock.calls[1]![0]).toBe(
      `${HOST}/mu/pb/v1/accounts/acc%2F1/balance`,
    );
  });

  test('getAccountTransactions flattens nested data.accounts.transactions', async () => {
    const fetchMock = setupFetch(
      jsonResponse(authResponse()),
      jsonResponse({
        data: {
          accounts: {
            transactions: [
              {
                description: 'Wages',
                creditAmount: 0,
                debitAmount: 535,
                transactionDate: '2024-02-12',
                postDate: '2024-02-12',
                bankReference: 'Payment to XYZ LTD',
                amount: 535,
                runningBalance: 9000.76,
              },
            ],
          },
        },
      }),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const result = await mau.getAccountTransactions(
      5331,
      '2024-01-01',
      '2024-01-31',
    );

    expect(result.data.transactions).toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(url.pathname).toBe('/mu/pb/v1/accounts/5331/transactions');
    expect(url.searchParams.get('fromDate')).toBe('2024-01-01');
    expect(url.searchParams.get('toDate')).toBe('2024-01-31');
  });

  test('getAccountDocuments lists available statements', async () => {
    const fetchMock = setupFetch(
      jsonResponse(authResponse()),
      jsonResponse({
        availableDocuments: {
          accountNumber: '0173123456500',
          documentInformation: [
            { documentDate: '2025-01-31', documentType: 'Statement' },
          ],
        },
      }),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const result = await mau.getAccountDocuments(
      5331,
      '2025-01-01',
      '2025-01-31',
    );

    expect(result.availableDocuments.documentInformation[0]?.documentDate).toBe(
      '2025-01-31',
    );
    const url = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(url.pathname).toBe('/mu/pb/v1/accounts/5331/documents');
    expect(url.searchParams.get('fromDate')).toBe('2025-01-01');
    expect(url.searchParams.get('toDate')).toBe('2025-01-31');
  });

  test('downloadAccountStatement returns PDF bytes', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const fetchMock = setupFetch(
      jsonResponse(authResponse()),
      binaryResponse(pdfBytes),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const result = await mau.downloadAccountStatement(5331, '2025-01-31');

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result)[0]).toBe(0x25);
    expect(fetchMock.mock.calls[1]![0]).toBe(
      `${HOST}/mu/pb/v1/accounts/5331/document/statement/2025-01-31`,
    );
    expect(fetchMock.mock.calls[1]![1].headers.Accept).toBe('application/pdf');
  });

  test('reuses token until near expiry then refreshes', async () => {
    const emptyAccounts = {
      data: { accounts: { accounts: [] as unknown[] } },
    };
    const fetchMock = setupFetch(
      jsonResponse(authResponse(3600)),
      jsonResponse(emptyAccounts),
      jsonResponse(emptyAccounts),
      jsonResponse(authResponse(0)),
      jsonResponse(authResponse(3600)),
      jsonResponse(emptyAccounts),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    await mau.getAccounts();
    await mau.getAccounts();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await mau.getAccessToken();
    await mau.getAccounts();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls[4]![0]).toBe(
      `${HOST}/identity/v2/oauth2/token`,
    );
  });

  test('coalesces concurrent token refreshes', async () => {
    let resolveAuth!: (value: Response) => void;
    const authPending = new Promise<Response>((resolve) => {
      resolveAuth = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/oauth2/token')) {
        return authPending;
      }
      return Promise.resolve(
        jsonResponse({ data: { accounts: { accounts: [] } } }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const first = mau.getAccounts();
    const second = mau.getAccounts();

    resolveAuth(jsonResponse(authResponse()));
    await Promise.all([first, second]);

    const authCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/oauth2/token'),
    );
    expect(authCalls).toHaveLength(1);
  });

  test('retries once after 401 by refreshing the token', async () => {
    const fetchMock = setupFetch(
      jsonResponse(authResponse(3600, 'old-token')),
      jsonResponse({ message: 'expired' }, 401),
      jsonResponse(authResponse(3600, 'fresh-token')),
      jsonResponse({ data: { accounts: { accounts: [] } } }),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const result = await mau.getAccounts();

    expect(result.data.accounts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]![1].headers.Authorization).toBe(
      'Bearer fresh-token',
    );
  });

  test('throws when 401 retry also fails', async () => {
    const fetchMock = setupFetch(
      jsonResponse(authResponse(3600, 'old-token')),
      jsonResponse({ message: 'expired' }, 401),
      jsonResponse(authResponse(3600, 'fresh-token')),
      textResponse('still forbidden', 403, 'Forbidden'),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const error = await mau.getAccounts().catch((e) => e);

    expect(error).toBeInstanceOf(InvestecApiError);
    expect(error.status).toBe(403);
    expect(error.body).toBe('still forbidden');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('throws InvestecApiError with status and body', async () => {
    setupFetch(
      jsonResponse(authResponse()),
      jsonResponse({ message: 'nope' }, 404),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const error = await mau.getAccounts().catch((e) => e);

    expect(error).toBeInstanceOf(InvestecApiError);
    expect(error.status).toBe(404);
    expect(error.endpoint).toBe(`${HOST}/mu/pb/v1/accounts`);
    expect(error.body).toContain('nope');
  });

  test('throws InvestecApiError when document download fails', async () => {
    setupFetch(
      jsonResponse(authResponse()),
      textResponse('not found', 404, 'Not Found'),
    );

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const error = await mau
      .downloadAccountStatement(5331, '2025-01-31')
      .catch((e) => e);

    expect(error).toBeInstanceOf(InvestecApiError);
    expect(error.status).toBe(404);
    expect(error.body).toBe('not found');
  });

  test('still throws InvestecApiError if reading error body fails', async () => {
    const broken = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => {
        throw new Error('stream failed');
      },
    } as unknown as Response;

    setupFetch(jsonResponse(authResponse()), broken);

    const mau = new InvestecMauApi('id', 'secret', 'key', HOST);
    const error = await mau.getAccounts().catch((e) => e);

    expect(error).toBeInstanceOf(InvestecApiError);
    expect(error.status).toBe(502);
    expect(error.body).toBeUndefined();
    expect(error.message).toContain('Bad Gateway');
  });
});
