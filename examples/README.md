# Examples

Runnable scripts that exercise `investec-mau-api` against Investec production or sandbox.

## Setup

```sh
export INVESTEC_CLIENT_ID=your_client_id
export INVESTEC_CLIENT_SECRET=your_client_secret
export INVESTEC_API_KEY=your_api_key

# Optional — prefer sandbox while experimenting
export INVESTEC_HOST=https://openapisandbox.investec.com
```

## Scripts

| Command                     | File                                       | What it does                                  |
| --------------------------- | ------------------------------------------ | --------------------------------------------- |
| `npm run example:basic`     | [`basic-usage.ts`](./basic-usage.ts)       | Auth, accounts, balances, recent transactions |
| `npm run example:documents` | [`documents.ts`](./documents.ts)           | List (and optionally download) statement PDFs |
| `npm run example:errors`    | [`error-handling.ts`](./error-handling.ts) | Print a typed `InvestecApiError`              |

Shared client setup lives in [`create-client.ts`](./create-client.ts).

## Document download

`documents` lists statements by default. It only writes a PDF when you set an explicit confirm flag:

```sh
export INVESTEC_ACCOUNT_ID=...
export INVESTEC_STATEMENT_DATE=2025-01-31
CONFIRM_DOWNLOAD=true npm run example:documents
```

Optional: `INVESTEC_FROM_DATE`, `INVESTEC_TO_DATE`, `INVESTEC_STATEMENT_OUT`.
