// The only place that knows concrete provider classes.
// Adding a paid API later: implement AuctionProvider in providers/apibara.ts and add a case below.

import type { Env } from '../config/env.js';
import { CopartProvider } from './copart.js';
import { FetchHttpClient, type HttpClient } from './http.js';
import { IaaiProvider } from './iaai.js';
import type { AuctionProvider } from './types.js';

export type HttpClientFactory = (providerId: string) => HttpClient;

export function createProviders(env: Env, httpFor?: HttpClientFactory): AuctionProvider[] {
  const http = httpFor ?? ((id: string) => new FetchHttpClient(id, env.HTTP_USER_AGENT, env.HTTP_TIMEOUT_MS));
  return env.PROVIDERS.map(id => {
    switch (id) {
      case 'iaai-web': return new IaaiProvider(http(id), { sitemapIndexUrl: env.IAAI_SITEMAP_INDEX_URL });
      case 'copart-web': return new CopartProvider(http(id));
      // case 'apibara': return new ApibaraProvider(http(id), { apiKey: env.APIBARA_API_KEY!, source: 'copart' });
      default: throw new Error(`Unknown provider "${id}" in PROVIDERS`);
    }
  });
}
