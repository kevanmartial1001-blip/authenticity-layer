import type { VercelRequest, VercelResponse } from "vercel";
import { RewriteInput } from "../lib/schema";

function templateRender(input: RewriteInput): string {
  const { move, dna } = input;
  const short = dna.style.sentences === "short";
  const s = (t:string)=> short ? t.replace(/, /g,". ").replace(/; /g,". ") : t;

  switch (move) {
    case "ACKNOWLEDGE":
      return s(`I hear you. That’s tough. Want me to make this easier with one small step now?`);
    case "REFLECT":
      return s(`Sounds like today’s been heavy. Do you want to pause and name the hardest part, or just take a breath together first?`);
    case "CHALLENGE":
      return s(`You’ve got momentum. Pick one tiny stretch now: 5 minutes or one bullet point. Which one?`);
    case "MOTIVATE":
      return s(`You’ve shown up before, you can do it again. How about a quick win we can finish in 3 minutes, then reassess?`);
    case "CO_PLAN":
      return s(`Let’s plan this together. Two options: A) timer for 10 minutes, B) step-by-step checklist. What feels doable?`);
    case "CELEBRATE":
      return s(`Nice move. That’s progress. Want a snapshot of what improved, or jump to the next tiny step?`);
    case "CLARIFY":
    default:
      return s(`Got it. What’s the one outcome you want from this in the next 10 minutes?`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Use POST");
  try {
    const body = req.body as RewriteInput;
    if (!body?.move || !body?.dna || !body?.channel || !body?.state) {
      return res.status(400).json({ error: "move, dna, channel, state required" });
    }
    const text = templateRender(body);
    return res.status(200).json({ ok:true, output: text, mode:"template" });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error: e.message || "internal error" });
  }
}
