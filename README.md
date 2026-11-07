# Investec MAU API

Connect with the Investec Mauritius Open Banking API.

[![Node.js CI](https://github.com/devinpearson/investec-mau-api/actions/workflows/node.js.yml/badge.svg)](https://github.com/devinpearson/investec-mau-api/actions/workflows/node.js.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/investec-mau-api.svg)](https://badge.fury.io/js/investec-mau-api)

## About

A TypeScript package to connect to the Investec Mauritius Accounts API (`/mu/pb/v1`). It provides convenient methods for authentication, account info, balances, transactions, and statement documents.

## Features

- OAuth2 authentication (client credentials + x-api-key)
- Fetch accounts, balances, and transactions
- List and download account statement PDFs
- Fully typed responses and request payloads

## Installation

Install the package using npm:

```sh
npm install investec-mau-api
```

## Usage

### Import and Initialize

```typescript
import { InvestecMauApi } from 'investec-mau-api';

const mau = new InvestecMauApi({
  clientId: '<clientId>',
  clientSecret: '<clientSecret>',
  apiKey: '<apiKey>',
});

// The positional form still works:
// new InvestecMauApi('<clientId>', '<clientSecret>', '<apiKey>', host);
```

All options:

| Option         | Default                        | What it does                                                                                              |
| -------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `host`         | `https://openapi.investec.com` | API host. Use `https://openapisandbox.investec.com` for the sandbox. A path prefix (for a proxy) is kept. |
| `fetch`        | global `fetch`                 | Your own fetch, for proxies, logging or tests.                                                            |
| `timeoutMs`    | `30000`                        | Per-request timeout.                                                                                      |
| `retries`      | `0`                            | Retries for requests that fail with 429, 500, 502, 503, 504 or a network error. The token request is never retried. |
| `retryDelayMs` | `500`                          | First retry delay, doubled each attempt. A 429's `Retry-After` is used when present. Capped at 30 s.      |

The client uses only `fetch`, `btoa` and `AbortSignal`, so it runs on Node 22+, Bun, Deno and edge runtimes.

### Fetch Accounts

```typescript
const accounts = await mau.getAccounts();
console.log(accounts.data.accounts);
```

### Fetch Account Balances

```typescript
const balances = await mau.getAccountBalances(accountId);
console.log(balances.data);
```

### Fetch Transactions

`fromDate` and `toDate` are required (YYYY-MM-DD).

```typescript
const transactions = await mau.getAccountTransactions(
  accountId,
  '2024-01-01',
  '2024-01-31',
);
console.log(transactions.data.transactions);
```

### List Documents

```typescript
const documents = await mau.getAccountDocuments(
  accountId,
  '2025-01-01',
  '2025-01-31',
);
console.log(documents.availableDocuments.documentInformation);
```

### Download a Statement PDF

```typescript
const pdf = await mau.downloadAccountStatement(accountId, '2025-01-31');
// pdf is an ArrayBuffer — e.g. write with fs.writeFile
```

## API Reference

All methods are fully typed. See the [src/types.ts](src/types.ts) file for detailed type definitions.

### Error Handling

API failures throw `InvestecApiError` with `status`, `endpoint`, and optional `body`. A missing argument throws `InvestecValidationError` before any request is sent; its `parameter` names the argument.

```typescript
import { InvestecApiError, InvestecValidationError } from 'investec-mau-api';

try {
  const accounts = await mau.getAccounts();
} catch (err) {
  if (err instanceof InvestecApiError) {
    console.error(err.status, err.endpoint, err.body);
  } else if (err instanceof InvestecValidationError) {
    console.error('Bad argument:', err.parameter);
  } else {
    console.error('API error:', err);
  }
}
```

## API Response Shape

### AccountResponse

```json
{
  "data": {
    "accounts": [
      {
        "profileId": 9633,
        "profileName": "XYZ PTY LTD",
        "accountId": 5331,
        "accountName": "XYZ PTY LTD USD",
        "accountNumber": "10101010101",
        "accountCurrency": "USD"
      }
    ]
  },
  "links": {
    "self": "https://openapi.investec.com/mu/pb/v1/accounts"
  },
  "meta": {
    "totalPages": 1
  }
}
```

### AccountBalanceResponse

```json
{
  "data": {
    "accountNumber": "10101010101",
    "accountType": "CALL DEPOSIT",
    "accountShortName": "XYZ PTY LTD",
    "balance": 1043966.3,
    "availableBalance": 635506.65,
    "encumbrances": 152139.76,
    "currency": "USD",
    "debitInterestRate": 0,
    "creditInterestRate": 1.1375,
    "creditInterestAccrued": 465.19,
    "debitInterestAccrued": 0,
    "overDraftLimit": 0
  }
}
```

### AccountTransactionResponse

```json
{
  "data": {
    "transactions": [
      {
        "description": "Wages",
        "creditAmount": 0,
        "debitAmount": 535,
        "transactionDate": "2024-02-12",
        "postDate": "2024-02-12",
        "bankReference": "Payment to XYZ LTD",
        "amount": 535,
        "runningBalance": 9000.76
      }
    ]
  }
}
```

### AccountDocumentsResponse

```json
{
  "availableDocuments": {
    "accountNumber": "0173123456500",
    "documentInformation": [
      {
        "documentDate": "2025-01-31",
        "documentType": "Statement"
      }
    ]
  }
}
```

Refer to [src/types.ts](src/types.ts) for full type definitions and details.

## Types

You can import types for strict typing in your own code:

```typescript
import type {
  Account,
  AccountResponse,
  AccountTransaction,
  AccountDocumentsResponse,
} from 'investec-mau-api';
import { InvestecApiError } from 'investec-mau-api';
```

## Troubleshooting

- Ensure your API credentials are correct and have the required scopes (`accounts`, `transactions`, `balances`, `documents.statements` as needed).
- The package requires Node.js 22+ (older lines are end-of-life and untested).
- If you see authentication errors, check your client ID, secret, and API key.

## Example Usage

Runnable examples live in [`examples/`](examples/). See [`examples/README.md`](examples/README.md) for the full list.

| Script                      | Purpose                                |
| --------------------------- | -------------------------------------- |
| `npm run example:basic`     | Auth, accounts, balances, transactions |
| `npm run example:documents` | List / download statement PDFs         |
| `npm run example:errors`    | Demonstrate `InvestecApiError`         |

### Running the examples

1. **Set your credentials as environment variables** (recommended):

   - `INVESTEC_CLIENT_ID`
   - `INVESTEC_CLIENT_SECRET`
   - `INVESTEC_API_KEY`
   - Optional: `INVESTEC_HOST=https://openapisandbox.investec.com`

   Example (macOS/Linux):

   ```sh
   export INVESTEC_CLIENT_ID=your_client_id
   export INVESTEC_CLIENT_SECRET=your_client_secret
   export INVESTEC_API_KEY=your_api_key
   ```

2. **Run a read-only walkthrough:**

   ```sh
   npm run example:basic
   ```

3. **Document download is dry-run by default.** Set an account id, statement date, and confirm flag to write a PDF:

   ```sh
   export INVESTEC_ACCOUNT_ID=...
   export INVESTEC_STATEMENT_DATE=2025-01-31
   CONFIRM_DOWNLOAD=true npm run example:documents
   ```

> Tip: Prefer the sandbox host while experimenting. Sandbox credentials are documented in the Investec Mauritius Open Banking OpenAPI spec.

---

## Development

| Command                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `npm test`              | Unit tests (mocked `fetch`)                             |
| `npm run test:mutation` | Stryker mutation testing; report in `reports/mutation/` |
| `npm run lint`          | Biome lint + format check (`npm run lint:fix` to fix)   |
| `npm run ci`            | Build, typecheck, lint and check package exports        |

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
