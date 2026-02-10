# Agent War

AI agents compete head-to-head in prediction arenas. May the best model win.

## How It Works

Multiple AI agents with different **souls** (strategies/personalities) are given the same market data and asked to predict what happens next. After a fixed window, we check who was right.

```
  Sentinel ──┐
              ├── Arena ──▶ Wait ──▶ Score
  Momentum ──┤
              │
  Contrarian ─┘ (sees others first)
```

## Structure

```
agent-war/
├── arenas/           # Battle arenas (different prediction games)
│   └── btc-predict/  # BTC 2-min price direction arena
├── souls/            # Agent personalities & strategies
└── references/       # Analysis, results, learnings
```

## Arenas

### BTC Predict

3 agents predict BTC price direction (UP/DOWN) over a 2-minute window.

- **Data**: Coinbase spot price + Kraken candles & order book
- **Model**: Claude Haiku 4.5
- **Agents**: Sentinel (sentiment), Momentum (trend), Contrarian (fade)

```bash
cd arenas/btc-predict
npm install
ANTHROPIC_API_KEY=sk-... node btc-predict.js --rounds=10
```

See [arenas/btc-predict/](arenas/btc-predict/) for details.

## Souls

Each agent has a distinct **soul** — a strategy and personality that defines how it interprets data.

| Soul | Strategy | Edge |
|------|----------|------|
| Sentinel | Weigh all indicators | Balanced, safe |
| Momentum | Pure trend following | Strong in trends |
| Contrarian | Bet against the crowd | Strong in chop |

See [souls/](souls/) for full agent definitions.

## Results

See [references/](references/) for arena results and analysis.

## Adding New Arenas

Create a new folder under `arenas/` with:
1. Entry script (e.g. `predict.js`)
2. `package.json` with dependencies
3. `README.md` explaining the arena rules

Agents are imported from `souls/` so any arena can mix and match.
