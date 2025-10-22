import type { VercelRequest, VercelResponse } from "vercel";
import { detectState } from "../lib/state";
import { chooseMove } from "../lib/policy";
import { InterpretInput, InterpretOutput } from "../lib/schema";

// ---- Helpers: Sheets + Policies + Guardrails ----
const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL!;
const API_KEY = process.env.SHEETS_API_KEY || "";

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
  // Example knobs (all optional). If absent, no change.
  // Policies sheet keys (examples):
  //  - move_ack_threshold = 0.35
  //  - move_challenge_guardrail = "fatigue<0.6 && momentum>0.7"
  //  - move_override = "ACKNOWLEDGE"  (hard override for testing)
  //  - move_demote_if_fatigue_ge = 0.8 -> demote any CHALLENGE to REFLECT

  if (policies.move_override) return String(policies.move_override);

  let move = initialMove;

  // Guardrail: challenge allowed?
  const guard = String(policies.move_challenge_guardrail || "");
  if (move === "CHALLENGE" && guard && !evalGuardrail(guard, state)) {
    move = "REFLECT";
  }

  // Demote on extreme fatigue
  const fatigueDemote = parseNumber(policies.move_demote_if_fatigue_ge, NaN);
  if (move === "CHALLENGE" && Number.isFinite(fatigueDemote) && state.fatigue >= fatigueDemote) {
    move = "REFLECT";
  }

  return move;
}

async function logToSheets(payload: Record<string, any>) {
  if (!SHEETS_URL) return;
  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "log", apiKey: API_KEY, ...payload })
    });
  } catch { /* non-blocking */ }
}

// -------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Use POST");
  try {
    const body = req.body as InterpretInput;
    if (!body?.message || !body?.channel) {
      return res.status(400).json({ error: "message and channel required" });
    }

    const state = detectState(body.message);

    // Pull live policies and apply to move selection
    const policies = await fetchPolicies();

    // If your lib/policy.chooseMove accepts (state, policies) use that; otherwise call normally:
    const picked = chooseMove.length >= 2
      ? (chooseMove as any)(state, policies)
      : chooseMove(state);

    const initialMove = picked.move;
    const move = applyPolicyToMove(initialMove, state as any, policies);
    const rationale = picked.rationale;
    const constraints = picked.constraints;

    const out: InterpretOutput = { state, move, rationale, constraints };

    // Log to Sheets (non-blocking)
    logToSheets({
      userId: body.userId || "",
      sessionId: body.sessionId || "",
      input: body.message,
      state,
      move,
      output: "",                 // filled by /api/rewrite
      meta: { channel: body.channel, source: "interpret", policiesUsed: !!Object.keys(policies).length }
    });

    return res.status(200).json({ ok: true, result: out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message || "internal error" });
  }
}
