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

const mau = new InvestecMauApi('<clientId>', '<clientSecret>', '<apiKey>');

// Optional: use the Investec sandbox host
// const mau = new InvestecMauApi(
//   '<clientId>',
//   '<clientSecret>',
//   '<apiKey>',
//   'https://openapisandbox.investec.com',
// );
```

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

API failures throw `InvestecApiError` with `status`, `endpoint`, and optional `body`. Validation failures throw a plain `Error`. Use try/catch to handle errors:

```typescript
import { InvestecApiError } from 'investec-mau-api';

try {
  const accounts = await mau.getAccounts();
} catch (err) {
  if (err instanceof InvestecApiError) {
    console.error(err.status, err.endpoint, err.body);
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
- The package requires Node.js 18+ (for fetch and AbortController support).
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

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
