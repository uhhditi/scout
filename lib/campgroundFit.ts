/**
 * Heuristic match between RIDB facility text (name, description, keywords, attributes)
 * and the user's companion / health tags. Always confirm on Recreation.gov.
 */
export type CampgroundAmenityFit = {
  highlights: string[];
  /** 0–100: higher = stronger keyword match for this trip profile (not a safety score). */
  amenityMatchScore: number;
};

export function scoreCampgroundAmenityFit(params: {
  amenityText: string;
  companions: string[];
  healthConcerns: string[];
}): CampgroundAmenityFit {
  const highlights: string[] = [];
  let pts = 0;
  const t = params.amenityText;
  const lower = t.toLowerCase();

  // Reward listings that actually have substantive text
  if (lower.length > 120) pts += 8;

  // ─── Companion flags ───────────────────────────────────────────────────────

  const hasPets = params.companions.includes("Pets");
  const hasElderly = params.companions.includes("Elderly");
  const hasKids = params.companions.includes("Kids");
  const hasPartner = params.companions.includes("Partner");
  const hasFriends = params.companions.includes("Friends");
  const isGroup = hasFriends || params.companions.length > 2;
  const mobility = params.healthConcerns.includes("Mobility issues");

  // Pets — check negative first to avoid false positive
  if (hasPets) {
    if (/\b(no pets|not pet|no dogs|pets prohibited|pets not allowed)\b/i.test(lower)) {
      highlights.push("Text suggests pet restrictions — verify before booking with pets.");
      pts -= 10;
    } else if (/\b(pet|pets|dog|dogs|leash|kennel|pet friendly|pet-friendly)\b/i.test(lower)) {
      highlights.push("Listing mentions pets — confirm site rules on Recreation.gov.");
      pts += 26;
    }
  }

  // Kids — recreation, safety, and facilities that matter for families
  if (hasKids) {
    if (/\b(playground|play area|splash pad|wading|swim|swimming|beach|lake|pond|nature center|junior ranger|interpretive|family)\b/i.test(lower)) {
      highlights.push("Family-friendly recreation mentioned — good for kids.");
      pts += 18;
    }
    if (/\b(flush toilet|flush toilets|restroom|restrooms|shower|showers|potable water|drinking water)\b/i.test(lower)) {
      highlights.push("Flush toilets or showers listed — easier with young kids.");
      pts += 14;
    }
    if (/\b(ranger|camp host|host|staffed|visitor center)\b/i.test(lower)) {
      highlights.push("Ranger or camp host on site — helpful for family safety.");
      pts += 8;
    }
    // Flag anything that might not be great for kids
    if (/\b(cliff|cliffs|steep|exposed|technical|advanced|remote|backcountry|primitive)\b/i.test(lower)) {
      highlights.push("Terrain may be challenging — review site layout for kids.");
      pts -= 6;
    }
  }

  // Elderly — accessibility and comfort are the priority
  if (hasElderly || mobility) {
    const accessStrong =
      /\b(ada|accessible|accessibility|wheelchair|handicap|handicapped)\b/i.test(lower) ||
      /\baccessible\s+(trail|site|route|campsite|path|parking)\b/i.test(lower);
    const accessMild =
      /\b(paved|pull-?through|pull through|level site|hard\s*surface|flat|gravel pad)\b/i.test(lower);

    if (accessStrong) {
      highlights.push("ADA or accessibility language found — review specific site details.");
      pts += 32;
    } else if (accessMild) {
      highlights.push("Paved or level site language may indicate easier access.");
      pts += 16;
    }
    if (/\b(flush toilet|flush toilets|restroom|restrooms|shower|showers)\b/i.test(lower)) {
      highlights.push("Flush toilets or showers — important comfort for elderly campers.");
      pts += 18;
    }
    if (/\b(ranger|camp host|host|staffed|emergency|first aid|clinic|hospital)\b/i.test(lower)) {
      highlights.push("On-site host or ranger mentioned — useful if medical help is needed.");
      pts += 12;
    }
    if (/\b(electric|full hookup|hookup|50 amp|30 amp)\b/i.test(lower)) {
      highlights.push("Electric hookups listed — useful for medical devices or CPAP.");
      pts += 14;
    }
    // Penalise very remote or rugged listings for elderly / mobility
    if (/\b(backcountry|remote|primitive|hike-?in|hike in|pack-?in|no vehicle)\b/i.test(lower)) {
      highlights.push("Remote or hike-in site — may not suit mobility or elderly needs.");
      pts -= 14;
    }
  }

  // Groups and partners — larger sites, group loops
  if (isGroup) {
    if (/\b(group site|group camp|group area|large site|double site|multi-?family|group loop|group reservation)\b/i.test(lower)) {
      highlights.push("Group or large site mentioned — good for bigger parties.");
      pts += 18;
    }
    if (/\b(pavilion|shelter|picnic shelter|group pavilion)\b/i.test(lower)) {
      highlights.push("Covered shelter or pavilion — useful for group gatherings.");
      pts += 10;
    }
  }

  // ─── Health conditions ─────────────────────────────────────────────────────

  const hasAsthma =
    params.healthConcerns.includes("Asthma") ||
    params.healthConcerns.includes("Respiratory illness/condition");
  const hasAllergies = params.healthConcerns.includes("Seasonal allergies");
  const hasHeart = params.healthConcerns.includes("Heart condition");

  // Asthma / respiratory
  if (hasAsthma) {
    if (/\b(electric|full hookup|water hookup|sewer|50 amp|30 amp|hookup)\b/i.test(lower)) {
      highlights.push("Electric hookups mentioned — can power nebulizers or air filters.");
      pts += 18;
    }
    if (/\b(non-?smoking|no smoking|smoke-?free)\b/i.test(lower)) {
      highlights.push("Non-smoking or smoke-free language — better for respiratory sensitivity.");
      pts += 12;
    }
    if (/\b(paved|hard surface|gravel pad)\b/i.test(lower)) {
      highlights.push("Paved or hard surface noted — less dust exposure.");
      pts += 8;
    }
    // High-altitude or smoke-prone areas can be a concern
    if (/\b(high altitude|alpine|above treeline|exposed ridge)\b/i.test(lower)) {
      highlights.push("High altitude or exposed terrain — thinner air may affect breathing.");
      pts -= 8;
    }
  }

  // Seasonal allergies
  if (hasAllergies) {
    if (/\b(shade|shaded|forest|timber|canopy|wooded|tree cover)\b/i.test(lower)) {
      highlights.push("Shaded or wooded — can help reduce direct pollen exposure.");
      pts += 8;
    }
    if (/\b(open|meadow|grassland|prairie|field|exposed)\b/i.test(lower)) {
      highlights.push("Open meadow or grassland — higher pollen exposure likely.");
      pts -= 6;
    }
    if (/\b(flush toilet|restroom|showers|potable water)\b/i.test(lower)) {
      // Washing up nearby helps with allergen management
      pts += 6;
    }
  }

  // Heart condition — proximity to help and low-exertion access matter most
  if (hasHeart) {
    if (/\b(ranger|camp host|host|staffed|emergency|first aid|aed|defibrillator|clinic|hospital nearby)\b/i.test(lower)) {
      highlights.push("Ranger station or emergency services mentioned — important for cardiac safety.");
      pts += 20;
    }
    if (/\b(cell service|wifi|signal|reception|emergency call)\b/i.test(lower)) {
      highlights.push("Connectivity mentioned — important for emergency contact with heart condition.");
      pts += 16;
    }
    if (/\b(electric|full hookup|50 amp|30 amp)\b/i.test(lower)) {
      highlights.push("Electric hookups — useful for medical devices.");
      pts += 12;
    }
    // Strenuous terrain is a concern
    if (/\b(steep|strenuous|technical|backcountry|hike-?in|hike in|remote|high altitude|alpine)\b/i.test(lower)) {
      highlights.push("Strenuous or remote terrain — consider exertion and emergency access carefully.");
      pts -= 16;
    }
    // Drive-up or easy access is a positive
    if (/\b(drive-?up|drive up|vehicle access|car camping|paved road|accessible road)\b/i.test(lower)) {
      highlights.push("Drive-up or vehicle access mentioned — good for minimising exertion.");
      pts += 10;
    }
  }

  // ─── General amenity signals (apply regardless of profile) ─────────────────

  // Water and sanitation — broadly useful
  const waterComfort =
    /\b(shower|showers|restroom|restrooms|flush toilet|flush toilets|potable water|drinking water|water spigot|spigot)\b/i.test(lower);
  if (waterComfort && !highlights.some((h) => h.includes("toilet") || h.includes("shower") || h.includes("water"))) {
    highlights.push("Restrooms, showers, or potable water on site — confirm seasonal availability.");
    pts += 10;
  }

  // Cell service / connectivity — always relevant for safety
  if (/\b(cell service|cell signal|wifi|wi-fi|signal|reception|emergency call)\b/i.test(lower)) {
    if (!highlights.some((h) => h.includes("onnectivity") || h.includes("onnection"))) {
      highlights.push("Connectivity mentioned — useful for emergencies.");
      pts += 8;
    }
  }

  // Fire infrastructure
  if (/\b(fire ring|campfire allowed|fire pit|fire grate)\b/i.test(lower)) {
    pts += 6;
  }

  // Dump station — RV / comfort camping
  if (/\b(dump station|sanitary dump|sewer hookup)\b/i.test(lower)) {
    pts += 6;
  }

  // Bear box / food storage — safety signal
  if (/\b(bear box|bear locker|bear canister|food storage|bear-?proof)\b/i.test(lower)) {
    highlights.push("Bear food storage on site — follow all food storage regulations.");
    pts += 8;
  }

  const amenityMatchScore = Math.max(0, Math.min(100, Math.round(pts)));
  return { highlights, amenityMatchScore };
}