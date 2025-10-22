type Burst = {
  kind: "ACK" | "PROBE" | "DELIVER" | "FOLLOWUP";
  text: string;
  delay_ms: number;          // client waits this long before sending it
  wait_for_user: boolean;    // if true, stop showing subsequent bursts
};
type ComposeOutput = {
  intent_guess: "info" | "action" | "support";
  confidence: number;        // 0..1
  bursts: Burst[];
  plan?: {                   // optional branching hints for the next turn
    on_user_yes?: string;    // hint for next compose call
    on_user_no?: string;
  };
};
