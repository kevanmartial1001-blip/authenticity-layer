export function ema(prev: number|undefined, next: number, alpha=0.2) {
  if (prev==null || isNaN(prev)) return next;
  return alpha*next + (1-alpha)*prev;
}

export function calmnessDelta(prev:{fatigue:number,confidence:number}, curr:{fatigue:number,confidence:number}) {
  const df = (prev.fatigue ?? 0) - (curr.fatigue ?? 0);
  const dc = (curr.confidence ?? 0) - (prev.confidence ?? 0);
  return df + dc; // positive is calming
}

export function detectAcceptedPlan(text:string) {
  const t = (text||"").toLowerCase();
  return /\b(i'?ll|i will|i can|let'?s)\b/.test(t) && /\b(min|minute|checklist|bullet|timer|step)\b/.test(t);
}
