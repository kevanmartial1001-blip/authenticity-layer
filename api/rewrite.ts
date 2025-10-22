import type { VercelRequest, VercelResponse } from "vercel";
import { RewriteInput } from "../lib/schema";

// NEW: metrics helpers
import { calmnessDelta, detectAcceptedPlan } from "../lib/metrics";

const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL!;
const API_KEY = process.env.SHEETS_API_KEY || "";

async function postToSheets(op: string, payload: Record<string, any>) {
  if (!SHEETS_URL) return;
  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, apiKey: API_KEY, ...payload }),
    });
  } catch { /* non-blocking */ }
}

function mergeDNA(base: any = {}, override: any = {}) {
  return {
    ...(base || {}),
    ...(override || {}),
    style: { ...(base?.style || {}), ...(override?.style || {}) },
    tone:  { ...(base?.tone  || {}), ...(override?.tone  || {}) },
    lexicon: { ...(base?.lexicon || {}), ...(override?.lexicon || {}) },
  };
}

async function fetchProfileDNA(userId: string): Promise<any> {
  if (!userId || !SHEETS_URL) return {};
  try {
    const r = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "getProfile", userId, apiKey: API_KEY })
    });
    const j = await r.json();
    return j?.ok ? (j.profile || {}) : {};
  } catch { return {}; }
}

function templateRender(input: RewriteInput): string {
  const { move, dna } = input;
  const short = dna?.style?.sentences === "short";
  const s = (t: string) => short ? t.replace(/, /g, ". ").replace(/; /g, ". ") : t;
  switch (move) {
    case "ACKNOWLEDGE": return s(`I hear you. That’s tough. Want me to make this easier with one small step now?`);
    case "REFLECT":     return s(`Sounds like today’s been heavy. Do you want to pause and name the hardest part, or just take a breath together first?`);
    case "CHALLENGE":   return s(`You’ve got momentum. Pick one tiny stretch now: 5 minutes or one bullet point. Which one?`);
    case "MOTIVATE":    return s(`You’ve shown up before, you can do it again. How about a quick win we can finish in 3 minutes, then reassess?`);
    case "CO_PLAN":     return s(`Let’s plan this together. Two options: A) timer for 10 minutes, B) step-by-step checklist. What feels doable?`);
    case "CELEBRATE":   return s(`Nice move. That’s progress. Want a snapshot of what improved, or jump to the next tiny step?`);
    case "CLARIFY":
    default:            return s(`Got it. What’s the one outcome you want from this in the next 10 minutes?`);
  }
}

const SYSTEM = `You render short, human, emotionally intelligent replies.
Rules:
- Preserve intent of the selected empathy move.
- Match tone weights from DNA (warmth/directness/etc.).
- Keep it concrete, no fluff. Avoid exclamations if boundary set.
- Respect MAX_WORDS if provided.`;

async function llmRender(body: RewriteInput, maxWords = 90): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return templateRender(body);

  const msg = `
MOVE: ${body.move}
STATE: ${JSON.stringify(body.state)}
CHANNEL: ${body.channel}
GOAL: ${body.goal || "be helpful and kind"}
CONTEXT: ${body.context || ""}
DNA: ${JSON.stringify(body.dna)}
MAX_WORDS: ${maxWords}
Return only the final reply text.`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: msg }
      ]
    })
  });

  if (!r.ok) return templateRender(body);
  const data = await r.json();
  return (data?.choices?.[0]?.message?.content || "").trim() || templateRender(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Use POST");
  try {
    const body = req.body as RewriteInput;
    if (!body?.move || !body?.channel || !body?.state) {
      return res.status(400).json({ error: "move, channel, state required" });
    }

    // 1) Load per-user Voice DNA if userId present; merge with provided dna
    let mergedDNA = body.dna || {};
    const userId = (body as any).userId || "";
    const sessionId = (body as any).sessionId || "";
    if (userId) {
      const prof = await fetchProfileDNA(userId);
      mergedDNA = mergeDNA(prof, mergedDNA);
    }
    body.dna = mergedDNA;

    // 2) Render (LLM or template)
    const max = (body as any)?.constraints?.max_words ?? 90;
    const outText = await llmRender(body, max);
    const mode = process.env.OPENAI_API_KEY ? "llm" : "template";

    // 3) Logs history
    postToSheets("log", {
      userId, sessionId,
      input: "",
      state: body.state,
      move: body.move,
      output: outText,
      meta: { channel: body.channel, source: "rewrite", mode }
    });

    // 4) Update Latest snapshot
    postToSheets("upsertLatest", {
      userId, sessionId,
      input: "",
      output: outText,
      move: body.move,
      state: body.state
    });

    // 5) User Progress (user-facing journey metrics)
    // NOTE: for MVP, we don't have prev turn state → calmness_delta≈0; if you pass prev_state, calmnessDelta will reflect it.
    const calm_delta = calmnessDelta(body.state as any, body.state as any); // MVP: 0
    const accepted = detectAcceptedPlan(outText);

    postToSheets("userProgress", {
      ts: new Date().toISOString(),
      userId, sessionId,
      goals_snapshot: JSON.stringify([]),
      momentum_score: (body.state as any).momentum ?? 0.5,
      calmness_delta: calm_delta,
      agency_score: (body.state as any).agency_signal ?? 0.5,
      reflection_depth: (body.state as any).reflection_depth ?? 0.5,
      accepted_plan: accepted,
      milestone: ""
    });

    // 6) Telemetry update (company view)
    postToSheets("telemetryUpdate", {
      ts: new Date().toISOString(),
      userId, sessionId,
      personalization_ratio: (Object.keys((body as any).dna || {}).length ? 0.6 : 0.2)
    });

    return res.status(200).json({ ok: true, output: outText, mode, dnaUsed: mergedDNA });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message || "internal error" });
  }
}
