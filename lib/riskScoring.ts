// Risk Scoring Functions - Convert raw API data to 1-100 risk scores
// Higher score = higher risk

const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = p2 - p1;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parse NASA FIRMS JSON: array of rows, or common variants.
 */
export function extractFireCoordinates(fireData: unknown): { lat: number; lon: number }[] {
  if (fireData == null) return [];
  const rows: unknown[] = Array.isArray(fireData)
    ? fireData
    : typeof fireData === "object" &&
        fireData !== null &&
        "data" in fireData &&
        Array.isArray((fireData as { data: unknown[] }).data)
      ? (fireData as { data: unknown[] }).data
      : typeof fireData === "object" &&
          fireData !== null &&
          "features" in fireData &&
          Array.isArray((fireData as { features: { geometry?: { coordinates?: number[] } }[] }).features)
        ? (fireData as { features: { geometry?: { coordinates?: number[] } }[] }).features
            .map((f) => f.geometry?.coordinates)
            .filter(
              (c): c is number[] => Array.isArray(c) && c.length >= 2
            )
            .map((c) => ({ lat: c[1], lon: c[0] }))
        : [];
  const out: { lat: number; lon: number }[] = [];
  for (const row of rows) {
    if (row && typeof row === "object" && "geometry" in (row as object)) {
      const g = (row as { geometry?: { coordinates?: number[] } }).geometry;
      const c = g?.coordinates;
      if (c && c.length >= 2) {
        out.push({ lat: c[1], lon: c[0] });
        continue;
      }
    }
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rawLat = r.latitude ?? r.lat;
    const rawLon = r.longitude ?? r.lon;
    if (rawLat == null || rawLon == null) continue;
    const lat = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat));
    const lon = typeof rawLon === "number" ? rawLon : parseFloat(String(rawLon));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      out.push({ lat, lon });
    }
  }
  return out;
}

/** Shortest great-circle distance (km) from the campsite to any hotspot, or null if none. */
export function getNearestFireDistanceKm(
  fireData: unknown,
  siteLat: number,
  siteLon: number
): number | null {
  if (!Number.isFinite(siteLat) || !Number.isFinite(siteLon)) return null;
  const points = extractFireCoordinates(fireData);
  if (points.length === 0) return null;
  let min = Infinity;
  for (const p of points) {
    const d = haversineDistanceKm(siteLat, siteLon, p.lat, p.lon);
    if (d < min) min = d;
  }
  return min === Infinity ? null : min;
}

function fireProximityAddFromMinKm(minKm: number | null, hasFires: boolean): number {
  if (!hasFires) return 0;
  if (minKm == null || !Number.isFinite(minKm)) return 20;
  if (minKm < 5) return 55;
  if (minKm < 15) return 38;
  if (minKm < 30) return 28;
  return Math.max(0, Math.round(28 * Math.exp(-(minKm - 30) / 25)));
}

/**
 * Fire Risk Score (1-100)
 * Now also factors drought severity (D0-D4) and NOAA SPC fire weather outlook.
 */
export function calculateFireRisk(
  fireData: unknown,
  weatherDaily: {
    weathercode: number[];
    precipitation_sum: number[];
    windspeed_10m_max: number[];
  },
  startDate: string,
  endDate: string,
  siteLat?: number,
  siteLon?: number,
  droughtCategory = 0,
  nfdrsErcPercentile = 0
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const points = extractFireCoordinates(fireData);
  const hasFires = points.length > 0;
  let minFireKm: number | null = null;
  if (hasFires && siteLat != null && siteLon != null && Number.isFinite(siteLat) && Number.isFinite(siteLon)) {
    for (const p of points) {
      const d = haversineDistanceKm(siteLat, siteLon, p.lat, p.lon);
      if (minFireKm === null || d < minFireKm) minFireKm = d;
    }
  }
  const fireProximityAdd =
    siteLat != null && siteLon != null && Number.isFinite(siteLat) && Number.isFinite(siteLon)
      ? fireProximityAddFromMinKm(minFireKm, hasFires)
      : fireProximityAddFromMinKm(null, hasFires);

  const densityAdd = points.length >= 15 ? 5 : points.length >= 8 ? 3 : 0;

  let maxRisk = 0;

  for (let dayIndex = 0; dayIndex < Math.min(days, weatherDaily.weathercode.length); dayIndex++) {
    let score = 5;

    score += fireProximityAdd + densityAdd;

    const precipitation = weatherDaily.precipitation_sum[dayIndex] || 0;
    if (precipitation < 0.5) score += 12;
    else if (precipitation < 2) score += 6;
    else if (precipitation <5) score += 3
    else if (precipitation > 10) score -= 10;

    const windSpeed = weatherDaily.windspeed_10m_max[dayIndex] || 0;
    let windAdd = 0;
    if (windSpeed > 40) windAdd = 25;
    else if (windSpeed > 30) windAdd = 15;
    else if (windSpeed > 20) windAdd = 8;
    score += hasFires ? windAdd : Math.round(windAdd * 0.4);

    const weatherCode = weatherDaily.weathercode[dayIndex] || 0;
    if ([80, 81, 82, 95, 96, 99].includes(weatherCode)) score -= 15;

    const dayRisk = Math.max(1, Math.min(100, score));
    maxRisk = Math.max(maxRisk, dayRisk);
  }

  // Drought amplifies fire risk independently of daily weather
  const droughtAddRaw = [0, 5, 12, 22, 35][Math.max(0, Math.min(4, Math.round(droughtCategory)))];

  // NIFC NFDRS Energy Release Component percentile — higher = drier/more dangerous
  let ercAddRaw = 0;
  if (nfdrsErcPercentile >= 97) ercAddRaw = 40;
  else if (nfdrsErcPercentile >= 90) ercAddRaw = 28;
  else if (nfdrsErcPercentile >= 75) ercAddRaw = 18;
  else if (nfdrsErcPercentile >= 50) ercAddRaw = 8;
  else if (nfdrsErcPercentile >= 25) ercAddRaw = 3;

  // When no active fires are nearby, drought & ERC represent *potential* not
  // realized danger — scale them down so dry conditions alone can't push a
  // fire-free area to risk 4/5.
  const hasNearbyFire = hasFires && minFireKm !== null && minFireKm < 80;
  const conditionScale = hasNearbyFire ? 1.0 : 0.45;
  const droughtAdd = Math.round(droughtAddRaw * conditionScale);
  const ercAdd = Math.round(ercAddRaw * conditionScale);

  return Math.max(1, Math.min(100, maxRisk + droughtAdd + ercAdd));
}

/**
 * Air Quality Risk Score (1-100)
 * Now also incorporates pollen load, weighted higher when respiratory flags are set.
 */
export function calculateAirQualityRisk(
  usAqiValues: number[],
  pollenTotal = 0,
  hasRespiratoryFlag = false
): number {
  if (!usAqiValues || usAqiValues.length === 0) return 20;

  const avgAqi = usAqiValues.reduce((a, b) => a + b, 0) / usAqiValues.length;

  let score: number;
  if (avgAqi > 300) score = 100;
  else if (avgAqi > 200) score = 85;
  else if (avgAqi > 150) score = 70;
  else if (avgAqi > 100) score = 55;
  else if (avgAqi > 50) score = 35;
  else score = 15;

  // Pollen contribution — doubled for respiratory/allergy groups
  const pollenMultiplier = hasRespiratoryFlag ? 2.0 : 1.0;
  let pollenAdd = 0;
  if (pollenTotal >= 100) pollenAdd = 20;
  else if (pollenTotal >= 50) pollenAdd = 12;
  else if (pollenTotal >= 20) pollenAdd = 7;
  else if (pollenTotal >= 5) pollenAdd = 3;
  score += Math.round(pollenAdd * pollenMultiplier);

  return Math.max(1, Math.min(100, score));
}

/**
 * Weather Alertness Score (1-100)
 * Incorporates NWS watches/warnings, FEMA flood zone, and USGS stream stage.
 */
export function calculateWeatherAlertness(
  weatherDaily: {
    weathercode: number[];
    precipitation_sum: number[];
    windspeed_10m_max: number[];
    temperature_2m_max?: number[];
  },
  startDate: string,
  endDate: string,
  nwsAlertEvents: string[] = [],
  floodZone: string | null = null,
  streamStageRatio: number | null = null
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  let maxAlertness = 0;

  for (let dayIndex = 0; dayIndex < Math.min(days, weatherDaily.weathercode.length); dayIndex++) {
    let score = 8;

    const weatherCode = weatherDaily.weathercode[dayIndex] || 0;
    const precipitation = weatherDaily.precipitation_sum[dayIndex] || 0;
    const windSpeed = weatherDaily.windspeed_10m_max[dayIndex] || 0;
    const tempMax = weatherDaily.temperature_2m_max?.[dayIndex] ?? null;

    if ([95, 96, 99].includes(weatherCode)) score += 50;
    else if ([80, 81, 82].includes(weatherCode)) score += 30;
    else if ([51, 53, 55, 61, 63, 65, 66, 67].includes(weatherCode)) score += 15;
    else if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) score += 25;

    if (precipitation > 20) score += 20;
    else if (precipitation > 10) score += 10;
    else if (precipitation > 5) score += 5;

    if (windSpeed > 50) score += 30;
    else if (windSpeed > 40) score += 20;
    else if (windSpeed > 30) score += 10;

    if (tempMax !== null) {
      if (tempMax > 50) score += 75;       // lethal heat >122°F — floor overall at 90+
      else if (tempMax > 45) score += 60;  // extreme heat >113°F
      else if (tempMax > 40) score += 45;  // dangerous heat >104°F
      else if (tempMax > 36) score += 30;  // high heat >97°F
      else if (tempMax > 32) score += 18;  // warm >90°F
      else if (tempMax > 28) score += 8;   // mild >82°F
      else if (tempMax < -15) score += 40; // extreme cold <5°F
      else if (tempMax < -5) score += 25;  // severe cold <23°F
      else if (tempMax < 0) score += 12;   // freezing
    }

    const dayAlertness = Math.max(1, Math.min(100, score));
    maxAlertness = Math.max(maxAlertness, dayAlertness);
  }

  // NWS active alerts add a floor — the worst active warning wins
  const alertBoost = nwsAlertBoost(nwsAlertEvents);
  maxAlertness = Math.max(maxAlertness, alertBoost + 8);

  // FEMA flood zone adds a static hazard floor independent of daily weather
  let floodFloor = 0;
  if (floodZone) {
    const z = floodZone.toUpperCase().trim();
    if (["VE", "V"].includes(z)) floodFloor = 55;
    else if (["AE", "AH", "AO", "A"].includes(z)) floodFloor = 38;
    else if (z === "A99") floodFloor = 22;
    else if (z.startsWith("X") || z === "B" || z === "C") floodFloor = 5;
  }
  // Real-time stream stage raises the floor proportionally
  if (streamStageRatio !== null && Number.isFinite(streamStageRatio)) {
    floodFloor += Math.round(streamStageRatio * 28);
  }
  maxAlertness = Math.max(maxAlertness, floodFloor);

  return Math.max(1, Math.min(100, maxAlertness));
}

function nwsAlertBoost(events: string[]): number {
  let boost = 0;
  for (const event of events) {
    const e = event.toLowerCase();
    let b = 0;
    if (e.includes("tornado warning")) b = 70;
    else if (e.includes("tornado watch")) b = 45;
    else if (e.includes("severe thunderstorm warning")) b = 40;
    else if (e.includes("flash flood warning")) b = 45;
    else if (e.includes("flash flood watch")) b = 30;
    else if (e.includes("flash flood statement")) b = 10;
    else if (e.includes("blizzard warning")) b = 50;
    else if (e.includes("winter storm warning")) b = 35;
    else if (e.includes("winter storm watch")) b = 28;
    else if (e.includes("winter storm advisory")) b = 20;
    else if (e.includes("winter weather advisory")) b = 15;
    else if (e.includes("ice storm warning")) b = 40;
    else if (e.includes("high wind warning")) b = 30;
    else if (e.includes("high wind watch")) b = 20;
    else if (e.includes("high wind advisory")) b = 15;
    else if (e.includes("excessive heat warning")) b = 48;
    else if (e.includes("heat advisory")) b = 25;
    else if (e.includes("red flag warning")) b = 20;
    else if (e.includes("flood warning")) b = 30;
    else if (e.includes("flood watch")) b = 18;
    else if (e.includes("hard freeze warning")) b = 25;
    else if (e.includes("freeze warning")) b = 20;
    else if (e.includes("freeze watch")) b = 15;
    else if (e.includes("dense fog advisory")) b = 10;
    boost = Math.max(boost, b);
  }
  return boost;
}

/**
 * Bear Risk Score (1-100)
 * Now also factors recent iNaturalist bear sightings near the site and terrain roughness.
 */
export function calculateBearRisk(
  elevation: number,
  latitude: number,
  month: number,
  nearbyObservationCount = 0,
  terrainRoughness = 0
): number {
  let score = 5;

  // Observations are the primary signal — no sightings keeps score in Low tier
  if (nearbyObservationCount >= 10) score += 68;
  else if (nearbyObservationCount >= 4) score += 50;
  else if (nearbyObservationCount >= 1) score += 30;

  // Elevation is a minor habitat modifier
  if (elevation > 2500) score += 7;
  else if (elevation > 1500) score += 4;
  else if (elevation > 500) score += 2;

  // Season affects bear activity but shouldn't override observation signal
  if (month >= 9 && month <= 11) score += 5;
  else if (month >= 6 && month <= 8) score += 3;
  else if (month >= 3 && month <= 5) score += 2;

  if (latitude > 50) score += 4;
  else if (latitude > 45) score += 2;

  if (terrainRoughness >= 60) score += 4;
  else if (terrainRoughness >= 30) score += 2;

  return Math.max(1, Math.min(100, score));
}

export function getBearDangerRating(
  elevation: number,
  latitude: number,
  month: number,
  nearbyObservationCount = 0,
  terrainRoughness = 0
): number {
  const score = calculateBearRisk(elevation, latitude, month, nearbyObservationCount, terrainRoughness);

  if (score >= 75) return 5;
  if (score >= 56) return 4;
  if (score >= 38) return 3;
  if (score >= 22) return 2;
  return 1;
}


/**
 * Terrain roughness score (0-100) derived from elevation standard deviation
 * across a grid of nearby points. Higher = more rugged.
 */
export function calculateTerrainRoughness(elevations: number[]): number {
  if (elevations.length < 2) return 0;
  const mean = elevations.reduce((a, b) => a + b, 0) / elevations.length;
  const variance = elevations.reduce((acc, e) => acc + (e - mean) ** 2, 0) / elevations.length;
  const stdDev = Math.sqrt(variance);
  // stdDev: 0–5 m = flat, 5–20 = rolling, 20–50 = rugged, 50+ = extreme
  return Math.max(0, Math.min(100, Math.round(stdDev * 0.7)));
}

export function terrainRoughnessLabel(roughness: number): string {
  if (roughness >= 70) return "Very Rugged";
  if (roughness >= 45) return "Rugged";
  if (roughness >= 20) return "Rolling";
  if (roughness >= 8) return "Moderate";
  return "Flat";
}

/**
 * UV & Pollen Sensitivity Score (1-100)
 * Only shown when group has allergy or respiratory health flags.
 */
// export function calculateUVPollenRisk(uvIndexMax: number, pollenTotal: number): number {
//   let score = 0;

//   if (uvIndexMax >= 11) score += 45;
//   else if (uvIndexMax >= 8) score += 30;
//   else if (uvIndexMax >= 6) score += 18;
//   else if (uvIndexMax >= 3) score += 8;

//   if (pollenTotal >= 100) score += 55;
//   else if (pollenTotal >= 50) score += 38;
//   else if (pollenTotal >= 20) score += 22;
//   else if (pollenTotal >= 5) score += 12;

//   return Math.max(1, Math.min(100, score));
// }

// export function uvPollenLabel(score: number): string {
//   if (score >= 80) return "Very High";
//   if (score >= 55) return "High";
//   if (score >= 35) return "Moderate";
//   if (score >= 15) return "Low";
//   return "Minimal";
// }

/**
 * Elevation & Terrain Mobility Risk Score (1-100)
 * Only computed and shown when group has mobility health flags.
 */
export function calculateElevationMobilityRisk(elevation: number, terrainRoughness: number): number {
  let score = 5;

  const absElevation = Math.abs(elevation);
  if (absElevation > 3000) score += 45;
  else if (absElevation > 2000) score += 30;
  else if (absElevation > 1000) score += 20;
  else if (absElevation > 500) score += 10;

  if (terrainRoughness >= 70) score += 30;
  else if (terrainRoughness >= 45) score += 20;
  else if (terrainRoughness >= 20) score += 10;
  else if (terrainRoughness >= 8) score += 5;

  return Math.max(1, Math.min(100, score));
}

export function mobilityRiskLabel(score: number): string {
  if (score >= 80) return "Very Challenging";
  if (score >= 60) return "Challenging";
  if (score >= 40) return "Moderate";
  if (score >= 20) return "Manageable";
  return "Accessible";
}

/**
 * Overall Safety Score (0-10)
 * Flood hazard is now folded into weatherAlertness, so no separate flood param.
 */
export function calculateOverallSafetyScore(
  fireRisk: number,
  airQualityRisk: number,
  weatherAlertness: number,
  bearRisk: number
): number {
  const fireSafety = 100 - fireRisk;
  const airSafety = 100 - airQualityRisk;
  const weatherSafety = 100 - weatherAlertness;
  const bearSafety = 100 - bearRisk;

  const weighted =
    fireSafety * 0.35 +
    weatherSafety * 0.32 +
    airSafety * 0.20 +
    bearSafety * 0.13;

  const worstSafety = Math.min(fireSafety, weatherSafety, airSafety, bearSafety);
  const floored = Math.min(weighted, worstSafety * 1.3 + 20);

  return Math.round(floored) / 10;
}

export interface RiskScores {
  overall: number;
  weather: number;
  temperature: number;
  wind: number;
  precipitation: number;
  fire: number;
  airQuality: number;
}

export interface GroupProfile {
  vulnerableMembers: ("elderly" | "children" | "pets")[];
  medicalConditions: ("asthma" | "respiratory" | string)[];
}

export function applyGroupMultipliers(scores: RiskScores, group: GroupProfile): RiskScores {
  let { overall, weather, temperature, wind, precipitation, fire, airQuality } = scores;

  const vulnerabilityMap: Record<string, number> = {
    elderly: 1.2,
    children: 1.3,
    pets: 1.1,
  };
  const applicableMultipliers = group.vulnerableMembers.map(
    (member) => vulnerabilityMap[member] ?? 1.0
  );
  const vulnerabilityMultiplier =
    applicableMultipliers.length > 0 ? Math.max(...applicableMultipliers) : 1.0;

  overall *= vulnerabilityMultiplier;
  temperature *= vulnerabilityMultiplier;

  const hasRespiratoryCondition =
    group.medicalConditions.includes("asthma") ||
    group.medicalConditions.includes("respiratory");
  const hasOtherMedical = group.medicalConditions.some(
    (condition) => condition !== "asthma" && condition !== "respiratory"
  );

  if (hasRespiratoryCondition) {
    fire *= 1.3;
    airQuality *= 1.30;
  }
  if (hasOtherMedical) {
    overall *= 1.25;
  }

  return {
    overall: Math.min(overall, 10),
    weather: Math.min(weather, 10),
    temperature: Math.min(temperature, 10),
    wind: Math.min(wind, 10),
    precipitation: Math.min(precipitation, 10),
    fire: Math.min(fire, 10),
    airQuality: Math.min(airQuality, 10),
  };
}

export function getRiskLevel(score: number): string {
  if (score >= 8.2) {
    return "Weather looks stable, air quality is clean, and no major hazards are flagged for your trip window. Good conditions to proceed as planned.";
  }
  if (score >= 6.8) {
    return "Most conditions are manageable but at least one factor warrants attention. Review the cards below and prepare accordingly.";
  }
  if (score >= 5.2) {
    return "Several risk factors are elevated for this location and timeframe. Extra preparation is recommended before heading out.";
  }
  return "Significant hazards are present for this trip window. Carefully review all conditions below and consider adjusting your plans.";
}
