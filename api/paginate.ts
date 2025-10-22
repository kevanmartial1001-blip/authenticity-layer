import type { VercelRequest, VercelResponse } from "vercel";
import { paginateAnswer } from "../lib/paginate";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method!=="POST") return res.status(405).send("Use POST");
  const { text="", options={} } = req.body || {};
  const bursts = paginateAnswer(String(text||""), options);
  res.status(200).json({ ok:true, bursts });
}
