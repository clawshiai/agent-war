#!/usr/bin/env node
/**
 * BTC 2-Minute Price Predictor — 3 Agent Arena (V1)
 * 3 agents with different strategies each make independent predictions,
 * wait 2 min, compare who got it right.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node orchestrator/btc-predict.js
 *   node orchestrator/btc-predict.js --rounds=5
 */

import Anthropic from "@anthropic-ai/sdk";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const MODEL = "claude-haiku-4-5-20251001";
const PREDICT_WINDOW_SEC = 120;
const args = process.argv.slice(2);
const MAX_ROUNDS = parseInt(args.find((a) => a.startsWith("--rounds="))?.split("=")[1] || "3");

const G = "\x1b[92m", R = "\x1b[91m", Y = "\x1b[93m", C = "\x1b[96m";
const D = "\x1b[90m", W = "\x1b[97m", B = "\x1b[1m", N = "\x1b[0m";
const M = "\x1b[95m"; // magenta

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      return await res.json();
    } catch {
      if (i === retries - 1) throw new Error(`Fetch failed: ${url.slice(0, 60)}`);
      await sleep(1500);
    }
  }
}

// ── Data Sources ──

async function getBTCPrice() {
  const data = await fetchRetry("https://api.coinbase.com/v2/prices/BTC-USD/spot");
  return parseFloat(data.data.amount);
}

async function getBTCCandles(limit = 30) {
  const data = await fetchRetry("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1");
  const raw = data.result?.XXBTZUSD || [];
  return raw.slice(-limit).map((c) => ({
    time: new Date(c[0] * 1000).toISOString().slice(11, 19),
    open: parseFloat(c[1]), high: parseFloat(c[2]),
    low: parseFloat(c[3]), close: parseFloat(c[4]),
    volume: parseFloat(c[6]),
  }));
}

async function getOrderBook() {
  const data = await fetchRetry("https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=15");
  const book = data.result?.XXBTZUSD;
  if (!book) return { bidVolume: "0", askVolume: "0", ratio: "50.0", spread: "0" };
  const bidVol = book.bids.reduce((s, b) => s + parseFloat(b[1]), 0);
  const askVol = book.asks.reduce((s, a) => s + parseFloat(a[1]), 0);
  return {
    bidVolume: bidVol.toFixed(3), askVolume: askVol.toFixed(3),
    ratio: (bidVol / (bidVol + askVol) * 100).toFixed(1),
    spread: (parseFloat(book.asks[0][0]) - parseFloat(book.bids[0][0])).toFixed(2),
  };
}

// ── Technical Indicators ──

function calcIndicators(candles, currentPrice) {
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

// ── 3 Agents ──

const AGENTS = [
  {
    name: "Sentinel",
    color: G,
    strategy: "sentiment",
    desc: "Weigh ALL indicators (SMA trend, RSI, momentum, volume, order book) to gauge overall market sentiment. Trust the majority of signals.",
  },
  {
    name: "Contrarian",
    color: M,
    strategy: "contrarian",
    desc: "You bet AGAINST the other agents. You will see their predictions. If both say UP, you say DOWN. If they disagree, pick the opposite of the one with higher confidence. Your edge: markets often mean-revert at short timeframes.",
    isContrarian: true,
  },
  {
    name: "Momentum",
    color: C,
    strategy: "momentum",
    desc: "Focus ONLY on momentum and trend. If SMA5 > SMA15 and momentum is positive, go UP. If SMA5 < SMA15 and momentum is negative, go DOWN. Ignore RSI and order book — pure trend following.",
  },
];

async function agentPredict(agent, indicators, orderBook, otherPredictions = null) {
  const client = new Anthropic({ apiKey: API_KEY });

  let extraContext = "";
  if (otherPredictions) {
    extraContext = `\nOTHER AGENTS' PREDICTIONS (you must go against these):
${otherPredictions.map((p) => `  ${p.name}: ${p.direction} (${p.confidence.toFixed(2)})`).join("\n")}\n`;
  }

  const prompt = `You are ${agent.name}, a BTC short-term trader.
Your strategy: ${agent.strategy} — ${agent.desc}

CURRENT BTC DATA:
  Price: $${indicators.price}
  SMA5: $${indicators.sma5} | SMA15: $${indicators.sma15} → ${indicators.smaSignal}
  RSI(14): ${indicators.rsi} → ${indicators.rsiSignal}
  Momentum (5min): ${indicators.momentum}%
  Volatility: $${indicators.volatility}
  Volume trend: ${indicators.volumeTrend}
  Order book: ${orderBook.ratio}% buy pressure, spread $${orderBook.spread}
${extraContext}
Using ONLY your ${agent.strategy} strategy, predict BTC price direction in the next 2 minutes.
Respond ONLY with JSON: { "direction": "UP"|"DOWN", "confidence": 0.0-1.0, "reasoning": "brief 1 sentence" }`;

  try {
    const res = await client.messages.create({
      model: MODEL, max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });
    const match = (res.content[0]?.text || "").match(/\{[\s\S]*?\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      return {
        direction: (p.direction || "UP").toUpperCase(),
        confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0)),
        reasoning: p.reasoning || "",
      };
    }
  } catch (err) {
    return { direction: "UP", confidence: 0, reasoning: `Error: ${err.message.slice(0, 50)}` };
  }
  return { direction: "UP", confidence: 0, reasoning: "Parse failed" };
}

// ── Countdown ──

async function countdown(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r  ${D}⏳ ${Math.floor(i / 60)}:${(i % 60).toString().padStart(2, "0")}${N}  `);
    await sleep(1000);
  }
  process.stdout.write("\r" + " ".repeat(30) + "\r");
}

// ── Round ──

async function runRound(round, scoreboard) {
  console.log(`\n  ${D}═══════════════════════════════════════════════${N}`);
  console.log(`  ${B}${W}Round ${round}/${MAX_ROUNDS}${N}  ${D}${new Date().toLocaleTimeString()}${N}`);
  console.log(`  ${D}═══════════════════════════════════════════════${N}`);

  // Fetch data
  console.log(`\n  ${D}Fetching BTC data...${N}`);
  let currentPrice, candles, orderBook;
  try {
    [currentPrice, candles, orderBook] = await Promise.all([
      getBTCPrice(), getBTCCandles(30), getOrderBook(),
    ]);
  } catch (err) {
    console.log(`  ${R}Data fetch failed: ${err.message.slice(0, 60)}${N}`);
    console.log(`  ${Y}Skipping round, retrying in 10s...${N}`);
    await sleep(10000);
    return "skip";
  }
  const ind = calcIndicators(candles, currentPrice);

  console.log(`  ${W}BTC:${N} ${B}$${currentPrice.toLocaleString()}${N}`);
  console.log(`  ${D}SMA:${N} ${ind.smaSignal === "BULLISH" ? G : R}${ind.smaSignal}${N} | ${D}RSI:${N} ${ind.rsi} | ${D}Mom:${N} ${parseFloat(ind.momentum) >= 0 ? G : R}${ind.momentum}%${N}`);
  console.log(`  ${D}Book:${N} ${orderBook.ratio}% buy | ${D}Vol:${N} ${ind.volumeTrend}`);

  // Phase 1: Sentinel & Momentum predict in parallel
  console.log(`\n  ${D}Phase 1: Sentinel & Momentum predicting...${N}`);
  const phase1Agents = AGENTS.filter((a) => !a.isContrarian);
  const phase1Results = await Promise.all(
    phase1Agents.map((agent) => agentPredict(agent, ind, orderBook))
  );

  const predictions = [];
  for (let i = 0; i < phase1Agents.length; i++) {
    const a = phase1Agents[i], p = phase1Results[i];
    predictions.push({ ...p, agentIndex: AGENTS.indexOf(a) });
    const dirColor = p.direction === "UP" ? G : R;
    console.log(`  ${a.color}${B}${a.name.padEnd(12)}${N} ${dirColor}${B}${p.direction.padEnd(5)}${N} ${D}(${p.confidence.toFixed(2)}) ${p.reasoning}${N}`);
  }

  // Phase 2: Contrarian sees phase 1 predictions and must go against
  console.log(`  ${D}Phase 2: Contrarian sees predictions, betting against...${N}`);
  const contrarianAgent = AGENTS.find((a) => a.isContrarian);
  const otherPreds = phase1Agents.map((a, i) => ({ name: a.name, ...phase1Results[i] }));
  const contrarianResult = await agentPredict(contrarianAgent, ind, orderBook, otherPreds);
  predictions.push({ ...contrarianResult, agentIndex: AGENTS.indexOf(contrarianAgent) });

  const dirColor = contrarianResult.direction === "UP" ? G : R;
  console.log(`  ${contrarianAgent.color}${B}${contrarianAgent.name.padEnd(12)}${N} ${dirColor}${B}${contrarianResult.direction.padEnd(5)}${N} ${D}(${contrarianResult.confidence.toFixed(2)}) ${contrarianResult.reasoning}${N}`);

  // Sort predictions back to agent order
  predictions.sort((a, b) => a.agentIndex - b.agentIndex);

  // Simple majority vote
  const votes = { UP: 0, DOWN: 0 };
  predictions.forEach((p) => { votes[p.direction] = (votes[p.direction] || 0) + 1; });
  const majority = votes.UP >= votes.DOWN ? "UP" : "DOWN";
  console.log(`\n  ${D}Majority:${N} ${majority === "UP" ? G : R}${B}${majority}${N} ${D}(${votes.UP} UP vs ${votes.DOWN} DOWN)${N}`);

  // Wait
  console.log();
  await countdown(PREDICT_WINDOW_SEC);

  // Result
  let exitPrice;
  try {
    exitPrice = await getBTCPrice();
  } catch {
    console.log(`  ${R}Exit price fetch failed, skipping result${N}`);
    return "skip";
  }
  const change = exitPrice - currentPrice;
  const changePct = (change / currentPrice) * 100;
  const actual = change > 0 ? "UP" : "DOWN";
  const actualColor = actual === "UP" ? G : R;

  console.log(`  ${D}───────────────── Result ─────────────────${N}`);
  console.log(`  ${D}Entry:${N} $${currentPrice.toLocaleString()} → ${D}Exit:${N} $${exitPrice.toLocaleString()}`);
  console.log(`  ${D}Change:${N} ${change >= 0 ? G + "+" : R}$${change.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(4)}%)${N}`);
  console.log(`  ${D}Actual:${N} ${actualColor}${B}${actual}${N}`);
  console.log();

  // Score each agent
  for (let i = 0; i < AGENTS.length; i++) {
    const a = AGENTS[i], p = predictions[i];
    const correct = p.direction === actual;
    scoreboard[a.name].total++;
    if (correct) scoreboard[a.name].wins++;
    const icon = correct ? `${G}✓` : `${R}✗`;
    console.log(`  ${icon}${N} ${a.color}${a.name.padEnd(12)}${N} predicted ${p.direction.padEnd(5)} ${correct ? G + "CORRECT" : R + "WRONG"}${N}`);
  }

  // Majority check
  const majCorrect = majority === actual;
  scoreboard._majority.total++;
  if (majCorrect) scoreboard._majority.wins++;
  console.log(`  ${majCorrect ? G + "✓" : R + "✗"}${N} ${Y}${"Majority".padEnd(12)}${N} predicted ${majority.padEnd(5)} ${majCorrect ? G + "CORRECT" : R + "WRONG"}${N}`);
}

// ── Main ──

console.log(`\n  ${D}────────────────────────────────────────────────${N}`);
console.log(`  ${B}${W}₿  BTC 2-Min Predictor — Agent Arena${N}`);
console.log(`  ${D}────────────────────────────────────────────────${N}`);
console.log(`  ${D}Model${N}    ${MODEL}`);
console.log(`  ${D}Data${N}     Coinbase + Kraken`);
console.log(`  ${D}Agents${N}   ${AGENTS.map((a) => `${a.color}${a.name}${N}`).join(" vs ")}`);
console.log(`  ${D}Rounds${N}   ${MAX_ROUNDS}`);

const scoreboard = {
  Sentinel: { wins: 0, total: 0 },
  Contrarian: { wins: 0, total: 0 },
  Momentum: { wins: 0, total: 0 },
  _majority: { wins: 0, total: 0 },
};

let completed = 0;
for (let i = 1; completed < MAX_ROUNDS; i++) {
  const result = await runRound(completed + 1, scoreboard);
  if (result !== "skip") completed++;
}

// ── Leaderboard ──

console.log(`\n  ${D}════════════════════════════════════════════════${N}`);
console.log(`  ${B}${W}Leaderboard${N}  ${D}after ${MAX_ROUNDS} rounds${N}`);
console.log(`  ${D}════════════════════════════════════════════════${N}`);

const board = Object.entries(scoreboard)
  .map(([name, s]) => ({ name: name.replace("_", ""), ...s, rate: s.total > 0 ? (s.wins / s.total * 100) : 0 }))
  .sort((a, b) => b.rate - a.rate || b.wins - a.wins);

const medals = ["🥇", "🥈", "🥉", "  "];
board.forEach((entry, i) => {
  const agent = AGENTS.find((a) => a.name === entry.name);
  const color = agent?.color || Y;
  const bar = "█".repeat(Math.round(entry.rate / 10)) + "░".repeat(10 - Math.round(entry.rate / 10));
  console.log(`  ${medals[i]} ${color}${B}${entry.name.padEnd(12)}${N} ${entry.wins}/${entry.total} ${D}${bar}${N} ${entry.rate >= 50 ? G : R}${entry.rate.toFixed(0)}%${N}`);
});

console.log(`\n  ${D}────────────────────────────────────────────────${N}\n`);
