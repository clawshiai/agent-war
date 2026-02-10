#!/usr/bin/env node
/**
 * BTC 2-Minute Predictor — Web Spectator Mode
 *
 * Runs the arena continuously with a live web UI at http://localhost:3789
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node arenas/btc-predict/btc-predict-web.js
 */

import { runArena } from "../../core/arena.js";
import { calcIndicators } from "../../core/indicators.js";
import { G, R, D, W, N } from "../../core/utils.js";
import { getSpotPrice } from "../../data/coinbase.js";
import { getCandles, getOrderBook } from "../../data/kraken.js";
import { startServer, emitter } from "../../web/server.js";

import sentinel from "../../souls/sentinel.js";
import contrarian from "../../souls/contrarian.js";
import momentum from "../../souls/momentum.js";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const args = process.argv.slice(2);
const MAX_ROUNDS = parseInt(args.find((a) => a.startsWith("--rounds="))?.split("=")[1] || "9999");

// Start web server first
startServer(3789);

runArena({
  title: "₿  BTC 2-Min Predictor — Agent Arena",
  model: "claude-haiku-4-5-20251001",
  apiKey: API_KEY,
  rounds: MAX_ROUNDS,
  windowSec: 120,
  agents: [sentinel, contrarian, momentum],
  emitter,

  async fetchData() {
    const [price, candles, orderBook] = await Promise.all([
      getSpotPrice("BTC-USD"),
      getCandles("BTC-USD", 30),
      getOrderBook("BTC-USD"),
    ]);
    return { price, candles, orderBook };
  },

  calcIndicators(data) {
    return { ...calcIndicators(data.candles, data.price), orderBook: data.orderBook };
  },

  async getExitPrice() {
    return getSpotPrice("BTC-USD");
  },

  formatData(ind) {
    return [
      `${W}BTC:${N} \x1b[1m$${ind.price.toLocaleString()}${N}`,
      `${D}SMA:${N} ${ind.smaSignal === "BULLISH" ? G : R}${ind.smaSignal}${N} | ${D}RSI:${N} ${ind.rsi} | ${D}Mom:${N} ${parseFloat(ind.momentum) >= 0 ? G : R}${ind.momentum}%${N}`,
      `${D}Book:${N} ${ind.orderBook.ratio}% buy | ${D}Vol:${N} ${ind.volumeTrend}`,
    ];
  },

  buildPrompt(agent, ind, data, otherPredictions) {
    let extraContext = "";
    if (otherPredictions) {
      extraContext = `\nOTHER AGENTS' PREDICTIONS (you must go against these):
${otherPredictions.map((p) => `  ${p.name}: ${p.direction} (${p.confidence.toFixed(2)})`).join("\n")}\n`;
    }

    return `You are ${agent.name}, a BTC short-term trader.
Your strategy: ${agent.strategy} — ${agent.desc}

CURRENT BTC DATA:
  Price: $${ind.price}
  SMA5: $${ind.sma5} | SMA15: $${ind.sma15} → ${ind.smaSignal}
  RSI(14): ${ind.rsi} → ${ind.rsiSignal}
  Momentum (5min): ${ind.momentum}%
  Volatility: $${ind.volatility}
  Volume trend: ${ind.volumeTrend}
  Order book: ${ind.orderBook.ratio}% buy pressure, spread $${ind.orderBook.spread}
${extraContext}
Using ONLY your ${agent.strategy} strategy, predict BTC price direction in the next 2 minutes.
Respond ONLY with JSON: { "direction": "UP"|"DOWN", "confidence": 0.0-1.0, "reasoning": "brief 1 sentence" }`;
  },

  judge(entry, exit) {
    return exit > entry ? "UP" : "DOWN";
  },
});
