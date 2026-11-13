// Errors that the sync layer reacts to differently.

/** 403, 429, CAPTCHA or bot-challenge page. Sync must pause this source and notify — never retry around it. */
export class ProviderBlockedError extends Error {
  constructor(
    readonly providerId: string,
    readonly reason: string,
    readonly httpStatus: number | null,
    readonly url: string,
  ) {
    super(`[${providerId}] blocked: ${reason} (HTTP ${httpStatus ?? '-'}) at ${url}`);
    this.name = 'ProviderBlockedError';
  }
}

/** The source changed its response format; required fields are missing. Sync must fail the run, not write data. */
export class SchemaChangedError extends Error {
  constructor(
    readonly providerId: string,
    readonly where: string,
    readonly issues: string[],
  ) {
    super(`[${providerId}] response structure changed in ${where}: ${issues.slice(0, 5).join('; ')}`);
    this.name = 'SchemaChangedError';
  }
}

/** Network error, timeout or 5xx. Safe to retry with backoff. */
export class TransientError extends Error {
  constructor(readonly providerId: string, message: string, readonly httpStatus: number | null = null) {
    super(`[${providerId}] ${message}`);
    this.name = 'TransientError';
  }
}
