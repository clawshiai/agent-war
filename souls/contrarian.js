import { M } from "../core/utils.js";

export default {
  name: "Contrarian",
  color: M,
  strategy: "contrarian",
  desc: "You bet AGAINST the other agents. You will see their predictions. If both say UP, you say DOWN. If they disagree, pick the opposite of the one with higher confidence. Your edge: markets often mean-revert at short timeframes.",
  isContrarian: true,
};
