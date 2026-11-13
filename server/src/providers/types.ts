// The provider contract. Sync, database and API depend only on this file, so a new data source
// (e.g. a paid ApibaraProvider) is one new class plus one line in registry.ts.

import type { FilterSet } from '../config/filters.js';
import type { NormalizedLot, Photo, Source } from '../domain/lot.js';

/** Opaque, provider-defined position in the result list (page number, sitemap file index, cursor…). */
export type PageToken = string;

export interface SearchItem {
  sourceLotId: string;
  url?: string;
  lastModified?: string | null; // lets sync skip lots that haven't changed
  lot?: NormalizedLot;          // present when the search response already has full details
}

export interface SearchPage {
  items: SearchItem[];
  nextPage: PageToken | null;   // null = no more pages
  totalEstimate?: number;
}

export interface ProviderCapabilities {
  /** Search applies our filters on the source side. If false, sync filters after getLot(). */
  serverSideFilters: boolean;
  /** Search results already contain normalised lots, so getLot() isn't needed per item. */
  searchReturnsFullLots: boolean;
  /** Current bid is visible to us. */
  exposesCurrentBid: boolean;
}

export interface AuctionProvider {
  /** Stable id used in logs, run records and pause state, e.g. "iaai-web", "copart-web", "apibara". */
  readonly id: string;
  /** Auction the lots belong to. A multi-auction API is registered once per source. */
  readonly source: Source;
  readonly capabilities: ProviderCapabilities;

  searchLots(filters: FilterSet, page: PageToken | null): Promise<SearchPage>;
  /** null = the lot no longer exists at the source (sold, withdrawn or removed). */
  getLot(sourceLotId: string): Promise<NormalizedLot | null>;
  getPhotos(sourceLotId: string): Promise<Photo[]>;
}
