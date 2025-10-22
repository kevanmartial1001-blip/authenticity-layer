import { VoiceDNA } from "./schema";

export const DEFAULT_DNA: VoiceDNA = {
  id: "brand_default",
  values: ["clarity","kindness","no-bullshit"],
  tone: { warmth: 0.8, directness: 0.7, humor: 0.2, formality: 0.3 },
  style: { sentences: "short", cadence: "crisp", lexicon_prefer: ["Let’s lock it","Quick heads-up"] },
  boundaries: { never_overpromise: true, avoid_exclamations: true }
};
