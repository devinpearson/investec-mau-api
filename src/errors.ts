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

/**
 * Error thrown before any request is sent, when a method is called with a
 * missing or invalid argument. `parameter` names the offending argument.
 */
export class InvestecValidationError extends Error {
  readonly parameter: string;

  constructor(parameter: string, message?: string) {
    super(message ?? `Missing required parameters: ${parameter}`);
    this.name = 'InvestecValidationError';
    this.parameter = parameter;
  }
}
