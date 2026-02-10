import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "index.html"), "utf-8");

export const emitter = new EventEmitter();
const clients = new Set();
const lastState = {};

// Accumulate state for late-joining viewers
emitter.onAny = null; // we'll use a wildcard approach below
const originalEmit = emitter.emit.bind(emitter);
emitter.emit = (name, data) => {
  if (name === "round:start") {
    // Reset per-round state
    delete lastState["round:data"];
    delete lastState["round:phase1"];
    delete lastState["round:phase2"];
    delete lastState["round:majority"];
    delete lastState["round:countdown"];
    delete lastState["round:tick"];
    delete lastState["round:result"];
    delete lastState["round:scores"];
  }
  lastState[name] = data;
  broadcast(name, data);
  return originalEmit(name, data);
};

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.write(msg); } catch { clients.delete(client); }
  }
}

const server = createServer((req, res) => {
  if (req.url === "/events" || req.url === "/events/") {
    // SSE endpoint
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });

    // Send current state snapshot
    res.write(`event: state\ndata: ${JSON.stringify(lastState)}\n\n`);
    clients.add(res);

    // Heartbeat
    const hb = setInterval(() => {
      try { res.write(":\n\n"); } catch { clearInterval(hb); clients.delete(res); }
    }, 15000);

    req.on("close", () => { clearInterval(hb); clients.delete(res); });
    return;
  }

  // Serve index.html for everything else
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

export function startServer(port = 3789) {
  server.listen(port, () => {
    console.log(`  Arena spectator: http://localhost:${port}`);
  });
}
