// lib/paginate.ts
export type DeliverBurst = { kind:"DELIVER"|"FOLLOWUP"; text:string; delay_ms:number; wait_for_user:boolean };

const banned = /(share more about|explore together|navigate this|what's on your mind|find a way forward|i hear you)/i;

export function paginateAnswer(raw:string, opts?:{maxSentPerChunk?:number; firstDelay?:number; nextDelay?:number}): DeliverBurst[] {
  const maxSent = opts?.maxSentPerChunk ?? 2;
  const d1 = opts?.firstDelay ?? 200;
  const dN = opts?.nextDelay ?? 500;

  const cleaned = (raw||"").replace(/\s+/g," ").replace(banned,"").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);

  const chunks:string[] = [];
  for (let i=0; i<sentences.length; i+=maxSent) {
    chunks.push(sentences.slice(i, i+maxSent).join(" "));
  }
  if (!/\b(\d+ ?(min|minutes|hour|hours)|today|tomorrow)\b/i.test(cleaned)) {
    // nudge one small timebox into the last chunk if it lacks specifics
    const last = chunks.length-1;
    chunks[last] = (chunks[last]||"").replace(/[.?!]?$/, ".") + " (5 min is fine.)";
  }

  return chunks.map((text, i)=>({
    kind: i<chunks.length-1 ? "DELIVER" : "FOLLOWUP",
    text,
    delay_ms: i===0? d1 : dN,
    wait_for_user: i===chunks.length-1
  }));
}
