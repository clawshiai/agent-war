export function calcIndicators(candles, currentPrice) {
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  const sma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const sma15 = closes.slice(-15).reduce((a, b) => a + b, 0) / Math.min(15, n);

  const period = Math.min(14, n - 1);
  let gains = 0, losses = 0;
  for (let i = n - period; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  const momentum = ((closes[n - 1] - closes[Math.max(0, n - 6)]) / closes[Math.max(0, n - 6)]) * 100;

  const last10 = closes.slice(-10);
  const mean = last10.reduce((a, b) => a + b, 0) / last10.length;
  const volatility = Math.sqrt(last10.reduce((s, c) => s + (c - mean) ** 2, 0) / last10.length);

  const volumes = candles.map((c) => c.volume);
  const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const olderVol = volumes.slice(-15, -5).reduce((a, b) => a + b, 0) / Math.max(1, volumes.length - 5);
  const volumeTrend = olderVol > 0 ? ((recentVol - olderVol) / olderVol * 100).toFixed(1) : "0";

  return {
    price: currentPrice,
    sma5: sma5.toFixed(2), sma15: sma15.toFixed(2),
    smaSignal: sma5 > sma15 ? "BULLISH" : "BEARISH",
    rsi: rsi.toFixed(1),
    rsiSignal: rsi > 70 ? "OVERBOUGHT" : rsi < 30 ? "OVERSOLD" : "NEUTRAL",
    momentum: momentum.toFixed(4),
    volatility: volatility.toFixed(2),
    volumeTrend: `${volumeTrend}%`,
  };
}
