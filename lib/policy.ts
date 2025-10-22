import { EmpathyMove, LatentState } from "./schema";

type Policies = Partial<{
  ack_confidence_max: number;          // default 0.35
  reflect_fatigue_min: number;         // default 0.70
  challenge_momentum_min: number;      // default 0.70
  challenge_confidence_min: number;    // default 0.60
  coplan_openness_min: number;         // default 0.60
  coplan_confidence_min: number;       // default 0.45
  motivate_momentum_max: number;       // default 0.40
  motivate_confidence_max: number;     // default 0.50
  clarify_default_max_words: number;   // default 50
}>;

export function chooseMove(
  state: LatentState,
  policies?: Policies
): { move: EmpathyMove; rationale: string; constraints:{max_words:number} } {
  const { momentum, confidence, fatigue, openness } = state;

  const P = {
    ack_confidence_max: policies?.ack_confidence_max ?? 0.35,
    reflect_fatigue_min: policies?.reflect_fatigue_min ?? 0.70,
    challenge_momentum_min: policies?.challenge_momentum_min ?? 0.70,
    challenge_confidence_min: policies?.challenge_confidence_min ?? 0.60,
    coplan_openness_min: policies?.coplan_openness_min ?? 0.60,
    coplan_confidence_min: policies?.coplan_confidence_min ?? 0.45,
    motivate_momentum_max: policies?.motivate_momentum_max ?? 0.40,
    motivate_confidence_max: policies?.motivate_confidence_max ?? 0.50,
    clarify_default_max_words: policies?.clarify_default_max_words ?? 50,
  };

  if (fatigue > P.reflect_fatigue_min)
    return { move: "REFLECT", rationale: "High fatigue → slow down, hold space.", constraints:{ max_words: 60 } };

  if (confidence < P.ack_confidence_max && openness >= 0.4)
    return { move: "ACKNOWLEDGE", rationale: "Low confidence + open → validate first.", constraints:{ max_words: 80 } };

  if (momentum > P.challenge_momentum_min && confidence > P.challenge_confidence_min)
    return { move: "CHALLENGE", rationale: "High energy → push a tiny stretch goal.", constraints:{ max_words: 80 } };

  if (openness > P.coplan_openness_min && confidence >= P.coplan_confidence_min)
    return { move: "CO_PLAN", rationale: "Open and stable → plan next step together.", constraints:{ max_words: 90 } };

  if (momentum < P.motivate_momentum_max && confidence < P.motivate_confidence_max)
    return { move: "MOTIVATE", rationale: "Low drive → recall why + suggest tiny win.", constraints:{ max_words: 80 } };

  return { move: "CLARIFY", rationale: "Ambiguous state → ask one precise question.", constraints:{ max_words: P.clarify_default_max_words } };
}
