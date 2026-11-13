// The customer-facing car code (CF-XXXXXXX). Never reveals the auction.
// Must stay identical to publicCode() in scripts/sync-lots.mjs so codes don't change between tools.
import { createHash } from 'node:crypto';

export function publicCode(source: string, sourceLotId: string): string {
  const hex = createHash('sha1').update(`${source}-${sourceLotId}`).digest('hex').slice(0, 10);
  return 'CF-' + BigInt('0x' + hex).toString(36).toUpperCase().padStart(7, '0').slice(-7);
}
