import type { VercelRequest, VercelResponse } from "vercel";
import { detectState } from "../lib/state";
import { chooseMove } from "../lib/policy";

type Burst = { kind:"ACK"|"PROBE"|"DELIVER"|"FOLLOWUP"; text:string; delay_ms:number; wait_for_user:boolean; };
type ComposeOutput = { intent_guess:"info"|"action"|"support"; confidence:number; bursts:Burst[]; plan?:{on_user_yes?:string; on_user_no?:string;} };

function classifyIntent(msg:string): {intent:"info"|"action"|"support"; confidence:number; register:"casual"|"neutral"|"formal"; echo:string} {
  const m = (msg||"").trim();
  const low = m.toLowerCase();
  const echo = (m.match(/.{0,24}$/)?.[0] || m).slice(0,40); // a tiny echo
  const info = /\b(what|how|why|where|when|which|explain|show me|help me understand)\b/i.test(m);
  const action = /\b(do|make|start|send|draft|fix|build|write|create|begin|schedule|ship)\b/i.test(m) || /\b(i(?:'m| am| will|’ll)|let's|lets)\b/i.test(m);
  const support = /\b(tired|overwhelmed|stuck|anxious|nervous|burnt|sad|drained|fried)\b/i.test(m);
  const score = { info:+info, action:+action, support:+support };
  let intent:"info"|"action"|"support" = "info"; let conf=0.34;
  if (score.action >= score.info && score.action >= score.support) { intent="action"; conf=0.6; }
  if (score.info > score.action && score.info >= score.support) { intent="info"; conf=0.6; }
  if (score.support > score.action && score.support > score.info) { intent="support"; conf=0.7; }
  const register = /\b(please|would you mind|could you)\b/i.test(m) ? "formal"
                  : /[.!?]\s*[A-Z]/.test(m) ? "neutral" : "casual";
  return { intent, confidence:conf, register, echo: echo.replace(/\s+/g," ").trim() };
}

function ackLine(register:"casual"|"neutral"|"formal", echo:string, affectHint:string): string {
  const affect = affectHint ? `${affectHint}, ` : "";
  if (register==="formal") return `Understood. ${affect}"${echo}".`;
  if (register==="neutral") return `Got it. ${affect}"${echo}".`;
  return `Got you. ${affect}"${echo}".`;
}

function probe(intent:"info"|"action"|"support", register:"casual"|"neutral"|"formal"): string {
  const pick = (a:string,b:string)=> register==="formal" ? a : b;
  if (intent==="info")
    return pick("Do you prefer a brief overview or a step-by-step?", "Quick overview or step-by-step?");
  if (intent==="action")
    return pick("Would you like a 5-minute plan or one next step?", "5-minute plan or one step?");
  // support
  return pick("Would it help to pause for one breath or to name the hardest part?",
              "One breath or name the hardest part?");
}

function deliverSnippets(intent:"info"|"action"|"support", move:string, message:string): string[] {
  // very small, punchy atoms; 2–3 lines tops
  if (intent==="info") {
    return [
      "Here’s the gist in 3 lines.",
      "1) The core idea in one sentence.",
      "2) One example with a number.",
    ];
  }
  if (intent==="action") {
    return [
      "Let’s make a tiny start.",
      "A) timer 5 minutes. B) one bullet only.",
      "Which one?"
    ];
  }
  // support
  return [
    "Let’s keep this light.",
    "Two gentle options: A) 3 breaths. B) name the hardest bit.",
    "Want A or B?"
  ];
}

function genericGuard(s:string): string {
  // quick de-generic: ban a few phrases and force number/time if missing
  const banned = /(share more about|explore together|navigate this|what's on your mind|find a way forward|i hear you)/i;
  if (banned.test(s)) s = s.replace(banned, "").trim();
  if (!/\b(\d+ ?(min|minutes|hour|days?)|today|tomorrow)\b/i.test(s)) s += (s.endsWith("?")?"":" ") + "(5 min is fine.)";
  return s;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method!=="POST") return res.status(405).send("Use POST");
  const body = req.body || {};
  const msg = String(body.message||"");
  const lastProbeAnswer = String(body.last_probe_answer||"").trim();
  const userId = String(body.userId||"");
  const sessionId = String(body.sessionId||"");

  // Base signals if you want to log/choose move later
  const state = detectState(msg);
  const { intent, confidence, register, echo } = classifyIntent(msg);

  // If we already have a reply to a probe, deliver now in small chunks
  if (lastProbeAnswer) {
    const move = chooseMove(state).move;
    const chunks = deliverSnippets(intent, move, lastProbeAnswer).map(genericGuard);
    const bursts: Burst[] = chunks.map((text, i)=>({
      kind: i<chunks.length-1 ? "DELIVER" : "FOLLOWUP",
      text, delay_ms: i===0? 200: 500, wait_for_user: i===chunks.length-1 // after last chunk, wait for user
    }));
    const payload: ComposeOutput = { intent_guess:intent, confidence, bursts, plan: { on_user_yes:"continue", on_user_no:"adjust" } };
    return res.status(200).json({ ok:true, result: payload });
  }

  // First contact: ACK + PROBE, then stop
  const ack = ackLine(register, echo, confidence<0.5?"":"");
  const pr = probe(intent, register);
  const bursts: Burst[] = [
    { kind:"ACK",   text: genericGuard(ack), delay_ms: 0,   wait_for_user:false },
    { kind:"PROBE", text: genericGuard(pr),  delay_ms: 500, wait_for_user:true  },
  ];
  const payload: ComposeOutput = { intent_guess:intent, confidence, bursts };
  return res.status(200).json({ ok:true, result: payload, state });
}
