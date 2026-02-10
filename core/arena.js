import Anthropic from "@anthropic-ai/sdk";
import { G, R, Y, D, W, B, N, sleep } from "./utils.js";

/**
 * Generic arena runner.
 * @param {object} opts
 * @param {string} opts.title - Arena display name
 * @param {string} opts.model - Claude model ID
 * @param {string} opts.apiKey - Anthropic API key
 * @param {number} opts.rounds - Number of rounds
 * @param {number} opts.windowSec - Prediction window in seconds
 * @param {Array} opts.agents - Array of soul objects
 * @param {Function} opts.fetchData - async () => { price, candles, orderBook, ... }
 * @param {Function} opts.calcIndicators - (data) => indicators object
 * @param {Function} opts.getExitPrice - async () => number
 * @param {Function} opts.formatData - (indicators, data) => string[] for display
 * @param {Function} opts.buildPrompt - (agent, indicators, data, otherPredictions?) => string
 * @param {Function} opts.judge - (entryPrice, exitPrice) => "UP"|"DOWN"
 */
export async function runArena(opts) {
  const {
    title, model, apiKey, rounds, windowSec,
    agents, fetchData, calcIndicators, getExitPrice,
    formatData, buildPrompt, judge,
  } = opts;

  const client = new Anthropic({ apiKey });

  // Header
  console.log(`\n  ${D}────────────────────────────────────────────────${N}`);
  console.log(`  ${B}${W}${title}${N}`);
  console.log(`  ${D}────────────────────────────────────────────────${N}`);
  console.log(`  ${D}Model${N}    ${model}`);
  console.log(`  ${D}Agents${N}   ${agents.map((a) => `${a.color}${a.name}${N}`).join(" vs ")}`);
  console.log(`  ${D}Rounds${N}   ${rounds}`);

  // Scoreboard
  const scoreboard = {};
  for (const a of agents) scoreboard[a.name] = { wins: 0, total: 0 };
  scoreboard._majority = { wins: 0, total: 0 };

  let completed = 0;
  while (completed < rounds) {
    const result = await runRound({
      round: completed + 1, rounds, client, model,
      agents, scoreboard, windowSec,
      fetchData, calcIndicators, getExitPrice,
      formatData, buildPrompt, judge,
    });
    if (result !== "skip") completed++;
  }

  // Leaderboard
  printLeaderboard(agents, scoreboard, rounds);
}

async function predict(client, model, prompt) {
  try {
    const res = await client.messages.create({
      model, max_tokens: 150,
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

async function countdown(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r  ${D}⏳ ${Math.floor(i / 60)}:${(i % 60).toString().padStart(2, "0")}${N}  `);
    await sleep(1000);
  }
  process.stdout.write("\r" + " ".repeat(30) + "\r");
}

async function runRound(opts) {
  const {
    round, rounds, client, model, agents, scoreboard, windowSec,
    fetchData, calcIndicators, getExitPrice,
    formatData, buildPrompt, judge,
  } = opts;

  console.log(`\n  ${D}═══════════════════════════════════════════════${N}`);
  console.log(`  ${B}${W}Round ${round}/${rounds}${N}  ${D}${new Date().toLocaleTimeString()}${N}`);
  console.log(`  ${D}═══════════════════════════════════════════════${N}`);

  // Fetch data
  console.log(`\n  ${D}Fetching data...${N}`);
  let data;
  try {
    data = await fetchData();
  } catch (err) {
    console.log(`  ${R}Data fetch failed: ${err.message.slice(0, 60)}${N}`);
    console.log(`  ${Y}Skipping round, retrying in 10s...${N}`);
    await sleep(10000);
    return "skip";
  }

  const indicators = calcIndicators(data);
  const entryPrice = data.price;

  // Display data
  for (const line of formatData(indicators, data)) console.log(`  ${line}`);

  // Phase 1: independent agents predict in parallel
  const phase1 = agents.filter((a) => !a.isContrarian);
  const phase2 = agents.filter((a) => a.isContrarian);

  console.log(`\n  ${D}Phase 1: ${phase1.map((a) => a.name).join(" & ")} predicting...${N}`);
  const phase1Prompts = phase1.map((a) => buildPrompt(a, indicators, data));
  const phase1Results = await Promise.all(phase1Prompts.map((p) => predict(client, model, p)));

  const predictions = [];
  for (let i = 0; i < phase1.length; i++) {
    const a = phase1[i], p = phase1Results[i];
    predictions.push({ ...p, agentIndex: agents.indexOf(a) });
    const dirColor = p.direction === "UP" ? G : R;
    console.log(`  ${a.color}${B}${a.name.padEnd(12)}${N} ${dirColor}${B}${p.direction.padEnd(5)}${N} ${D}(${p.confidence.toFixed(2)}) ${p.reasoning}${N}`);
  }

  // Phase 2: contrarian agents see phase 1
  if (phase2.length > 0) {
    const otherPreds = phase1.map((a, i) => ({ name: a.name, ...phase1Results[i] }));
    console.log(`  ${D}Phase 2: ${phase2.map((a) => a.name).join(" & ")} betting against...${N}`);

    for (const agent of phase2) {
      const prompt = buildPrompt(agent, indicators, data, otherPreds);
      const result = await predict(client, model, prompt);
      predictions.push({ ...result, agentIndex: agents.indexOf(agent) });
      const dirColor = result.direction === "UP" ? G : R;
      console.log(`  ${agent.color}${B}${agent.name.padEnd(12)}${N} ${dirColor}${B}${result.direction.padEnd(5)}${N} ${D}(${result.confidence.toFixed(2)}) ${result.reasoning}${N}`);
    }
  }

  // Sort back to agent order
  predictions.sort((a, b) => a.agentIndex - b.agentIndex);

  // Majority vote
  const votes = { UP: 0, DOWN: 0 };
  predictions.forEach((p) => { votes[p.direction] = (votes[p.direction] || 0) + 1; });
  const majority = votes.UP >= votes.DOWN ? "UP" : "DOWN";
  console.log(`\n  ${D}Majority:${N} ${majority === "UP" ? G : R}${B}${majority}${N} ${D}(${votes.UP} UP vs ${votes.DOWN} DOWN)${N}`);

  // Wait
  console.log();
  await countdown(windowSec);

  // Result
  let exitPrice;
  try {
    exitPrice = await getExitPrice();
  } catch {
    console.log(`  ${R}Exit price fetch failed, skipping result${N}`);
    return "skip";
  }

  const actual = judge(entryPrice, exitPrice);
  const change = exitPrice - entryPrice;
  const changePct = (change / entryPrice) * 100;
  const actualColor = actual === "UP" ? G : R;

  console.log(`  ${D}───────────────── Result ─────────────────${N}`);
  console.log(`  ${D}Entry:${N} $${entryPrice.toLocaleString()} → ${D}Exit:${N} $${exitPrice.toLocaleString()}`);
  console.log(`  ${D}Change:${N} ${change >= 0 ? G + "+" : R}$${change.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(4)}%)${N}`);
  console.log(`  ${D}Actual:${N} ${actualColor}${B}${actual}${N}`);
  console.log();

  // Score
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i], p = predictions[i];
    const correct = p.direction === actual;
    scoreboard[a.name].total++;
    if (correct) scoreboard[a.name].wins++;
    const icon = correct ? `${G}✓` : `${R}✗`;
    console.log(`  ${icon}${N} ${a.color}${a.name.padEnd(12)}${N} predicted ${p.direction.padEnd(5)} ${correct ? G + "CORRECT" : R + "WRONG"}${N}`);
  }

  const majCorrect = majority === actual;
  scoreboard._majority.total++;
  if (majCorrect) scoreboard._majority.wins++;
  console.log(`  ${majCorrect ? G + "✓" : R + "✗"}${N} ${Y}${"Majority".padEnd(12)}${N} predicted ${majority.padEnd(5)} ${majCorrect ? G + "CORRECT" : R + "WRONG"}${N}`);
}

function printLeaderboard(agents, scoreboard, rounds) {
  console.log(`\n  ${D}════════════════════════════════════════════════${N}`);
  console.log(`  ${B}${W}Leaderboard${N}  ${D}after ${rounds} rounds${N}`);
  console.log(`  ${D}════════════════════════════════════════════════${N}`);

  const board = Object.entries(scoreboard)
    .map(([name, s]) => ({ name: name.replace("_", ""), ...s, rate: s.total > 0 ? (s.wins / s.total * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins);

  const medals = ["🥇", "🥈", "🥉", "  "];
  board.forEach((entry, i) => {
    const agent = agents.find((a) => a.name === entry.name);
    const color = agent?.color || Y;
    const bar = "█".repeat(Math.round(entry.rate / 10)) + "░".repeat(10 - Math.round(entry.rate / 10));
    console.log(`  ${medals[i]} ${color}${B}${entry.name.padEnd(12)}${N} ${entry.wins}/${entry.total} ${D}${bar}${N} ${entry.rate >= 50 ? G : R}${entry.rate.toFixed(0)}%${N}`);
  });

  console.log(`\n  ${D}────────────────────────────────────────────────${N}\n`);
}
