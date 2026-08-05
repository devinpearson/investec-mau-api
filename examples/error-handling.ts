/**
 * Demonstrates typed error handling with InvestecApiError.
 *
 * Required env:
 *   INVESTEC_CLIENT_ID / INVESTEC_CLIENT_SECRET / INVESTEC_API_KEY
 *
 * Optional env:
 *   INVESTEC_HOST=https://openapisandbox.investec.com
 *
 * Run:
 *   npm run example:errors
 */

import { InvestecApiError } from '../src/index.js';
import { createClientFromEnv } from './create-client.js';

async function main() {
  const mau = createClientFromEnv();

  try {
    // Intentionally invalid account id to surface an API error shape.
    await mau.getAccountBalances('not-a-real-account-id');
  } catch (err) {
    if (err instanceof InvestecApiError) {
      console.log('Caught InvestecApiError:');
      console.log(`  status:   ${err.status}`);
      console.log(`  endpoint: ${err.endpoint}`);
      console.log(`  body:     ${err.body ?? '(empty)'}`);
      console.log(`  message:  ${err.message}`);
      return;
    }
    throw err;
  }

  console.log('Unexpected success — the account id may have been valid.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
