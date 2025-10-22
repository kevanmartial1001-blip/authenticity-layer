import { LatentState } from "./schema";

export function detectState(message: string): LatentState {
  const msg = message.trim();
  const len = msg.length;

  const hasExclaim = /!/.test(msg);
  const hasMaybe = /\bmaybe|might|perhaps\b/i.test(msg);
  const negSelf = /\b(i can't|i cannot|i'm not good|i give up|forget it)\b/i.test(msg);
  const tired = /\b(tired|exhausted|drained|burnt|burned)\b/i.test(msg);
  const excited = /\b(excited|let's go|can't wait|pumped)\b/i.test(msg);
  const questions = (msg.match(/\?/g) || []).length;

  // crude heuristics; we’ll learn later
  let momentum = 0.5;
  let confidence = 0.5;
  let fatigue = 0.3;
  let openness = 0.5;

  if (negSelf) { confidence -= 0.3; momentum -= 0.2; }
  if (tired) { fatigue += 0.4; momentum -= 0.1; }
  if (excited) { momentum += 0.3; confidence += 0.2; fatigue -= 0.1; }
  if (hasMaybe) { confidence -= 0.1; openness += 0.1; }
  if (hasExclaim) { momentum += 0.1; }
  if (questions > 0) { openness += 0.1; }

  // normalize + clamp
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    momentum: clamp(momentum),
    confidence: clamp(confidence),
    fatigue: clamp(fatigue),
    openness: clamp(openness)
  };
}
