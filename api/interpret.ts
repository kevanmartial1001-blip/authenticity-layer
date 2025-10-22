import type { VercelRequest, VercelResponse } from "vercel";
import { detectState } from "../lib/state";
import { chooseMove } from "../lib/policy";
import { InterpretInput, InterpretOutput } from "../lib/schema";

// NEW: RFE helpers
import { extraSignals } from "../lib/signal";
import { inferArchetype } from "../lib/personality";

// ---- Sheets plumbing ----
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

async function fetchPolicies(): Promise<Record<string, any>> {
  if (!SHEETS_URL) return {};
  try {
    const r = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "getPolicies", apiKey: API_KEY })
    });
    const j = await r.json();
    return j?.ok ? (j.policies || {}) : {};
  } catch {
    return {};
  }
}

function parseNumber(x: any, dflt: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : dflt;
}

/** Tiny safe guardrail parser for expressions like: "fatigue<0.6 && momentum>0.7" */
function evalGuardrail(expr: string, state: Record<string, number>): boolean {
  if (!expr || typeof expr !== "string") return true;
  // Only allow: [a-z_]+ <|<=|>|>= number, joined by && or ||
  const tokens = expr.split(/\s*(\&\&|\|\|)\s*/);
  let valueStack: boolean[] = [];
  let opStack: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].trim();
    if (t === "&&" || t === "||") { opStack.push(t); continue; }
    const m = t.match(/^([a-z_]+)\s*(<=|<|>=|>)\s*([0-9]*\.?[0-9]+)$/i);
    if (!m) return true; // fail-open
    const [, k, op, numStr] = m;
    const left = Number(state[k] ?? 0);
    const right = Number(numStr);
    let ok = true;
    if (op === "<") ok = left < right;
    else if (op === "<=") ok = left <= right;
    else if (op === ">") ok = left > right;
    else if (op === ">=") ok = left >= right;
    valueStack.push(ok);
  }
  // Reduce booleans with ops in sequence
  let res = valueStack.shift() ?? true;
  for (const op of opStack) {
    const next = valueStack.shift() ?? true;
    res = op === "&&" ? (res && next) : (res || next);
  }
  return res;
}

function applyPolicyToMove(
  initialMove: string,
  state: Record<string, number>,
  policies: Record<string, any>
): string {
  if (policies.move_override) return String(policies.move_override);

  let move = initialMove;

  // Guardrail: CHALLENGE allowed?
  const guard = String(policies.move_challenge_guardrail || "");
  if (move === "CHALLENGE" && guard && !evalGuardrail(guard, state)) {
    move = "REFLECT";
  }

  // Demote on extreme fatigue
  const fatigueDemote = parseNumber(policies.move_demote_if_fatigue_ge, NaN);
  if (move === "CHALLENGE" && Number.isFinite(fatigueDemote) && (state as any).fatigue >= fatigueDemote) {
    move = "REFLECT";
  }

  return move;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Use POST");
  try {
    const body = req.body as InterpretInput;
    if (!body?.message || !body?.channel) {
      return res.status(400).json({ error: "message and channel required" });
    }

    // 1) Base state + extra signals for RFE
    const state = detectState(body.message);
    const sig = {
      ...extraSignals(body.message),
      momentum: state.momentum,
      confidence: state.confidence,
      fatigue: state.fatigue,
      openness: state.openness,
    } as any;

    // 2) Personality inference (cheap v1)
    const archetype = inferArchetype(sig);

    // 3) Live policies + move selection
    const policies = await fetchPolicies();
    const picked = (chooseMove.length >= 2)
      ? (chooseMove as any)(state, policies)
      : chooseMove(state);

    const initialMove = picked.move;
    const move = applyPolicyToMove(initialMove, state as any, policies);
    const rationale = picked.rationale;
    const constraints = picked.constraints;

    const out: InterpretOutput = { state, move, rationale, constraints };

    // 4) Logs (history), Latest (snapshot), Telemetry (company view), Personalities (upsert)
    const userId = (body as any).userId || "";
    const sessionId = (body as any).sessionId || "";

    // Logs
    postToSheets("log", {
      userId, sessionId,
      input: body.message,
      state, move, output: "",
      meta: { channel: body.channel, source: "interpret", policiesUsed: !!Object.keys(policies).length }
    });

    // Latest snapshot (one line per user)
    postToSheets("upsertLatest", {
      userId, sessionId,
      input: body.message, output: "",
      move, state
    });

    // Telemetry append
    postToSheets("telemetry", {
      ts: new Date().toISOString(),
      userId, sessionId,
      move,
      signals_json: JSON.stringify(sig),
      archetype,
      used_policies: Object.keys(policies||{}).join(","),
      personalization_ratio: 0,  // will be updated by /rewrite
      repair_used: false
    });

    // Personality upsert
    postToSheets("upsertPersonality", {
      userId,
      archetype,
      trust: 0.6,
      preferred_pacing: "short",
      weights_json: "{}"
    });

    return res.status(200).json({ ok: true, result: out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message || "internal error" });
  }
}
