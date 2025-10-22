import type { VercelRequest, VercelResponse } from "vercel";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Use POST");
  try {
    const webhook = process.env.SHEETS_WEBHOOK_URL;
    if (!webhook) return res.status(400).json({ ok:false, error: "SHEETS_WEBHOOK_URL missing" });

    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {})
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ ok:false, error: `Sheets webhook failed: ${t}` });
    }
    return res.status(200).json({ ok:true });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error: e?.message || "internal error" });
  }
}
