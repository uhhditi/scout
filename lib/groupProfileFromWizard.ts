import type { GroupProfile } from "@/lib/riskScoring";

/** Mirrors wizard → `GroupProfile` mapping used when building trip safety reports. */
export function groupProfileFromWizardSelections(
  companions: string[],
  healthConcerns: string[]
): GroupProfile {
  const vulnerableMembers = companions
    .map((tag) => {
      if (tag === "Elderly") return "elderly";
      if (tag === "Kids") return "children";
      if (tag === "Pets") return "pets";
      return null;
    })
    .filter((member): member is "elderly" | "children" | "pets" => member !== null);

  const medicalConditions = healthConcerns.map((tag) => {
    if (tag === "Asthma") return "asthma";
    if (tag === "Respiratory illness/condition") return "respiratory";
    return tag.toLowerCase();
  });

  return { vulnerableMembers, medicalConditions };
}
