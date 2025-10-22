import type { VercelRequest, VercelResponse } from "vercel";
import { detectState } from "../lib/state";

type Burst = { kind: "ACK"|"PROBE"; text: string; delay_ms: number; wait_for_user: boolean };

function classifyIntent(msg:string){
  const s=(msg||"").toLowerCase();
  const info = /\b(what|how|why|where|when|which|explain|show|help me understand)\b/.test(s);
  const action = /\b(start|do|make|write|create|fix|schedule|build|send)\b/.test(s) || /\b(let's|i'll|i will)\b/.test(s);
  const support = /\b(tired|overwhelmed|stuck|anxious|nervous|drained|fried|heavy)\b/.test(s);
  const intent = support ? "support" : action ? "action" : "info";
  const conf = support?0.7:action?0.6:0.55;
  const register = /\b(please|would you|could you)\b/.test(s) ? "formal" : "casual";
  const echo = (msg||"").trim().slice(0, 48);
  return { intent, confidence: conf, register, echo };
}

function ackLine(reg:"casual"|"formal", echo:string){
  if (reg==="formal") return `Understood. "${echo}".`;
  return `Got you. "${echo}".`;
}
function probe(intent:"info"|"action"|"support", reg:"casual"|"formal"){
  const f=(a:string,b:string)=> reg==="formal"?a:b;
  if (intent==="info")   return f("Brief overview or step-by-step?", "Quick overview or step-by-step?");
  if (intent==="action") return f("5-minute plan or one next step?", "5-minute plan or one step?");
  return f("One breath or name the hardest part?", "One breath or name the hardest part?");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method!=="POST") return res.status(405).send("Use POST");
  const { message="" } = req.body || {};
  const state = detectState(String(message||""));
  const { intent, confidence, register, echo } = classifyIntent(String(message||""));

  const bursts: Burst[] = [
    { kind:"ACK",   text: ackLine(register as any, echo), delay_ms: 0,   wait_for_user:false },
    { kind:"PROBE", text: probe(intent as any, register as any), delay_ms: 500, wait_for_user:true }
  ];

  return res.status(200).json({
    ok:true,
    result:{ bursts, intent_guess:intent, confidence },
    state
  });
}
