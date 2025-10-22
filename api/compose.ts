import type { VercelRequest, VercelResponse } from "vercel";
import { detectState } from "../lib/state";
import { chooseMove } from "../lib/policy";

// --- Sheets plumbing ---
const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL || "";
const API_KEY = process.env.SHEETS_API_KEY || "";
async function postToSheets(op: string, payload: Record<string, any>) {
  if (!SHEETS_URL) return;
  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ op, apiKey: API_KEY, ...payload }),
      cache: "no-store",
    });
  } catch { /* non-blocking */ }
}

// ------- Types -------
type BurstKind = "ACK" | "PROBE" | "DELIVER" | "FOLLOWUP";
type Burst = { kind:BurstKind; text:string; delay_ms:number; wait_for_user:boolean; };
type ComposeOutput = {
  intent_guess: "info" | "action" | "support";
  confidence: number;
  bursts: Burst[];
  plan?: { on_user_yes?: string; on_user_no?: string };
  echo?: { input: string; last_probe_answer?: string }; // NEW: echo back
  debug?: any; // optional, gated by body.debug
};

// ------- Intent guesser (cheap + deterministic) -------
function classifyIntent(msg:string): {
  intent: "info"|"action"|"support";
  confidence: number;
  register: "casual"|"neutral"|"formal";
  echo: string;
} {
  const m = (msg || "").trim();
  const echo = (m.match(/.{0,48}$/)?.[0] || m).slice(0, 48).replace(/\s+/g, " ").trim();

  const info = /\b(what|how|why|where|when|which|explain|show me|help me understand)\b/i.test(m);
  const action = /\b(do|make|start|send|draft|fix|build|write|create|begin|schedule|ship)\b/i.test(m)
              || /\b(i(?:'m| am| will|’ll)|let's|lets)\b/i.test(m);
  const support = /\b(tired|overwhelmed|stuck|anxious|nervous|burnt|sad|drained|fried|heavy)\b/i.test(m);

  let intent:"info"|"action"|"support" = "info"; let conf = 0.34;
  if (action >= info && action >= support) { intent = "action"; conf = 0.6; }
  if (info > action && info >= support)   { intent = "info"; conf = 0.6; }
  if (support > action && support > info) { intent = "support"; conf = 0.7; }

  const register =
    /\b(please|would you mind|could you)\b/i.test(m) ? "formal" :
    /[.!?]\s*[A-Z]/.test(m) ? "neutral" : "casual";

  return { intent, confidence: conf, register, echo };
}

// ------- Lines (ACK / PROBE / DELIVER) -------
function ackLine(register:"casual"|"neutral"|"formal", echo:string): string {
  if (register === "formal")  return `Understood. "${echo}".`;
  if (register === "neutral") return `Got it. "${echo}".`;
  return `Got you. "${echo}".`;
}

function probe(intent:"info"|"action"|"support", register:"casual"|"neutral"|"formal"): string {
  const formal = (a:string,b:string)=> register==="formal" ? a : b;
  if (intent === "info")
    return formal("Do you prefer a brief overview or a step-by-step?",
                  "Quick overview or step-by-step?");
  if (intent === "action")
    return formal("Would you like a 5-minute plan or one next step?",
                  "5-minute plan or one step?");
  return formal("Would it help to pause for one breath or to name the hardest part?",
                "One breath or name the hardest part?");
}

function deliverSnippets(intent:"info"|"action"|"support", move:string, userReply:string): string[] {
  if (intent === "info") {
    return [
      "Here’s the gist in 3 lines.",
      "1) The core idea in one sentence.",
      "2) One example with a number.",
      "Want a quick link or a deeper dive?"
    ];
  }
  if (intent === "action") {
    return [
      "Let’s make a tiny start.",
      "A) timer 5 minutes.  B) one bullet only.",
      "Which one?"
    ];
  }
  return [
    "Let’s keep this light.",
    "Two gentle options: A) 3 breaths.  B) name the hardest bit.",
    "Want A or B?"
  ];
}

// ------- Anti-generic quick pass -------
function deGeneric(s:string): string {
  const banned = /(share more about|explore together|navigate this|what's on your mind|find a way forward|i hear you)/i;
  let out = s.replace(banned, "").trim();
  if (!/\b(\d+\s?(min|minutes|hour|hours)|today|tomorrow)\b/i.test(out)) {
    out += (/[.?!]$/.test(out) ? "" : ".") + " (5 min is fine.)";
  }
  return out.replace(/\s+/g, " ").trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Use POST");

  const body = (req.body || {}) as {
    userId?:string; sessionId?:string;
    message?:string; last_probe_answer?:string;
    debug?: boolean;
  };

  const userId = String(body.userId || "");
  const sessionId = String(body.sessionId || "");
  const message = String(body.message || "");
  const lastAnswer = String(body.last_probe_answer || "").trim();
  const wantDebug = !!body.debug;

  // Base state/move (useful for debug & logs)
  const state = detectState(lastAnswer || message);
  const move = chooseMove(state).move;

  // If user answered the probe -> deliver small chunks
  if (lastAnswer) {
    const cls = classifyIntent(lastAnswer || message);
    const chunks = deliverSnippets(cls.intent, move, lastAnswer).map(deGeneric);
    const bursts: Burst[] = chunks.map((text, i) => ({
      kind: i < chunks.length - 1 ? "DELIVER" : "FOLLOWUP",
      text,
      delay_ms: i === 0 ? 200 : 500,
      wait_for_user: i === chunks.length - 1
    }));

    // --- Log (history + snapshot) ---
    postToSheets("log", {
      userId, sessionId,
      input: lastAnswer,
      state, move,
      output: bursts.map(b=>`[${b.kind}] ${b.text}`).join(" | "),
      meta: { channel:"chat", source:"compose", phase:"deliver" }
    });
    postToSheets("upsertLatest", {
      userId, sessionId,
      input: lastAnswer,
      output: bursts[bursts.length-1]?.text || "",
      move, state
    });

    const payload: ComposeOutput = {
      intent_guess: cls.intent, confidence: cls.confidence, bursts,
      plan: { on_user_yes:"continue", on_user_no:"adjust" },
      echo: { input: message, last_probe_answer: lastAnswer },
      debug: wantDebug ? { state, move, register: classifyIntent(lastAnswer).register } : undefined
    };
    return res.status(200).json({ ok: true, result: payload });
  }

  // First contact -> ACK then PROBE, then stop
  const { intent, confidence, register, echo } = classifyIntent(message);
  const ack = deGeneric(ackLine(register, echo));
  const pr = deGeneric(probe(intent, register));
  const bursts: Burst[] = [
    { kind:"ACK",   text: ack, delay_ms: 0,   wait_for_user:false },
    { kind:"PROBE", text: pr,  delay_ms: 500, wait_for_user:true  },
  ];

  // --- Log (history + snapshot) ---
  postToSheets("log", {
    userId, sessionId,
    input: message,
    state, move,
    output: bursts.map(b=>`[${b.kind}] ${b.text}`).join(" | "),
    meta: { channel:"chat", source:"compose", phase:"ack_probe", intent_guess:intent }
  });
  postToSheets("upsertLatest", {
    userId, sessionId,
    input: message,
    output: pr,
    move, state
  });

  const payload: ComposeOutput = {
    intent_guess: intent, confidence, bursts,
    echo: { input: message },
    debug: wantDebug ? { state, move, register } : undefined
  };
  return res.status(200).json({ ok: true, result: payload });
}
