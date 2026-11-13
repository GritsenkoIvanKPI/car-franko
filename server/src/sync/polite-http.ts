// Polite HTTP: one request at a time per source, a random 2–3 s gap between requests,
// retries with exponential backoff for network errors / 5xx only. Blocks (403, 429, CAPTCHA,
// challenge pages) are never retried — the provider raises ProviderBlockedError and sync stops.

import { TransientError } from '../providers/errors.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../providers/http.js';

export interface PoliteOptions {
  minDelayMs: number;
  maxDelayMs: number;
  retries: number;          // extra attempts for transient failures
  backoffBaseMs: number;    // 1st retry waits base, then x2, x4 … (+ jitter)
  sleep?: (ms: number) => Promise<void>;
  onRequest?: (url: string) => void;
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export class PoliteHttpClient implements HttpClient {
  private chain: Promise<unknown> = Promise.resolve();
  private lastAt = 0;
  readonly stats = { requests: 0, retries: 0 };

  constructor(private readonly inner: HttpClient, private readonly opts: PoliteOptions) {}

  /** Requests are queued; only one runs at a time for this source. */
  request(url: string, init?: HttpRequest): Promise<HttpResponse> {
    const run = this.chain.then(() => this.send(url, init));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async send(url: string, init?: HttpRequest): Promise<HttpResponse> {
    const sleep = this.opts.sleep ?? realSleep;
    for (let attempt = 0; ; attempt++) {
      const gap = this.opts.minDelayMs + Math.random() * (this.opts.maxDelayMs - this.opts.minDelayMs);
      const wait = this.lastAt + gap - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastAt = Date.now();
      this.stats.requests++;
      this.opts.onRequest?.(url);
      try {
        const res = await this.inner.request(url, init);
        if (res.status >= 500 && attempt < this.opts.retries) throw new TransientError('http', `HTTP ${res.status}`, res.status);
        return res;
      } catch (e) {
        if (!(e instanceof TransientError) || attempt >= this.opts.retries) throw e;
        this.stats.retries++;
        const backoff = this.opts.backoffBaseMs * 2 ** attempt * (1 + Math.random() * 0.3);
        await sleep(backoff);
      }
    }
  }
}
