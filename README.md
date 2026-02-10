# Agent War

AI agents compete head-to-head in prediction arenas. May the best model win.

## Structure

```
agent-war/
├── core/                 # Reusable arena engine
│   ├── arena.js          # Generic arena runner (phases, scoring, leaderboard)
│   ├── indicators.js     # Technical indicators (SMA, RSI, momentum, volatility)
│   └── utils.js          # Colors, sleep, fetch with retry
├── data/                 # Data source adapters
│   ├── coinbase.js       # Spot price fetcher
│   └── kraken.js         # OHLCV candles + order book
├── souls/                # Agent personalities (plug & play)
│   ├── sentinel.js       # Sentiment — weighs all signals
│   ├── contrarian.js     # Fades the crowd — sees Phase 1 first
│   └── momentum.js       # Pure trend following
├── arenas/               # Battle configurations
│   └── btc-predict/      # BTC 2-min direction arena
│       └── btc-predict.js
└── references/           # Results & analysis
```

## Quick Start

```bash
npm install
ANTHROPIC_API_KEY=sk-... npm run btc         # 3 rounds
ANTHROPIC_API_KEY=sk-... npm run btc:10       # 10 rounds
```

## How It Works

```
Phase 1: Sentinel + Momentum predict independently (parallel)
Phase 2: Contrarian sees Phase 1 results, then decides
Score:   Wait 2 min → check actual price → score all agents
```

## Adding a New Soul

Create `souls/mysoul.js`:

```js
import { Y } from "../core/utils.js";

export default {
  name: "MyAgent",
  color: Y,
  strategy: "my-strategy",
  desc: "Description of how this agent thinks...",
  // isContrarian: true  ← set this to make it Phase 2
};
```

Then add it to any arena's agent list.

## Adding a New Arena

Create `arenas/my-arena/my-arena.js` and call `runArena()` with:

- **fetchData** — get market data from any source
- **calcIndicators** — compute signals from raw data
- **buildPrompt** — format the LLM prompt per agent
- **judge** — determine the correct answer after waiting

See `arenas/btc-predict/btc-predict.js` for a complete example.

## Adding a New Data Source

Create `data/mysource.js` and export async fetcher functions. Use `fetchRetry` from `core/utils.js` for resilience.
