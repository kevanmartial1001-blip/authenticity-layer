export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const userId = url.searchParams.get("userId") || "";
      const r = await fetch(process.env.SHEETS_WEBHOOK_URL as string, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ op:"getProfile", userId, apiKey: process.env.SHEETS_API_KEY || "" })
      });
      const j = await r.json();
      return new Response(JSON.stringify({ ok:true, profile: j.profile || {} }), { status: 200 });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const payload = {
        op: "setProfile",
        apiKey: process.env.SHEETS_API_KEY || "",
        userId: body.userId || "",
        voice_dna: body.voice_dna || {}
      };
      const r = await fetch(process.env.SHEETS_WEBHOOK_URL as string, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (!j.ok) return new Response(JSON.stringify({ ok:false, error:j.error || "sheets_failed" }), { status: 502 });
      return new Response(JSON.stringify({ ok:true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok:false, error:"method_not_allowed" }), { status: 405 });
  } catch (err:any) {
    return new Response(JSON.stringify({ ok:false, error:String(err?.message||err) }), { status: 500 });
  }
}
