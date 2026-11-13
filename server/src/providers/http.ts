// Minimal HTTP layer that providers talk to. Step 4 wraps this with the per-source queue,
// rate limit, jitter and retries; providers don't change.

import { ProviderBlockedError, TransientError } from './errors.js';

export interface HttpResponse {
  status: number;
  url: string;
  headers: Headers;
  body: string;
}

export interface HttpRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpClient {
  request(url: string, init?: HttpRequest): Promise<HttpResponse>;
}

export class FetchHttpClient implements HttpClient {
  constructor(
    private readonly providerId: string,
    private readonly userAgent: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async request(url: string, init: HttpRequest = {}): Promise<HttpResponse> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: init.method ?? 'GET',
        // Don't follow redirects automatically: bot-protection challenges arrive as 302/307.
        redirect: 'manual',
        headers: { 'User-Agent': this.userAgent, 'Accept-Language': 'en-US,en;q=0.8', ...init.headers },
        body: init.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new TransientError(this.providerId, `network error for ${url}: ${(e as Error).message}`);
    }
    const body = await res.text();
    return { status: res.status, url, headers: res.headers, body };
  }
}

// Markers of a challenge / block page. A normal IAAI page also loads an Imperva script
// (_Incapsula_Resource), so that alone is NOT treated as a block.
const BLOCK_PATTERNS: Array<[RegExp, string]> = [
  [/<title>\s*Loading\s*<\/title>/i, 'Imperva JavaScript challenge'],
  [/Request unsuccessful\. Incapsula incident ID/i, 'Imperva incident page'],
  [/Pardon Our Interruption/i, 'bot-detection interstitial'],
  [/Access Denied|You don't have permission to access/i, 'access denied page'],
  [/g-recaptcha|hcaptcha|cf-challenge|captcha-container|class="captcha/i, 'CAPTCHA'],
  [/Just a moment\.\.\./i, 'Cloudflare challenge'],
];

/**
 * Throws ProviderBlockedError for 403/429, redirects to challenge pages, or challenge/CAPTCHA HTML.
 * Throws TransientError for 5xx. Returns normally for anything else.
 */
export function assertNotBlocked(providerId: string, res: HttpResponse, expectJson = false): void {
  if (res.status === 403) throw new ProviderBlockedError(providerId, 'HTTP 403 Forbidden', 403, res.url);
  if (res.status === 429) throw new ProviderBlockedError(providerId, 'HTTP 429 Too Many Requests', 429, res.url);
  // Imperva's bare challenge page: a tiny HTML whose only content is a /_Incapsula_Resource?… script.
  // (Normal IAAI pages also include that script, but they are hundreds of KB, so size tells them apart.)
  if (res.body.length < 5_000 && /<script[^>]+src="\/_Incapsula_Resource\?/i.test(res.body)) {
    throw new ProviderBlockedError(providerId, 'Imperva JavaScript challenge (script-only page)', res.status, res.url);
  }
  for (const [re, reason] of BLOCK_PATTERNS) {
    // Only small or HTML bodies can be challenge pages; don't scan big JSON payloads for words like "captcha".
    if ((res.body.length < 20_000 || /^\s*</.test(res.body)) && re.test(res.body)) {
      throw new ProviderBlockedError(providerId, reason, res.status, res.url);
    }
  }
  if (res.status >= 300 && res.status < 400) {
    throw new ProviderBlockedError(providerId, `unexpected redirect (HTTP ${res.status}) to ${res.headers.get('location') ?? '?'}`, res.status, res.url);
  }
  if (res.status >= 500) throw new TransientError(providerId, `HTTP ${res.status} for ${res.url}`, res.status);
  if (expectJson && /^\s*</.test(res.body)) {
    throw new ProviderBlockedError(providerId, 'HTML received where JSON was expected', res.status, res.url);
  }
}
