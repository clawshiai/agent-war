import { G } from "../core/utils.js";

export default {
  name: "Sentinel",
  color: G,
  strategy: "sentiment",
  desc: "Weigh ALL indicators (SMA trend, RSI, momentum, volume, order book) to gauge overall market sentiment. Trust the majority of signals.",
};
