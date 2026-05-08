export type GearItem = {
  id: string;
  name: string;
  category:
    | "shelter"
    | "sleep"
    | "clothing"
    | "navigation"
    | "food"
    | "water"
    | "safety"
    | "health"
    | "mobility"
    | "lighting"
    | "hygiene";
  priority: "essential" | "recommended" | "optional";
  // User-selectable tags: trip type (day_hike, overnight, multi_day), group type (solo, couple, group, family_kids),
  // health conditions (asthma, allergies, heart_condition, knee_joints),
  // weather-derived (rain, high_fire, cold, high_altitude, thunderstorm, high_bear, poor_air)
  tags: string[];
  storeLinks: { name: string; url: string }[];
};

export const gearDatabase: GearItem[] = [
  // SHELTER
  {
    id: "tent",
    name: "Tent",
    category: "shelter",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=tent" }],
  },
  {
    id: "tarp",
    name: "Emergency Tarp / Bivy",
    category: "shelter",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=emergency+bivy" }],
  },
  {
    id: "tent_footprint",
    name: "Tent Footprint",
    category: "shelter",
    priority: "recommended",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=tent+footprint" }],
  },
  {
    id: "rain_fly",
    name: "Extra Rain Fly",
    category: "shelter",
    priority: "recommended",
    tags: ["rain", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=rain+fly" }],
  },

  // SLEEP
  {
    id: "sleep_kit",
    name: "Sleeping Bag & Sleeping Pad (check bag temp rating against forecast lows)",
    category: "sleep",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=sleeping+bag+sleeping+pad" }],
  },
  {
    id: "pillow",
    name: "Camping Pillow",
    category: "sleep",
    priority: "optional",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=camping+pillow" }],
  },

  // CLOTHING
  {
    id: "rain_jacket",
    name: "Rain Jacket",
    category: "clothing",
    priority: "essential",
    tags: ["rain", "day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=rain+jacket" }],
  },
  {
    id: "rain_pants",
    name: "Rain Pants",
    category: "clothing",
    priority: "recommended",
    tags: ["rain", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=rain+pants" }],
  },
  {
    id: "base_layer",
    name: "Moisture-Wicking Base Layer",
    category: "clothing",
    priority: "essential",
    tags: ["overnight", "multi_day", "cold"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=base+layer" }],
  },
  {
    id: "insulating_layer",
    name: "Insulating Layer (Fleece or Down Jacket)",
    category: "clothing",
    priority: "essential",
    tags: ["cold", "overnight", "multi_day", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=fleece+jacket+camping" }],
  },
  {
    id: "hiking_boots",
    name: "Waterproof Hiking Boots",
    category: "clothing",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day", "rain"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=waterproof+hiking+boots" }],
  },
  {
    id: "hiking_shoes",
    name: "Trail Running Shoes",
    category: "clothing",
    priority: "recommended",
    tags: ["day_hike"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=trail+running+shoes" }],
  },
  {
    id: "wool_socks",
    name: "Merino Wool Socks (2–3 pairs)",
    category: "clothing",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=merino+wool+hiking+socks" }],
  },
  {
    id: "gloves",
    name: "Waterproof Gloves",
    category: "clothing",
    priority: "recommended",
    tags: ["cold", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=waterproof+hiking+gloves" }],
  },
  {
    id: "hat_sun",
    name: "Sun Hat",
    category: "clothing",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=sun+hat+hiking" }],
  },
  {
    id: "hat_warm",
    name: "Warm Beanie",
    category: "clothing",
    priority: "recommended",
    tags: ["cold", "high_altitude", "overnight"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=beanie+hat+camping" }],
  },
  {
    id: "gaiters",
    name: "Gaiters",
    category: "clothing",
    priority: "recommended",
    tags: ["rain", "multi_day", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=gaiters+hiking" }],
  },

  // NAVIGATION — listed as alternatives so the user picks whichever they carry
  {
    id: "nav_tools",
    name: "GPS Device or Topographic Map & Compass",
    category: "navigation",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=gps+topographic+map+compass" }],
  },

  // FOOD — stove and cookpot merged since neither is useful without the other
  {
    id: "cook_kit",
    name: "Camp Stove, Fuel & Cookpot",
    category: "food",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=backpacking+stove+cookpot" }],
  },
  {
    id: "bear_canister",
    name: "Bear Canister",
    category: "food",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=bear+canister" }],
  },
  {
    id: "food_trail",
    name: "High-Calorie Trail Food (1.5 lbs/day)",
    category: "food",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=trail+food+backpacking" }],
  },

  // WATER — filter and bottles merged since you need both together
  {
    id: "water_system",
    name: "Water Filter + Hydration Bottles/Bladder (2–4L)",
    category: "water",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=water+filter+hydration+bladder" }],
  },
  {
    id: "electrolytes",
    name: "Electrolyte Packets",
    category: "water",
    priority: "recommended",
    tags: ["high_altitude", "heart_condition"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=electrolyte+packets+hiking" }],
  },

  // SAFETY
  {
    id: "first_aid",
    name: "First Aid Kit",
    category: "safety",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit+camping" }],
  },
  {
    id: "whistle",
    name: "Emergency Whistle",
    category: "safety",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=emergency+whistle" }],
  },
  {
    id: "fire_starter",
    name: "Waterproof Matches / Fire Starter",
    category: "safety",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=waterproof+matches+firestarter" }],
  },
  {
    id: "knife",
    name: "Multi-Tool or Knife",
    category: "safety",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=multi+tool+knife+camping" }],
  },
  {
    id: "bear_spray",
    name: "Bear Spray",
    category: "safety",
    priority: "recommended",
    tags: ["high_bear"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=bear+spray" }],
  },
  {
    id: "n95_mask",
    name: "N95 Masks (smoke/ash protection)",
    category: "safety",
    priority: "recommended",
    tags: ["high_fire", "asthma", "poor_air"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=n95+mask+outdoor" }],
  },
  // Sunscreen and bug repellent merged — both applied before heading out, always packed together
  {
    id: "sun_bug_kit",
    name: "Sunscreen SPF 50+ & Insect Repellent",
    category: "safety",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=sunscreen+insect+repellent" }],
  },
  {
    id: "lightning_protocol",
    name: "Lightning Safety Guide (download offline)",
    category: "safety",
    priority: "recommended",
    tags: ["thunderstorm"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=weather+radio+camping" }],
  },
  {
    id: "satellite_messenger",
    name: "Satellite Messenger (e.g. Garmin inReach)",
    category: "safety",
    priority: "recommended",
    tags: ["solo", "multi_day", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=satellite+messenger" }],
  },

  // HEALTH
  {
    id: "inhaler",
    name: "Rescue Inhaler (extra)",
    category: "health",
    priority: "essential",
    tags: ["asthma"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit" }],
  },
  {
    id: "altitude_meds",
    name: "Altitude Sickness Medication (consult doctor)",
    category: "health",
    priority: "recommended",
    tags: ["high_altitude", "heart_condition"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=altitude+sickness" }],
  },
  // EpiPen and antihistamines merged — same condition, always packed together
  {
    id: "allergy_kit",
    name: "Allergy Kit (EpiPen if prescribed + antihistamines)",
    category: "health",
    priority: "essential",
    tags: ["allergies"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit" }],
  },
  // Heart meds and nitroglycerin merged — same condition, same kit
  {
    id: "heart_kit",
    name: "Heart Medications & Nitroglycerin (extra supply, labeled)",
    category: "health",
    priority: "essential",
    tags: ["heart_condition"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit" }],
  },

  // MOBILITY
  {
    id: "trekking_poles",
    name: "Trekking Poles",
    category: "mobility",
    priority: "essential",
    tags: ["knee_joints", "multi_day", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=trekking+poles" }],
  },
  {
    id: "knee_brace",
    name: "Knee Brace / Support",
    category: "mobility",
    priority: "essential",
    tags: ["knee_joints"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=knee+brace+hiking" }],
  },
  {
    id: "lightweight_pack",
    name: "Lightweight Backpack (under 2 lbs)",
    category: "mobility",
    priority: "recommended",
    tags: ["heart_condition"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=lightweight+backpack" }],
  },
  {
    id: "kids_pack",
    name: "Child Carrier Pack",
    category: "mobility",
    priority: "recommended",
    tags: ["family_kids"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=child+carrier+backpack" }],
  },

  // PET ESSENTIALS
  {
    id: "pet_leash",
    name: "Dog Leash & Harness",
    category: "safety",
    priority: "essential",
    tags: ["pets"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=dog+harness+hiking" }],
  },
  {
    id: "pet_first_aid",
    name: "Pet First Aid Kit",
    category: "health",
    priority: "essential",
    tags: ["pets"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=pet+first+aid+kit" }],
  },
  {
    id: "pet_water",
    name: "Collapsible Water Bowl + Extra Water for Pet",
    category: "water",
    priority: "essential",
    tags: ["pets"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=collapsible+dog+bowl" }],
  },
  {
    id: "pet_food",
    name: "Pet Food & Treats",
    category: "food",
    priority: "essential",
    tags: ["pets"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=dog+trail+treats" }],
  },

  // LIGHTING
  {
    id: "headlamp",
    name: "Headlamp + Extra Batteries",
    category: "lighting",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=headlamp+camping" }],
  },
  {
    id: "lantern",
    name: "Camp Lantern",
    category: "lighting",
    priority: "recommended",
    tags: ["overnight", "multi_day", "family_kids"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=camping+lantern" }],
  },

  // HYGIENE — waste kit and hand sanitizer merged since they're always packed as a hygiene bundle
  {
    id: "hygiene_kit",
    name: "Hand Sanitizer + LNT Waste Kit (trowel, bags)",
    category: "hygiene",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=leave+no+trace+kit" }],
  },
  {
    id: "biodegradable_soap",
    name: "Biodegradable Soap",
    category: "hygiene",
    priority: "recommended",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=biodegradable+soap+camping" }],
  },
  {
    id: "wet_wipes",
    name: "Biodegradable Wet Wipes",
    category: "hygiene",
    priority: "recommended",
    tags: ["overnight", "multi_day", "family_kids"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=biodegradable+wipes" }],
  },
];
