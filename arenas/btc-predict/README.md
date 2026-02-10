# BTC Predict Arena

3 AI agents predict BTC price direction over a 2-minute window.

## Setup

```bash
npm install
```

## Run

```bash
ANTHROPIC_API_KEY=sk-... node btc-predict.js --rounds=10
```

## Data Sources

| Source | Data | API |
|--------|------|-----|
| Coinbase | Spot price (entry/exit) | `/v2/prices/BTC-USD/spot` |
| Kraken | 1-min OHLCV candles (30) | `/0/public/OHLC?pair=XBTUSD` |
| Kraken | Order book depth (15 levels) | `/0/public/Depth?pair=XBTUSD` |

## Technical Indicators

- **SMA5 / SMA15** — Short vs medium moving average crossover
- **RSI(14)** — Relative Strength Index
- **Momentum** — 5-candle rate of change
- **Volatility** — Standard deviation of last 10 closes
- **Volume trend** — Recent vs older volume comparison
- **Order book** — Bid/ask volume ratio + spread

## Scoring

- Each agent predicts UP or DOWN
- After 2 minutes, actual direction is checked
- Correct prediction = 1 point
- Majority vote is also scored separately

## Model

Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — fast and cheap for rapid-fire predictions.
