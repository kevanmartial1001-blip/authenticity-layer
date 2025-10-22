export type Channel = "chat" | "voice" | "email" | "support";

export type VoiceDNA = {
  id: string;
  values: string[];
  tone: { warmth: number; directness: number; humor: number; formality: number };
  style: {
    sentences: "short" | "mixed" | "long";
    cadence: "crisp" | "flow";
    lexicon_prefer?: string[];
    lexicon_avoid?: string[];
  };
  boundaries?: { never_overpromise?: boolean; avoid_exclamations?: boolean };
};

export type InterpretInput = {
  user_id?: string;
  channel: Channel;
  message: string;
  brand_dna?: Partial<VoiceDNA>;
};

export type LatentState = {
  momentum: number;   // 0-1
  confidence: number; // 0-1
  fatigue: number;    // 0-1
  openness: number;   // 0-1
};

export type EmpathyMove =
  | "ACKNOWLEDGE"
  | "CLARIFY"
  | "CHALLENGE"
  | "MOTIVATE"
  | "REFLECT"
  | "CO_PLAN"
  | "CELEBRATE";

export type InterpretOutput = {
  state: LatentState;
  move: EmpathyMove;
  rationale: string;
  constraints: { max_words?: number };
};

export type RewriteInput = {
  move: EmpathyMove;
  state: LatentState;
  channel: Channel;
  dna: VoiceDNA;
  goal?: string;
  context?: string; // optional short context summary
};
