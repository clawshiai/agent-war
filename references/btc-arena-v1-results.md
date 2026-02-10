# BTC Arena V1 — 10 Round Results

**Date:** Feb 9, 2026
**Model:** Claude Haiku 4.5
**BTC Range:** $70,300 — $70,570

## Leaderboard

| # | Agent | W/L | Rate |
|---|-------|-----|------|
| 1 | Contrarian | 6/10 | 60% |
| 2 | Momentum | 5/10 | 50% |
| 2 | Majority | 5/10 | 50% |
| 4 | Sentinel | 4/10 | 40% |

## Key Findings

1. **Contrarian won** — market was mean-reverting in a tight range, perfect for fading
2. **Order book is noise** — buy pressure was >59% every single round, even when price dropped. Useless signal at 2-min timeframe
3. **Momentum got trapped** — SMA signals whipsawed in ranging market, leading to false trend calls
4. **Sentinel split the difference** — weighed all signals equally, ended up indecisive

## Lessons

- Short timeframe BTC moves are essentially random walk ($3-$50 on $70k)
- Contrarian edge is real in ranging markets but would get destroyed in trends
- Order book depth should be heavily discounted or ignored
- 10 rounds is too small for statistical significance
