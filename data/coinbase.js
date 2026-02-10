import { fetchRetry } from "../core/utils.js";

export async function getSpotPrice(pair = "BTC-USD") {
  const data = await fetchRetry(`https://api.coinbase.com/v2/prices/${pair}/spot`);
  return parseFloat(data.data.amount);
}
