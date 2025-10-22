import { EmpathyMove, LatentState } from "./schema";

export function chooseMove(state: LatentState): { move: EmpathyMove; rationale: string; constraints:{max_words:number} } {
  const { momentum, confidence, fatigue, openness } = state;

  // simple v0 policy rules
  if (fatigue > 0.7) return { move: "REFLECT", rationale: "High fatigue → slow down, hold space.", constraints:{max_words:60} };
  if (confidence < 0.35 && openness >= 0.4) return { move: "ACKNOWLEDGE", rationale: "Low confidence + open → validate first.", constraints:{max_words:80} };
  if (momentum > 0.7 && confidence > 0.6) return { move: "CHALLENGE", rationale: "High energy → push a tiny stretch goal.", constraints:{max_words:80} };
  if (openness > 0.6 && confidence >= 0.45) return { move: "CO_PLAN", rationale: "Open and stable → plan next step together.", constraints:{max_words:90} };
  if (momentum < 0.4 && confidence < 0.5) return { move: "MOTIVATE", rationale: "Low drive → recall why + suggest tiny win.", constraints:{max_words:80} };
  return { move: "CLARIFY", rationale: "Ambiguous state → ask one precise question.", constraints:{max_words:50} };
}
