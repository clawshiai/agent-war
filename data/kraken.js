import { fetchRetry } from "../core/utils.js";

const PAIRS = {
  "BTC-USD": "XXBTZUSD",
  "ETH-USD": "XETHZUSD",
};

function resolvePair(pair) {
  return PAIRS[pair] || pair;
}

export async function getCandles(pair = "BTC-USD", limit = 30, interval = 1) {
  const krakenPair = resolvePair(pair);
  const data = await fetchRetry(`https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=${interval}`);
  const raw = data.result?.[krakenPair] || [];
  return raw.slice(-limit).map((c) => ({
    time: new Date(c[0] * 1000).toISOString().slice(11, 19),
    open: parseFloat(c[1]), high: parseFloat(c[2]),
    low: parseFloat(c[3]), close: parseFloat(c[4]),
    volume: parseFloat(c[6]),
  }));
}

export async function getOrderBook(pair = "BTC-USD", depth = 15) {
  const krakenPair = resolvePair(pair);
  const data = await fetchRetry(`https://api.kraken.com/0/public/Depth?pair=${krakenPair}&count=${depth}`);
  const book = data.result?.[krakenPair];
  if (!book) return { bidVolume: "0", askVolume: "0", ratio: "50.0", spread: "0" };
  const bidVol = book.bids.reduce((s, b) => s + parseFloat(b[1]), 0);
  const askVol = book.asks.reduce((s, a) => s + parseFloat(a[1]), 0);
  return {
    bidVolume: bidVol.toFixed(3), askVolume: askVol.toFixed(3),
    ratio: (bidVol / (bidVol + askVol) * 100).toFixed(1),
    spread: (parseFloat(book.asks[0][0]) - parseFloat(book.bids[0][0])).toFixed(2),
  };
}
