/**
 * Publisher/source freshness gates.
 * This is an integrity filter, NOT an oracle quorum or a licensing guarantee.
 */
export const MAX_SOURCE_AGE_MS = 15000;
const MAX_CLOCK_AHEAD_MS = 30000;

export function selectFreshSources(sources, {
  nowMs = Date.now(),
  maxAgeMs = MAX_SOURCE_AGE_MS
} = {}) {
  const accepted = [];
  const rejected = [];
  for (const source of sources) {
    const provider = source?.provider || "unknown";
    const last = Number(source?.last);
    if (!Number.isFinite(last) || last <= 0) {
      rejected.push({provider,reason:"INVALID_PRICE"}); continue;
    }
    const received = Date.parse(source?.receivedAt);
    if (!Number.isFinite(received) || received > nowMs + MAX_CLOCK_AHEAD_MS ||
        nowMs - received > maxAgeMs) {
      rejected.push({provider,reason:"STALE_RECEIPT"});continue;
    }
    if (source.sourceTime != null) {
      const sourceTime = Date.parse(source.sourceTime);
      if (!Number.isFinite(sourceTime) ||
          sourceTime > nowMs + MAX_CLOCK_AHEAD_MS ||
          nowMs - sourceTime > maxAgeMs) {
        rejected.push({provider,reason:"STALE_SOURCE"});continue;
      }
    }
    accepted.push(source);
  }
  return {accepted,rejected};
}

export function selectFreshBooks(books, opts = {}) {
  const checked = selectFreshSources(books.map((book) => ({
    ...book,
    last: Number(book?.bids?.[0]?.price)
  })),opts);
  const accepted = [];
  const rejected = [...checked.rejected];
  for (const book of checked.accepted) {
    const bid = Number(book.bids?.[0]?.price);
    const ask = Number(book.asks?.[0]?.price);
    if (!Number.isFinite(ask) || ask <= bid) {
      rejected.push({provider:book.provider,reason:"CROSSED_OR_INVALID_VENUE_BOOK"});
      continue;
    }
    accepted.push(book);
  }
  return {accepted,rejected};
}

export function mergeUnavailable(upstream, discarded) {
  return [...upstream, ...discarded.map((item) => ({
    provider:item.provider,error:item.reason
  }))];
}
