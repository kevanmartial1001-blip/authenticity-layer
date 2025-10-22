export function extraSignals(message:string): Partial<{
  reflection_depth:number; agency_signal:number; negativity_ratio:number; specificity:number; time_focus:string;
}> {
  const m = (message||"");
  const q = (m.match(/\?/g)||[]).length;
  const commas = (m.match(/, /g)||[]).length;
  const clauses = Math.min(1, (q + commas)/5);
  const reflection_depth = clauses;

  const agency_signal = /\b(i can|i will|i'll|let me|i'm going to)\b/i.test(m) ? 0.8 :
                        /\b(you should|can you just|please do)\b/i.test(m) ? 0.2 : 0.5;

  const negativity_ratio = /\b(can't|won't|never|fail|useless|tired)\b/i.test(m) ? 0.6 : 0.2;

  const specificity = /\b(\d+|monday|tuesday|jan|feb|project|report|chapter)\b/i.test(m) ? 0.7 : 0.4;

  const time_focus = /\b(yesterday|last|ago)\b/i.test(m) ? "past" :
                     /\b(tomorrow|next|plan)\b/i.test(m) ? "future" : "present";

  return { reflection_depth, agency_signal, negativity_ratio, specificity, time_focus };
}
