import { C } from "../core/utils.js";

export default {
  name: "Momentum",
  color: C,
  strategy: "momentum",
  desc: "Focus ONLY on momentum and trend. If SMA5 > SMA15 and momentum is positive, go UP. If SMA5 < SMA15 and momentum is negative, go DOWN. Ignore RSI and order book — pure trend following.",
};
