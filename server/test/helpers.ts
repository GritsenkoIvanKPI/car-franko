import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HttpClient, HttpResponse } from '../src/providers/http.js';

export const fixture = (path: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${path}`, import.meta.url)), 'utf8');
export const fixtureJson = <T = unknown>(path: string): T => JSON.parse(fixture(path)) as T;

/** Fake HTTP client: answers by URL substring, records calls. */
export class FakeHttp implements HttpClient {
  calls: string[] = [];
  constructor(private readonly routes: Array<[string | RegExp, Partial<HttpResponse> & { body: string }]>) {}
  async request(url: string): Promise<HttpResponse> {
    this.calls.push(url);
    const hit = this.routes.find(([m]) => (typeof m === 'string' ? url.includes(m) : m.test(url)));
    if (!hit) return { status: 404, url, headers: new Headers(), body: 'not found' };
    return { status: 200, url, headers: new Headers(), ...hit[1] };
  }
}
