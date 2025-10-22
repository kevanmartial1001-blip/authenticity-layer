import type { VercelRequest, VercelResponse } from "vercel";
import { detectState } from "../lib/state";
import { chooseMove } from "../lib/policy";
import { InterpretInput, InterpretOutput } from "../lib/schema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Use POST");
  try {
    const body = req.body as InterpretInput;
    if (!body?.message || !body?.channel) return res.status(400).json({ error: "message and channel required" });

    const state = detectState(body.message);
    const { move, rationale, constraints } = chooseMove(state);

    const out: InterpretOutput = { state, move, rationale, constraints };
    return res.status(200).json({ ok: true, result: out });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error: e.message || "internal error" });
  }
}
