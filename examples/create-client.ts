import { InvestecMauApi } from '../src/index.js';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See examples/README.md.`,
    );
  }
  return value;
}

/**
 * Create an API client from environment variables.
 *
 * Required: INVESTEC_CLIENT_ID, INVESTEC_CLIENT_SECRET, INVESTEC_API_KEY
 * Optional: INVESTEC_HOST (defaults to production; use sandbox URL for testing)
 */
export function createClientFromEnv(): InvestecMauApi {
  const clientId = requireEnv('INVESTEC_CLIENT_ID');
  const clientSecret = requireEnv('INVESTEC_CLIENT_SECRET');
  const apiKey = requireEnv('INVESTEC_API_KEY');
  const host = process.env.INVESTEC_HOST ?? 'https://openapi.investec.com';

  return new InvestecMauApi(clientId, clientSecret, apiKey, host);
}
