import { gearDatabase, type GearItem } from "./gearDatabase";

export type TripProfile = {
  hikingLevel: "beginner" | "intermediate" | "advanced";
  groupType: "solo" | "couple" | "group" | "family_kids";
  healthConditions: Array<"asthma" | "heart_condition" | "knee_joints" | "diabetes" | "allergies" | "pregnancy">;
};

export type WeatherContext = {
  hasRain: boolean;
  highFireRisk: boolean;
  isCold: boolean;
  isHighAltitude: boolean;
  hasThunderstorm: boolean;
  highBearRisk: boolean;
  poorAirQuality: boolean;
};

export type ChecklistItem = GearItem & { reason?: string };
export type ChecklistSection = { category: GearItem["category"]; label: string; items: ChecklistItem[] };

const CATEGORY_LABELS: Record<GearItem["category"], string> = {
  shelter: "Shelter",
  sleep: "Sleep System",
  clothing: "Clothing & Layers",
  navigation: "Navigation",
  food: "Food & Cooking",
  water: "Water",
  safety: "Safety & Emergency",
  health: "Health & Medical",
  mobility: "Mobility & Comfort",
  lighting: "Lighting",
  hygiene: "Hygiene & Leave No Trace",
};

export function deriveTripType(startDate: string, endDate: string): "day_hike" | "overnight" | "multi_day" {
  const days =
    Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (days <= 1) return "day_hike";
  if (days === 2) return "overnight";
  return "multi_day";
}

export function recommendGear(
  profile: TripProfile,
  tripType: "day_hike" | "overnight" | "multi_day",
  weather: WeatherContext
): ChecklistSection[] {
  const activeTags = new Set<string>([
    profile.hikingLevel,
    profile.groupType,
    tripType,
    ...profile.healthConditions,
    ...(weather.hasRain ? ["rain"] : []),
    ...(weather.highFireRisk ? ["high_fire"] : []),
    ...(weather.isCold ? ["cold"] : []),
    ...(weather.isHighAltitude ? ["high_altitude"] : []),
    ...(weather.hasThunderstorm ? ["thunderstorm"] : []),
    ...(weather.highBearRisk ? ["high_bear"] : []),
    ...(weather.poorAirQuality ? ["poor_air"] : []),
  ]);

  const selected: ChecklistItem[] = [];

  for (const item of gearDatabase) {
    if (item.tags.length === 0) {
      selected.push(item);
      continue;
    }

    const matchCount = item.tags.filter((t) => activeTags.has(t)).length;

    if (item.priority === "essential" && matchCount > 0) {
      selected.push(item);
    } else if (item.priority === "recommended" && matchCount >= 1) {
      selected.push(item);
    } else if (item.priority === "optional" && matchCount >= 2) {
      selected.push(item);
    }
  }

  const order: GearItem["category"][] = [
    "safety",
    "health",
    "shelter",
    "sleep",
    "clothing",
    "water",
    "food",
    "navigation",
    "mobility",
    "lighting",
    "hygiene",
  ];

  const grouped = new Map<GearItem["category"], ChecklistItem[]>();
  for (const cat of order) grouped.set(cat, []);

  for (const item of selected) {
    grouped.get(item.category)?.push(item);
  }

  const sections: ChecklistSection[] = [];
  for (const cat of order) {
    const items = grouped.get(cat) ?? [];
    if (items.length > 0) {
      sections.push({ category: cat, label: CATEGORY_LABELS[cat], items });
    }
  }

  return sections;
}
