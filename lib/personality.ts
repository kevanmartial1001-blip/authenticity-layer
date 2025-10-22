export type Archetype = "Analytical"|"Idealist"|"Defender"|"Explorer"|"Supporter"|"Unknown";

export function inferArchetype(sig:{specificity:number, agency_signal:number, reflection_depth:number}): Archetype {
  if (sig.specificity>0.6 && sig.reflection_depth<0.4) return "Analytical";
  if (sig.reflection_depth>0.6 && sig.agency_signal<0.4) return "Idealist";
  if (sig.agency_signal<0.3) return "Defender";
  if (sig.agency_signal>0.6 && sig.specificity>0.5) return "Explorer";
  return "Supporter";
}
