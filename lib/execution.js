import { estimateLiquidity } from "./analytics.js";

/**
 * Non-predictive, transparent microstructure signals from current snapshots.
 * No trained ML model and no execution guarantee is claimed.
 */
const round = (n, digits = 3) =>
  Number.isFinite(n) ? Number(n.toFixed(digits)) : null;

export function executionIntelligence(books, symbol, side, notionalUsd, unavailable = []) {
  if (!Array.isArray(books) || !books.length) {
    throw new Error("No valid books supplied");
  }
  if (!["buy","sell"].includes(side) ||
      !Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    throw new Error("Invalid execution request");
  }
  const quote = estimateLiquidity(books,symbol,side,notionalUsd,unavailable);
  const venueStats = books.map((book) => {
    const bid = book.bids[0].price;
    const ask = book.asks[0].price;
    const mid = (bid+ask)/2;
    const bidUsd = book.bids.reduce((sum,l) => sum+l.price*l.size,0);
    const askUsd = book.asks.reduce((sum,l) => sum+l.price*l.size,0);
    const total = bidUsd+askUsd;
    return {
      provider:book.provider,mid:round(mid,8),bestBid:bid,bestAsk:ask,
      spreadBps:round((ask-bid)/mid*10000),
      displayedBidDepthUsd:round(bidUsd,2),
      displayedAskDepthUsd:round(askUsd,2),
      bookImbalance:total > 0 ? round((bidUsd-askUsd)/total,4) : null,
      receivedAt:book.receivedAt || null
    };
  });
  const bestBid = Math.max(...venueStats.map(v=>v.bestBid));
  const bestAsk = Math.min(...venueStats.map(v=>v.bestAsk));
  const mid = quote.referenceMid;
  const topOfBookSpreadBps = round((bestAsk-bestBid)/mid*10000);
  const venueMidDispersionBps = round(
    (Math.max(...venueStats.map(v=>v.mid))-Math.min(...venueStats.map(v=>v.mid))) / mid*10000
  );
  const filled = Object.values(quote.providerNotionalUsd || {});
  const biggestVenue = filled.length && quote.filledNotionalUsd>0 ?
    Math.max(...filled)/quote.filledNotionalUsd : null;
  const flags = [];
  if (books.length < 2) flags.push("LOW_SOURCE_REDUNDANCY");
  if (quote.unfilled) flags.push("INSUFFICIENT_DISPLAYED_LIQUIDITY");
  if (topOfBookSpreadBps < 0) flags.push("CROSSED_INTERVENUE_SNAPSHOT");
  if (topOfBookSpreadBps > 35) flags.push("WIDE_TOP_OF_BOOK_SPREAD");
  if (venueMidDispersionBps > 50) flags.push("VENUE_PRICE_DIVERGENCE");
  if (biggestVenue !== null && biggestVenue > 0.8) flags.push("HIGH_SINGLE_VENUE_CONCENTRATION");
  const totalBid = venueStats.reduce((s,v)=>s+v.displayedBidDepthUsd,0);
  const totalAsk = venueStats.reduce((s,v)=>s+v.displayedAskDepthUsd,0);
  return {
    schemaVersion:"1.0",symbol,side,requestedNotionalUsd:notionalUsd,
    observedAt:new Date().toISOString(),
    quote,marketMicrostructure:{
      bestBid,bestAsk,topOfBookSpreadBps,venueMidDispersionBps,
      bookImbalance: totalBid+totalAsk>0 ?
        round((totalBid-totalAsk)/(totalBid+totalAsk),4) : null,
      totalDisplayedBidDepthUsd:round(totalBid,2),
      totalDisplayedAskDepthUsd:round(totalAsk,2),
      maximumVenueFillSharePct:biggestVenue===null?null:round(biggestVenue*100,2),
      venues:venueStats
    },
    flags,
    availability: quote.status === "normal" && !flags.includes("CROSSED_INTERVENUE_SNAPSHOT") ?
      "indicative" : "degraded",
    methodology:"Resting L2 snapshot, venue-specific spread and orderbook imbalance; theoretical size-weighted multi-venue book walk.",
    disclaimer:"Descriptive microstructure heuristics, not an AI forecast, risk rating, trade recommendation, guaranteed execution price or regulated benchmark. Venue access, order speed, trading fees and market impact are excluded."
  };
}
