export const G = "\x1b[92m", R = "\x1b[91m", Y = "\x1b[93m", C = "\x1b[96m";
export const D = "\x1b[90m", W = "\x1b[97m", B = "\x1b[1m", N = "\x1b[0m";
export const M = "\x1b[95m";

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function fetchRetry(url, retries = 3) {
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
