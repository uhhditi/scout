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
  // profile tags: hiking level, trip type, health conditions, group type
  // weather tags: rain, high_fire, cold, high_altitude, thunderstorm
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
    id: "sleeping_bag",
    name: "Sleeping Bag",
    category: "sleep",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=sleeping+bag" }],
  },
  {
    id: "sleeping_bag_cold",
    name: "Cold-Weather Sleeping Bag (0°F or lower)",
    category: "sleep",
    priority: "essential",
    tags: ["cold", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=cold+weather+sleeping+bag" }],
  },
  {
    id: "sleeping_pad",
    name: "Sleeping Pad",
    category: "sleep",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=sleeping+pad" }],
  },
  {
    id: "pillow",
    name: "Camping Pillow",
    category: "sleep",
    priority: "optional",
    tags: ["overnight", "multi_day", "comfort"],
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
    tags: ["day_hike", "overnight", "multi_day", "advanced", "intermediate", "rain"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=waterproof+hiking+boots" }],
  },
  {
    id: "hiking_shoes",
    name: "Trail Running Shoes",
    category: "clothing",
    priority: "recommended",
    tags: ["day_hike", "beginner", "intermediate"],
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
    tags: ["rain", "advanced", "multi_day", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=gaiters+hiking" }],
  },

  // NAVIGATION
  {
    id: "map",
    name: "Topographic Map",
    category: "navigation",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=topographic+map" }],
  },
  {
    id: "compass",
    name: "Compass",
    category: "navigation",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=hiking+compass" }],
  },
  {
    id: "gps",
    name: "GPS Device / Satellite Communicator",
    category: "navigation",
    priority: "recommended",
    tags: ["advanced", "multi_day", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=gps+device+hiking" }],
  },

  // FOOD
  {
    id: "stove",
    name: "Backpacking Stove + Fuel",
    category: "food",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=backpacking+stove" }],
  },
  {
    id: "cookpot",
    name: "Cookpot + Utensils",
    category: "food",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=camping+cookpot" }],
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
  {
    id: "food_diabetic",
    name: "Diabetic-Safe Snacks (low glycemic index)",
    category: "food",
    priority: "essential",
    tags: ["diabetes"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=trail+snacks" }],
  },

  // WATER
  {
    id: "water_filter",
    name: "Water Filter / Purifier",
    category: "water",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=water+filter+backpacking" }],
  },
  {
    id: "water_bottles",
    name: "Water Bottles or Hydration Bladder (2–4L)",
    category: "water",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=hydration+bladder" }],
  },
  {
    id: "electrolytes",
    name: "Electrolyte Packets",
    category: "water",
    priority: "recommended",
    tags: ["high_altitude", "advanced", "heart_condition", "diabetes"],
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
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=bear+spray" }],
  },
  {
    id: "n95_mask",
    name: "N95 Masks (smoke/ash protection)",
    category: "safety",
    priority: "essential",
    tags: ["high_fire", "asthma"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=n95+mask+outdoor" }],
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
    id: "sunscreen",
    name: "Sunscreen SPF 50+",
    category: "safety",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day", "high_altitude"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=sunscreen+spf+50" }],
  },
  {
    id: "bug_repellent",
    name: "Insect Repellent",
    category: "safety",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=insect+repellent+camping" }],
  },
  {
    id: "satellite_messenger",
    name: "Satellite Messenger (e.g. Garmin inReach)",
    category: "safety",
    priority: "recommended",
    tags: ["advanced", "solo", "multi_day", "high_altitude"],
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
  {
    id: "epipen",
    name: "EpiPen (if prescribed)",
    category: "health",
    priority: "essential",
    tags: ["allergies"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit" }],
  },
  {
    id: "antihistamine",
    name: "Antihistamines",
    category: "health",
    priority: "essential",
    tags: ["allergies"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit" }],
  },
  {
    id: "glucose_monitor",
    name: "Glucose Monitor + Extra Supplies",
    category: "health",
    priority: "essential",
    tags: ["diabetes"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit" }],
  },
  {
    id: "heart_meds",
    name: "Heart Medications (extra supply, labeled)",
    category: "health",
    priority: "essential",
    tags: ["heart_condition"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit" }],
  },
  {
    id: "nitroglycerin",
    name: "Nitroglycerin Spray (if prescribed)",
    category: "health",
    priority: "essential",
    tags: ["heart_condition"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=first+aid+kit" }],
  },
  {
    id: "prenatal_vitamins",
    name: "Prenatal Vitamins + Extra Water",
    category: "health",
    priority: "essential",
    tags: ["pregnancy"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=camping+water+bottle" }],
  },

  // MOBILITY
  {
    id: "trekking_poles",
    name: "Trekking Poles",
    category: "mobility",
    priority: "essential",
    tags: ["knee_joints", "advanced", "multi_day", "high_altitude"],
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
    tags: ["heart_condition", "pregnancy", "beginner"],
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

  // HYGIENE
  {
    id: "waste_kit",
    name: "Leave No Trace Waste Kit (trowel + bags)",
    category: "hygiene",
    priority: "essential",
    tags: ["overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=leave+no+trace+kit" }],
  },
  {
    id: "hand_sanitizer",
    name: "Hand Sanitizer",
    category: "hygiene",
    priority: "essential",
    tags: ["day_hike", "overnight", "multi_day"],
    storeLinks: [{ name: "REI", url: "https://www.rei.com/search?q=hand+sanitizer" }],
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
