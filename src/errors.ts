/**
 * Error thrown when an Investec API request fails.
 */
export class InvestecApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly body: string | undefined;

  constructor(
    status: number,
    endpoint: string,
    statusText: string,
    body?: string,
  ) {
    const detail = body?.trim()
      ? `: ${body.trim()}`
      : statusText
        ? `: ${statusText}`
        : '';
    super(`Investec API request failed (${status})${detail}`);
    this.name = 'InvestecApiError';
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}
