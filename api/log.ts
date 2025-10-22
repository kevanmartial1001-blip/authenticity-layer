export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok:false, error:"method_not_allowed" }), { status: 405 });
    }
    const body = await req.json();
    // expected: { userId, sessionId, input, state, move, output, meta }
    const payload = {
      op: "log",
      apiKey: process.env.SHEETS_API_KEY || "",
      userId: body.userId || "",
      sessionId: body.sessionId || "",
      input: body.input || "",
      state: body.state || {},
      move: body.move || "",
      output: body.output || "",
      meta: body.meta || {}
    };

    const r = await fetch(process.env.SHEETS_WEBHOOK_URL as string, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload),
      // Avoid long hangs
      cache: "no-store"
    });
    const j = await r.json().catch(() => ({ ok:false, error:"bad_sheets_response" }));
    if (!j.ok) return new Response(JSON.stringify({ ok:false, error:j.error || "sheets_failed" }), { status: 502 });
    return new Response(JSON.stringify({ ok:true }), { status: 200 });
  } catch (err:any) {
    return new Response(JSON.stringify({ ok:false, error:String(err?.message||err) }), { status: 500 });
  }
}
