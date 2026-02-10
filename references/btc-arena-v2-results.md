# BTC Arena V2 — 10 Round Results (Strategy Tweaks)

**Date:** Feb 10, 2026
**Model:** Claude Haiku 4.5
**BTC Range:** $70,140 — $70,350

## Changes from V1

- Added regime detection (STRONG_TREND / TRENDING / CHOPPY / RANGING / MIXED)
- Added FLAT option — agents can abstain when signals conflict
- Weighted majority voting — regime-aware weights
- Enhanced indicators: ATR, SMA slope, candle patterns
- Reweighted agent strategies (order book downweighted, candle patterns added)

## Leaderboard

| # | Agent | W/L | Rate |
|---|-------|-----|------|
| 1 | Contrarian | 5/10 | 50% |
| 1 | Momentum | 5/10 | 50% |
| 3 | Sentinel | 4/10 | 40% |
| 4 | Majority | 3/10 | 30% |

## The FLAT Problem

17 out of 30 predictions (57%) were FLAT. Agents became too cautious.

| Agent | UP | DOWN | FLAT |
|-------|----|------|------|
| Sentinel | 3 | 3 | 4 |
| Momentum | 1 | 2 | 7 |
| Contrarian | 2 | 1 | 7 |

## Verdict

V2 was worse than V1. Over-engineering hurt performance:
- Contrarian dropped 60% -> 50%
- Majority dropped 50% -> 30%
- FLAT option was a cop-out, not an edge

**Decision:** Reverted to V1. Simpler is better.
