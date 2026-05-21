"use client";

import { useEffect, useRef, useState } from "react";
import { type SafetyMetric, type SafetyReport } from "@/lib/safetyReport";
import {
  calculateFireRisk,
  calculateAirQualityRisk,
  calculateWeatherAlertness,
  calculateBearRisk,
  getBearDangerRating,
  calculateOverallSafetyScore,
  calculateTerrainRoughness,
  calculateElevationMobilityRisk,
  terrainRoughnessLabel,
  applyGroupMultipliers,
  type GroupProfile,
  type RiskScores,
  getRiskLevel,
  getNearestFireDistanceKm,
  extractFireCoordinates,
} from "@/lib/riskScoring";
import { GearChecklist } from "@/app/components/gear-checklist";
import { TripDateRangePicker } from "@/app/components/trip-date-range-picker";
import { recommendGear, deriveTripType, type TripProfile, type WeatherContext, type ChecklistSection } from "@/lib/gearRecommender";
import { getExtremeWeatherLabel, getAirQualityRating, getAirQualityLabel } from "@/lib/airQualityCopy";
import {
  buildReportResultFromConditionsPayload,
  type ConditionsPayload,
  type TripReportResult,
} from "@/lib/tripReportFromConditionsPayload";
import { groupProfileFromWizardSelections } from "@/lib/groupProfileFromWizard";

function parseLocalYMD(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "Select dates";
  const start = parseLocalYMD(startDate);
  const end = parseLocalYMD(endDate);
  if (!start || !end) return "Select dates";
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatRangeInput(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "Select dates";
  return formatRange(startDate, endDate);
}

function formatReportTimestamp(iso: string) {
  if (!iso) return "Not generated";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not generated";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Map one highlight sentence to a short pill label, or null if none apply. */
function amenityTagFromHighlight(h: string): string | null {
  if (h.includes("pet") || h.includes("dog")) return "🐾 Pet friendly";
  if (h.includes("ADA") || h.includes("accessible") || h.includes("wheelchair")) return "♿ Accessible";
  if (h.includes("shower") || h.includes("Shower")) return "🚿 Showers";
  if (h.includes("electric") || h.includes("hookup")) return "⚡ Electric hookups";
  if (h.includes("flush toilet") || h.includes("Flush toilet") || h.includes("Restroom")) return "🚻 Flush toilets";
  if (h.includes("playground") || h.includes("swim") || h.includes("family") || h.includes("kids") || h.includes("beach"))
    return "🎠 Family activities";
  if (h.includes("ranger") || h.includes("host") || h.includes("emergency")) return "🧑‍🚒 On-site host";
  if (h.includes("bear") || h.includes("Bear")) return "🐻 Bear storage";
  if (h.includes("cell") || h.includes("wifi") || h.includes("signal")) return "📶 Cell signal";
  if (h.includes("drinking water") || h.includes("potable")) return "💧 Potable water";
  if (h.includes("paved") || h.includes("pull-through")) return "🚗 Drive-up access";
  if (h.includes("group") || h.includes("pavilion")) return "👥 Group sites";
  return null;
}

/** First N distinct tags (multiple highlights often map to the same tag, e.g. two electric mentions). */
function uniqueAmenityTags(highlights: string[], maxTags: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of highlights) {
    const tag = amenityTagFromHighlight(h);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
      if (out.length >= maxTags) break;
    }
  }
  return out;
}

function makeReportId(address: string, startDate: string, endDate: string) {
  const seed = `${address.trim().toLowerCase()}|${startDate}|${endDate}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `SR-${hash.toString(16).toUpperCase().padStart(8, "0").slice(0, 8)}`;
}

function kmToMiles(km: number) {
  return km * 0.621371;
}

function kmhToMph(kmh: number) {
  return kmh * 0.621371;
}

function metersToFeet(meters: number) {
  return meters * 3.28084;
}

function formatElevation(meters: number) {
  const ft = Math.round(Math.abs(meters) * 3.28084);
  return meters < 0 ? `${ft} ft below sea level` : `${ft} ft`;
}

function mmToInches(mm: number) {
  return mm * 0.0393701;
}

const COMPANION_TAGS = ["Just me", "Partner", "Friends", "Kids", "Elderly", "Pets"] as const;

function parseDetailsForExtras(
  companionDetails: string,
  healthDetails: string
): { extraConditions: TripProfile["healthConditions"]; detectedPets: boolean } {
  const text = (companionDetails + " " + healthDetails).toLowerCase();
  const extraConditions: TripProfile["healthConditions"] = [];

  const detectedPets = /\b(dog|dogs|cat|cats|puppy|puppies|kitten|kittens|pup|pups|pooch|pet|pets|canine|feline|labrador|retriever|golden|poodle|beagle|husky|shepherd|bulldog|dachshund|chihuahua|yorkie|tabby|rabbit|bunny|hamster|bird|parrot)\b/.test(text);

  if (/\b(asthma|asthmatic|inhaler|albuterol|wheezing|wheeze|bronchitis|bronchial|respiratory|copd|emphysema|shortness of breath|chest tightness|nebulizer)\b/.test(text))
    extraConditions.push("asthma");
  if (/\b(allergies|allergic|allergen|allergy|epipen|epinephrine|anaphylaxis|anaphylactic|hives|bee sting|nut allergy|peanut|shellfish|latex|hay fever|pollen|seasonal)\b/.test(text))
    extraConditions.push("allergies");
  if (/\b(heart|cardiac|pacemaker|hypertension|high blood pressure|angina|arrhythmia|afib|atrial fibrillation|bypass|stent|blood pressure|cholesterol|cardiovascular|nitroglycerin)\b/.test(text))
    extraConditions.push("heart_condition");
  if (/\b(knee|knees|joint|joints|wheelchair|walker|crutches|crutch|arthritis|arthritic|mobility|cane|brace|bad hip|bad back|sciatica|fibromyalgia|chronic pain|limited mobility|torn meniscus|acl)\b/.test(text))
    extraConditions.push("knee_joints");

  return { extraConditions, detectedPets };
}

function buildProfile(
  companions: string[],
  healthConcerns: string[],
  companionDetails = "",
  healthDetails = ""
): TripProfile {
  let groupType: TripProfile["groupType"] = "solo";
  if (companions.includes("Kids")) groupType = "family_kids";
  else if (companions.includes("Partner")) groupType = "couple";
  else if (companions.length > 0 && !companions.includes("Just me")) groupType = "group";

  const healthMap: Record<string, TripProfile["healthConditions"][number]> = {
    "Asthma": "asthma",
    "Allergies": "allergies",
    "Seasonal allergies": "allergies",
    "Mobility issues": "knee_joints",
    "Heart condition": "heart_condition",
    "Respiratory illness/condition": "asthma",
  };
  const selectedConditions = healthConcerns
    .filter((h) => h in healthMap)
    .map((h) => healthMap[h]);

  const { extraConditions, detectedPets } = parseDetailsForExtras(companionDetails, healthDetails);
  const healthConditions = [...new Set([...selectedConditions, ...extraConditions])];

  const hasPets = companions.includes("Pets") || detectedPets;
  return { hikingLevel: "intermediate", groupType, healthConditions, hasPets };
}

const HEALTH_TAGS = [
  "Asthma",
  "Seasonal allergies",
  "Mobility issues",
  "Heart condition",
  "Respiratory illness/condition",
  "Other",
] as const;

const detailTextByMetric: Record<string, string[]> = {
  "Fire Risk": [
    "Nearest active fires in the surrounding area are used to increase the local wildfire risk estimate.",
    "Weather conditions such as wind speed, precipitation, and storm patterns can raise or lower fire spread potential.",
    "Seasonal dryness and fuel conditions are factored in, so warmer and drier periods typically trend toward higher risk.",
  ],
  "Air Quality": [
    "AQI shifts quickly with regional smoke movement, so monitor updates throughout the day.",
    "If anyone in your group has respiratory sensitivity, keep masks and low-exertion backup plans ready.",
  ],
  "Weather Alertness": [
    "Mountain weather can change within hours, especially late afternoon and overnight.",
    "Plan layers, rain protection, and a quick shelter strategy before reaching remote sections.",
  ],
  "Bear Risk": [
    "Store all food and scented items in bear-proof containers or hang them properly.",
    "Make noise while hiking and avoid hiking at dawn/dusk when bears are most active.",
  ],
};

function overallPill(score: number) {
  if (score >= 8.2) return { label: "OPTIMAL", className: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" };
  if (score >= 6.8) return { label: "FAVORABLE", className: "bg-amber-100 text-amber-700 ring-1 ring-amber-200" };
  if (score >= 4.2) return { label: "CAUTION", className: "bg-orange-100 text-orange-700 ring-1 ring-orange-200" };
  return { label: "ELEVATED", className: "bg-red-100 text-red-700 ring-1 ring-red-200" };
}

function overallTripVerdict(score: number) {
  if (score > 6.5) {
    return { headline: "Looking good — happy camping! 🏕️", className: "text-emerald-800" };
  }
  if (score >= 4.5) {
    return { headline: "We recommend proceeding with caution", className: "text-amber-800" };
  }
  return { headline: "We recommend judgement call day-of", className: "text-orange-800" };
}

function buildKeepInMindItems(
  data: Omit<TripReportResult, "report"> | null,
  terrainLevel: number
): string[] {
  if (!data) return [];

  const items: string[] = [];
  const ctx = data.weatherCtx;
  const bearLevel = data.bearDangerRating ?? 1;
  const terrain = terrainLevel;

  if (data.fireRisk >= 55) {
    items.push("Wildfire risk is elevated. Check closures and have a backup route.");
  } else if (data.fireRisk >= 30) {
    items.push("Some wildfire concern nearby. Monitor official fire maps before you leave.");
  }

  if (data.airQualityUnavailable) {
    items.push("Air quality forecast was unavailable. Check local AQI closer to departure.");
  } else if (data.airRisk >= 45 || /unhealthy/i.test(data.airQualityLabel)) {
    items.push("Air quality may be poor. Consider masks if anyone has asthma or respiratory sensitivity.");
  } else if (data.airRisk >= 25) {
    items.push("Moderate air quality is possible. Worth a quick check before you head out.");
  }

  if (data.weatherHazardScore >= 60) {
    items.push(
      `Significant weather hazards (${data.weatherHazardLabel.toLowerCase()}). Plan for storms, wind, or flooding.`
    );
  } else if (data.weatherHazardScore >= 40 || ctx?.hasRain) {
    items.push("Rain or unsettled weather in the forecast. Pack waterproof layers and watch trail conditions.");
  }
  if (ctx?.hasThunderstorm) {
    items.push("Thunderstorms possible. Avoid exposed ridges and plan around afternoon storms.");
  }
  if (data.nwsAlertEvents.length > 0) {
    const preview = data.nwsAlertEvents.slice(0, 2).join("; ");
    items.push(
      `Active NWS alert${data.nwsAlertEvents.length > 1 ? "s" : ""}: ${preview}${data.nwsAlertEvents.length > 2 ? "…" : ""}.`
    );
  }

  if (bearLevel >= 4) {
    items.push("High bear activity expected. Use strict food storage and bear-aware travel habits.");
  } else if (bearLevel >= 3) {
    items.push("Bear activity is notable for this area and season. Use bear boxes and make noise on trail.");
  } else if (bearLevel >= 2) {
    items.push("Wildlife is present. Store scented items properly and follow local food-storage rules.");
  }

  if (terrain >= 4) {
    items.push(
      `Terrain is challenging${data.terrainLabel ? ` (${data.terrainLabel.toLowerCase()})` : ""}. Pace yourself and plan for elevation gain.`
    );
  } else if (terrain >= 3) {
    items.push("Moderate elevation and terrain. Allow extra time and bring sturdy footwear.");
  } else if (ctx?.isHighAltitude) {
    items.push("Higher elevation. Hydrate well and watch for altitude symptoms.");
  }

  if (ctx?.isCold) {
    items.push("Cold temperatures possible. Layer up and keep sleeping insulation dry.");
  }

  if (items.length === 0) {
    items.push("Conditions look relatively calm. Still check forecasts and local advisories the day you leave.");
  }

  return items.slice(0, 6);
}

function metricSecondary(metric: SafetyMetric) {
  const v = metric.value;
  switch (metric.label) {
    case "Fire Risk": {
      const level = v >= 80 ? 1 : v >= 55 ? 2 : v >= 35 ? 3 : v >= 18 ? 4 : 5;
      const pill =
        level === 1 ? "Low" : level === 2 ? "Moderate" : level === 3 ? "Elevated" : level === 4 ? "High" : "Severe";
      return { line: "", pill };
    }
    case "Air Quality": {
  // v is (100 - airQualityRisk), so risk = 100 - v
      const risk = 100 - v;
      const pill = risk <= 25 ? "Good" : risk <= 45 ? "Moderate" : "Sensitive";
      return { line: "", pill };
    }
    case "Weather Alertness": {
      const temp = 52 + (v % 34);
      const pill = v >= 75 ? "Low" : v >= 55 ? "Moderate" : v >= 35 ? "High" : "Extreme";
      return { line: `${temp}° projected`, pill };
    }
    case "Bear Risk": {
      const risk = 100 - v;
      const pill = risk >= 75 ? "Severe" : risk >= 55 ? "High" : risk >= 35 ? "Moderate" : "Low";
      return { line: `${Math.round(risk)} risk index`, pill };
    }
    default:
      return { line: `${v} index`, pill: "—" };
  }
}

function metricPrimary(metric: SafetyMetric) {
  const v = metric.value;
  switch (metric.label) {
    case "Fire Risk": {
      const level = v >= 80 ? 1 : v >= 55 ? 2 : v >= 35 ? 3 : v >= 18 ? 4 : 5;
      return { value: `Risk ${level}`, subtitle: "Risk level based on current proximity to wildfire and adverse conditions." };
    }
    case "Air Quality": {
  const aqi = metric.rawAqi ?? 0;
  const label = aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy (Sensitive)" : "Unhealthy";
  return { value: `${aqi} AQI`, subtitle: `Trip average — ${label}` };
}
    case "Weather Alertness": {
      const temp = 52 + (v % 34);
      return { value: `${temp}° Temp`, subtitle: "Expected daytime high" };
    }
    case "Bear Risk":
      return { value: `Risk ${Math.round(100 - v)}`, subtitle: "Bear activity risk based on elevation, season, and recent sightings" };
    default:
      return { value: `${v}`, subtitle: "Current reading" };
  }
}

function pillToneForLabel(pill: string) {
  const p = pill.toLowerCase();
  if (["good", "low", "clear", "flowing", "optimal", "favorable"].includes(p)) {
    return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (["moderate", "mixed", "variable", "caution", "sensitive"].includes(p)) {
    return "bg-sky-100 text-sky-700 ring-1 ring-sky-200";
  }
  if (["high", "elevated", "unsettled"].includes(p)) {
    return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
  }
  if (["severe"].includes(p)) {
    return "bg-red-100 text-red-700 ring-1 ring-red-200";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function wildlifeMatrixTone(score: number) {
  if (score >= 5) return { label: "Extreme", className: "bg-red-100 text-red-700 ring-1 ring-red-200" };
  if (score >= 4) return { label: "High", className: "bg-amber-100 text-amber-700 ring-1 ring-amber-200" };
  if (score >= 3) return { label: "Moderate", className: "bg-sky-100 text-sky-700 ring-1 ring-sky-200" };
  if (score >= 2) return { label: "Low", className: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" };
  return { label: "Minimal", className: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" };
}

type ReportResult = TripReportResult;

function buildDegradedReportResult(
  startDate: string,
  endDate: string,
  groupProfile: GroupProfile,
  conditionsNotice: string
): ReportResult {
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const seenMonths = new Set<number>();
  const cur = new Date(startDateObj);
  while (cur <= endDateObj) {
    seenMonths.add(cur.getMonth() + 1);
    cur.setMonth(cur.getMonth() + 1);
  }
  const areaElevation = 1200;
  const lat = 40;
  const bearRisk = Math.max(
    ...Array.from(seenMonths).map((m) => calculateBearRisk(areaElevation, lat, m))
  );
  const bearDangerRating = Math.max(
    ...Array.from(seenMonths).map((m) => getBearDangerRating(areaElevation, lat, m))
  );

  const fireRisk = 45;
  const airQualityRisk = 25;
  const weatherAlertness = 45;
  const overallSafetyRaw = calculateOverallSafetyScore(
    fireRisk,
    airQualityRisk,
    weatherAlertness,
    bearRisk
  );
  const baseRiskScores: RiskScores = {
    overall: Math.max(0, 10 - overallSafetyRaw),
    weather: weatherAlertness / 10,
    temperature: 5,
    wind: 5,
    precipitation: 5,
    fire: fireRisk / 10,
    airQuality: airQualityRisk / 10,
  };
  const adjustedRiskScores = applyGroupMultipliers(baseRiskScores, groupProfile);
  const adjustedFireRisk = adjustedRiskScores.fire * 10;
  const adjustedAirQualityRisk = adjustedRiskScores.airQuality * 10;
  const adjustedWeatherAlertness = adjustedRiskScores.weather * 10;
  const overallSafety = Math.max(0, 10 - adjustedRiskScores.overall);

  const fireDetails = [
    conditionsNotice,
    "Active fire hotspot proximity could not be evaluated for this run. Check official fire and public lands advisories before you leave.",
  ];
  const airQualityDetails = [
    conditionsNotice,
    "Check AQI from a trusted local or regional source as your departure date gets closer.",
  ];
  const weatherHazardDetails = [
    conditionsNotice,
    "Plan layers, rain protection, and a quick shelter strategy before reaching remote sections.",
  ];
  const bearRiskDetails = [
    "Bear activity here is estimated from typical season patterns, not your exact campsite coordinates.",
    "Store all food and scented items in bear-proof containers or hang them properly.",
  ];

  const metrics = [
    {
      label: "Fire Risk",
      value: 100 - adjustedFireRisk,
      note: "Fire risk could not be fully computed for this trip.",
      icon: "🔥",
    },
    {
      label: "Air Quality",
      value: 100 - adjustedAirQualityRisk,
      note: "Air quality could not be fully computed for this trip.",
      icon: "💨",
    },
    {
      label: "Weather Alertness",
      value: 100 - adjustedWeatherAlertness,
      note: "Weather hazard index could not be computed from live forecasts for this trip.",
      icon: "⛈️",
    },
    {
      label: "Bear Risk",
      value: 100 - bearRisk,
      note: "Bear activity risk based on typical season patterns only.",
      icon: "🐻",
    },
  ];

  const weatherCtx: WeatherContext = {
    hasRain: false,
    highFireRisk: false,
    isCold: false,
    isHighAltitude: areaElevation > 2500,
    hasThunderstorm: false,
    highBearRisk: bearDangerRating >= 3,
    poorAirQuality: false,
  };

  return {
    report: {
      overallScore: overallSafety,
      status: getRiskLevel(overallSafety),
      metrics,
    },
    temps: [],
    fireRisk: adjustedFireRisk,
    fireDetails,
    airRisk: adjustedAirQualityRisk,
    airQualityRating: 1,
    airQualityLabel: "Unknown",
    airQualityDetails,
    weatherHazardScore: adjustedWeatherAlertness,
    weatherHazardLabel: getExtremeWeatherLabel(adjustedWeatherAlertness),
    weatherHazardDetails,
    weatherRisk: adjustedWeatherAlertness,
    bearRisk,
    bearDangerRating,
    bearRiskDetails,
    terrainDifficultyScore: 0,
    terrainDifficultyLevel: 1,
    terrainElevationDetails: [],
    terrainLabel: "Unknown",
    nwsAlertEvents: [],
    airQualityUnavailable: true,
    conditionsNotice,
    dataSummaryIncomplete: true,
    weatherCtx,
  };
}

async function generateSafetyReportFromAPI(
  address: string,
  startDate: string,
  endDate: string,
  distance: number,
  groupProfile: GroupProfile
): Promise<ReportResult> {
  const url = `/api/conditions?address=${encodeURIComponent(address)}&startDate=${startDate}&endDate=${endDate}&distance=${distance}`;

  let response: Response;
  try {
    response = await fetch(url);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed to fetch conditions data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const {
      weather, airQuality, airQualityUnavailable, fire, location,
      forecastNotice, forecastWindowUsed,
      nwsAlertEvents = [],
      droughtCategory = 0,
      floodZone = null,
      nfdrsErcPercentile = 0,
      bearObservationCount = 0,
      inatBearCount = 0,
      bearSightingDetails = [],
      streamStageRatio = null,
    } = data;

    console.log('Location resolved:', { lat: location?.lat, lon: location?.lon, address });

    const weatherDaily = weather?.daily || {};
    const airHourly = airQuality?.hourly?.us_aqi || [];

    // Terrain roughness from 3×3 elevation grid
    const terrainElevations: number[] = location?.terrainElevations ?? [];
    const terrainRoughness = calculateTerrainRoughness(terrainElevations);
    const terrainLabel = terrainRoughnessLabel(terrainRoughness);



    const fireRisk = calculateFireRisk(
      fire,
      weatherDaily,
      startDate,
      endDate,
      location?.lat,
      location?.lon,
      droughtCategory,
      nfdrsErcPercentile,
    );
    const airQualityRisk = calculateAirQualityRisk(airHourly);
    const avgAqi = airHourly.length
      ? airHourly.reduce((sum: number, value: number) => sum + value, 0) / airHourly.length
      : 0;
    // console.log('AQ debug:', { avgAqi, airHourlyLength: airHourly.length, first5: airHourly.slice(0, 5) });
    const airQualityRating = getAirQualityRating(avgAqi);
    const airQualityLabel = getAirQualityLabel(airQualityRating);
    const airQualityDetails = airQualityUnavailable
      ? [
          "Average AQI for your selected trip window is not available because forecasts only extend 5 days.",
          "Check local AQI updates closer to departure so your group can plan effort level and protection.",
        ]
      : [
          `Average AQI over your trip is ${Math.round(avgAqi)}, which is ${airQualityLabel}.`,
          airQualityRating >= 3
            ? "If anyone in your group has respiratory sensitivity, keep masks and low-exertion backup plans ready."
            : airQualityRating === 2
              ? "Conditions are generally manageable, but monitor updates and reduce prolonged exertion if AQI rises."
              : "Air quality is favorable for most groups, though checking daily updates is still recommended.",
        ];
    const weatherAlertness = calculateWeatherAlertness(weatherDaily, startDate, endDate, nwsAlertEvents, floodZone, streamStageRatio);
    const tripDaysCount =
      Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const weatherCodeWindow = (weatherDaily.weathercode || []).slice(0, tripDaysCount);
    const precipitationWindow = (weatherDaily.precipitation_sum || []).slice(0, tripDaysCount);
    const windWindow = (weatherDaily.windspeed_10m_max || []).slice(0, tripDaysCount);
    const thunderstormDays = weatherCodeWindow.filter((code: number) => [95, 96, 99].includes(code)).length;
    const snowDays = weatherCodeWindow.filter((code: number) => [71, 73, 75, 77, 85, 86].includes(code)).length;
    const heavyRainDays = precipitationWindow.filter((value: number) => value > 20).length;
    const extremeWindDays = windWindow.filter((value: number) => value > 50).length;
    const hazardSignals: string[] = [];
    if (thunderstormDays > 0) hazardSignals.push(`${thunderstormDays} day(s) with thunderstorms`);
    if (snowDays > 0) hazardSignals.push(`${snowDays} day(s) with snow/sleet`);
    if (heavyRainDays > 0) hazardSignals.push(`${heavyRainDays} day(s) with heavy rain`);
    if (extremeWindDays > 0) hazardSignals.push(`${extremeWindDays} day(s) with extreme wind`);
    const weatherHazardDetails: string[] = [
      hazardSignals.length > 0
        ? `Potential extreme weather signals include ${hazardSignals.join(", ")}.`
        : "No thunderstorms, snow, heavy rain, or extreme wind are currently forecast in your trip window.",
      (() => {
        const peakTemp = Math.max(...((weatherDaily.temperature_2m_max as number[] | undefined) ?? [20]));
        const peakPrecip = precipitationWindow.length ? Math.max(...precipitationWindow) : 0;
        const peakWind = windWindow.length ? Math.max(...windWindow) : 0;
        if (peakTemp > 35) return "Expect high heat — bring extra water, electrolytes, and shade shelter. Limit strenuous activity during midday hours.";
        if (peakPrecip > 15) return "Heavy rain is in the forecast — pack waterproof layers, a rain fly, and plan for muddy or flooded trail sections.";
        if (peakWind > 40 && peakPrecip < 2) return "Strong dry winds are forecast — fire spread potential is elevated. Avoid open fires and have an evacuation plan ready.";
        if (peakTemp < 5) return "Sub-freezing temperatures are possible — layer aggressively, protect extremities, and keep sleeping insulation dry.";
        return "Pack a light rain layer and be ready for temperature swings, especially at elevation or overnight.";
      })(),
      floodZone
        ? `Flood zone: ${floodZone}. ${["AE","A","AH","AO","VE","V"].includes(floodZone.toUpperCase()) ? "High-risk zone with a 1% annual flood probability — avoid low-lying ground during rain." : "Lower long-term flood risk for this location."}`
        : "FEMA flood zone data was unavailable for this location.",
      ...(streamStageRatio !== null
        ? [`Nearby USGS stream gauges are at ${Math.round(streamStageRatio * 100)}% of high-water benchmark.`]
        : []),
      ...(nwsAlertEvents.some((e: string) => e.toLowerCase().includes("flood"))
        ? ["Active NWS flood alert in effect — monitor conditions closely."]
        : []),
    ];
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const seenMonths = new Set<number>();
    const cur = new Date(startDateObj);
    while (cur <= endDateObj) {
      seenMonths.add(cur.getMonth() + 1);
      cur.setMonth(cur.getMonth() + 1);
    }
    const areaElevation = Number(location?.elevation ?? 0);
    const bearRisk = Math.max(
      ...Array.from(seenMonths).map((m) =>
        calculateBearRisk(areaElevation, location?.lat || 39, m, bearObservationCount, terrainRoughness)
      )
    );
    const bearDangerRating = Math.max(
      ...Array.from(seenMonths).map((m) =>
        getBearDangerRating(areaElevation, location?.lat || 39, m, bearObservationCount, terrainRoughness)
      )
    );
    const strongestWind = windWindow.length ? Math.max(...windWindow) : 0;
    const driestDay = precipitationWindow.length ? Math.min(...precipitationWindow) : 0;
    const wettestDay = precipitationWindow.length ? Math.max(...precipitationWindow) : 0;
    const windLevel =
      strongestWind > 40 ? "high" : strongestWind > 30 ? "moderately high" : strongestWind > 20 ? "elevated" : "low";
    const precipitationLevel =
      wettestDay > 20 ? "heavy" : wettestDay > 10 ? "moderate" : wettestDay > 5 ? "light-to-moderate" : "light";
    const firePointCount = extractFireCoordinates(fire).length;
    const nearestFireKm =
      location?.lat != null && location?.lon != null
        ? getNearestFireDistanceKm(fire, location.lat, location.lon)
        : null;
    const fireDetails = [
      firePointCount > 0
        ? nearestFireKm != null
          ? `${firePointCount} active fire hotspot(s) were observed in the last 5 days. Nearest is about ${kmToMiles(nearestFireKm).toFixed(1)} mi from your campsite, which increases wildfire concern nearby.`
          : `${firePointCount} active fire hotspot(s) were observed in the last 5 days within your search area, increasing wildfire concern nearby.`
        : "No active fire hotspots were observed in the last 5 days in your search area.",
      `Weather impact: peak wind is ${kmhToMph(strongestWind).toFixed(1)} mph (${windLevel})${mmToInches(wettestDay) >= 0.01 ? `, and precipitation ranges ${mmToInches(driestDay).toFixed(2)}–${mmToInches(wettestDay).toFixed(2)} in (${precipitationLevel})` : ', with no precipitation forecast'}. ${wettestDay <= 1 && strongestWind > 15 ? 'Dry and windy conditions increase fire spread potential.' : 'Higher wind with lower rainfall increases fire spread potential.'}`,
      ...(droughtCategory >= 2 ? [`Drought level D${droughtCategory} detected in this area — dry conditions amplify fire spread risk.`] : []),
      ...(nfdrsErcPercentile >= 75 ? [`Fire danger index: ERC at the ${Math.round(nfdrsErcPercentile)}th percentile — conditions are drier than ${Math.round(nfdrsErcPercentile)}% of historical readings for this area.`] : []),
    ];
    const closestSighting = bearSightingDetails[0];
    const bearRiskDetails = [
      `Your area elevation is ${formatElevation(areaElevation)} — ${terrainLabel.toLowerCase()} terrain (roughness ${terrainRoughness}/100). Higher, more rugged terrain generally sees more bear activity.`,
      inatBearCount > 0
        ? `${inatBearCount} verified bear observation(s) recorded within 62 miles in the past 90 days via iNaturalist${closestSighting ? ` (closest: ${kmToMiles(closestSighting.distanceKm).toFixed(1)} mi, ${closestSighting.taxon})` : ""}.`
        : "No recent verified bear observations found within 62 miles via iNaturalist.",
      "Store all food and scented items in bear-proof containers or hang them properly.",
    ];

    const hasMobilityFlag = groupProfile.medicalConditions.some(
      (c) => c === 'knee_joints' || c.toLowerCase().includes('mobility') || c.toLowerCase().includes('knee')
    );
    const baseTerrainScore = calculateElevationMobilityRisk(areaElevation, terrainRoughness);
    const terrainDifficultyScore = hasMobilityFlag ? Math.min(100, Math.round(baseTerrainScore * 1.35)) : baseTerrainScore;
    const terrainDifficultyLevel = Math.max(1, Math.min(5, Math.ceil(terrainDifficultyScore / 20)));
    const terrainElevationDetails: string[] = [
      `Elevation: ${formatElevation(areaElevation)} — ${terrainLabel.toLowerCase()} terrain (roughness ${terrainRoughness}/100).${areaElevation > 2000 ? " High altitude increases physical effort and acclimatization time." : areaElevation > 1000 ? " Moderate elevation with some stamina demands on trail." : areaElevation < 0 ? " Below sea level — flat terrain with minimal elevation-related exertion." : " Relatively low elevation."}`,
      ...(inatBearCount > 0 ? [
        `🐻 ${inatBearCount} verified bear observation(s) within 62 miles in the past 90 days via iNaturalist${closestSighting ? ` (closest: ${kmToMiles(closestSighting.distanceKm).toFixed(1)} mi, ${closestSighting.taxon})` : ""}. Store food in bear-proof containers.`,
      ] : []),
    ];

    const overallSafetyRaw = calculateOverallSafetyScore(
      fireRisk,
      airQualityRisk,
      weatherAlertness,
      bearRisk,
    );
    const maxTemp = (weatherDaily.temperature_2m_max || []).length
      ? Math.max(...weatherDaily.temperature_2m_max)
      : 20;
    const temperatureRisk = maxTemp > 38 ? 10 : maxTemp > 34 ? 8 : maxTemp > 30 ? 6 : maxTemp < 0 ? 8 : 3;
    const windRisk = Math.min(10, strongestWind / 6);
    const precipitationRisk = Math.min(10, wettestDay / 3);
    const baseRiskScores: RiskScores = {
      overall: Math.max(0, 10 - overallSafetyRaw),
      weather: weatherAlertness / 10,
      temperature: temperatureRisk,
      wind: windRisk,
      precipitation: precipitationRisk,
      fire: fireRisk / 10,
      airQuality: airQualityRisk / 10,
    };
    const adjustedRiskScores = applyGroupMultipliers(baseRiskScores, groupProfile);
    const adjustedFireRisk = adjustedRiskScores.fire * 10;
    const adjustedAirQualityRisk = adjustedRiskScores.airQuality * 10;
    const adjustedWeatherAlertness = adjustedRiskScores.weather * 10;
    const overallSafety = Math.max(0, 10 - adjustedRiskScores.overall);
    const tempsWindow = weatherDaily.temperature_2m_max || [];
    const metrics = [
      {
        label: "Fire Risk",
        value: 100 - adjustedFireRisk,
        note: "Fire risk index based on hotspot detections, drought severity, and NOAA fire weather outlook.",
        icon: "🔥",
      },
      {
        label: "Air Quality",
        value: 100 - adjustedAirQualityRisk,
        note: `Air quality index today is ${airHourly[0] || 50}. Monitor for smoke and particulates.`,
        icon: "💨",
        rawAqi: Math.round(avgAqi),
      },
      {
        label: "Weather Alertness",
        value: 100 - adjustedWeatherAlertness,
        note: "Weather hazard index from storm codes, heavy precipitation, extreme winds, and NWS active alerts.",
        icon: "⛈️",
      },
      {
        label: "Bear Risk",
        value: 100 - bearRisk,
        note: "Bear activity risk based on elevation, terrain, season, and recent iNaturalist sightings.",
        icon: "🐻",
      },
    ];

    const rainCodes = new Set([51, 53, 55, 61, 63, 65, 67, 80, 81, 82]);
    const thunderCodes = new Set([95, 96, 99]);
    const weatherCtx: WeatherContext = {
      hasRain:
        weatherCodeWindow.some((c: number) => rainCodes.has(c)) ||
        precipitationWindow.some((p: number) => p > 1),
      highFireRisk: fireRisk >= 30,
      isCold: (weatherDaily.temperature_2m_max || []).some((t: number) => t < 55),
      isHighAltitude: (location?.elevation ?? 0) > 2500,
      hasThunderstorm: weatherCodeWindow.some((c: number) => thunderCodes.has(c)),
      highBearRisk: bearDangerRating >= 3,
      poorAirQuality: !airQualityUnavailable && airQualityRisk > 40,
    };

    return {
      report: {
        overallScore: overallSafety,
        status: getRiskLevel(overallSafety),
        metrics,
      },
      temps: tempsWindow,
      fireRisk: adjustedFireRisk,
      fireDetails,
      airRisk: adjustedAirQualityRisk,
      airQualityRating,
      airQualityLabel,
      airQualityDetails,
      weatherHazardScore: adjustedWeatherAlertness,
      weatherHazardLabel: getExtremeWeatherLabel(adjustedWeatherAlertness),
      weatherHazardDetails,
      weatherRisk: adjustedWeatherAlertness,
      bearRisk,
      bearDangerRating,
      bearRiskDetails,
      terrainDifficultyScore,
      terrainDifficultyLevel,
      terrainElevationDetails,
      terrainLabel,
      nwsAlertEvents,
      airQualityUnavailable: !!airQualityUnavailable,
      forecastNotice,
      forecastWindowUsed,
      weatherCtx,
    };
  } catch (error) {
    throw error;
  }
}

type CampgroundSearchRow = {
  facilityId: string;
  name: string;
  distanceMiles: number;
  amenityMatchScore: number;
  highlights: string[];
  bookUrl: string;
  overviewBlurb: string;
  ridbAmenityTags: string[];
  imageUrl: string | null;
  safetyScore: number;
  safetyScoreUsesTripOrigin: boolean;
  safetyScoreFallback: boolean;
};

export default function Home() {
  const [wizardStep, setWizardStep] = useState(0);
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [companions, setCompanions] = useState<string[]>([]);
  const [companionDetails, setCompanionDetails] = useState("");
  const [healthConcerns, setHealthConcerns] = useState<string[]>([]);
  const [healthDetails, setHealthDetails] = useState("");
  const [reportGeneratedAt, setReportGeneratedAt] = useState("");
  const [reportView, setReportView] = useState<"main" | "packing" | "bookings">("main");
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [chartData, setChartData] = useState<Omit<ReportResult, "report"> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<Record<string, boolean>>({});
  const [isScouting, setIsScouting] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistSection[] | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addressStepError, setAddressStepError] = useState<string | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [campgroundRows, setCampgroundRows] = useState<CampgroundSearchRow[]>([]);
  const [campgroundsMeta, setCampgroundsMeta] = useState<{
    loading: boolean;
    message: string | null;
    attribution: string | null;
  }>({ loading: false, message: null, attribution: null });

  const normalizedOverallScore = report
    ? report.overallScore > 10
      ? report.overallScore / 10
      : report.overallScore
    : 7.2;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!report) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [reportView, report]);

  const loadCampgroundsFromScout = async (tripReport: SafetyReport) => {
    const trimmed = address.trim();
    const tripSafetyScore =
      typeof tripReport.overallScore === "number" && Number.isFinite(tripReport.overallScore)
        ? tripReport.overallScore > 10
          ? tripReport.overallScore / 10
          : tripReport.overallScore
        : 0;

    if (!trimmed || !startDate || !endDate) {
      setCampgroundRows([]);
      setCampgroundsMeta({
        loading: false,
        message: "Run Scout with a verified address and trip dates to rank nearby Recreation.gov campgrounds.",
        attribution: null,
      });
      return;
    }

    setCampgroundsMeta((m) => ({ ...m, loading: true, message: null }));
    try {
      const res = await fetch("/api/campgrounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: trimmed,
          startDate,
          endDate,
          distance: 10,
          companions,
          healthConcerns,
          tripSafetyScore,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        code?: string;
        message?: string;
        results?: CampgroundSearchRow[];
        attribution?: string;
      };
      const rowsRaw = Array.isArray(j.results) ? j.results : [];
      const rows: CampgroundSearchRow[] = rowsRaw.map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
          facilityId: String(r.facilityId ?? ""),
          name: String(r.name ?? ""),
          distanceMiles: typeof r.distanceMiles === "number" ? r.distanceMiles : 0,
          amenityMatchScore: typeof r.amenityMatchScore === "number" ? r.amenityMatchScore : 0,
          highlights: Array.isArray(r.highlights) ? (r.highlights as string[]) : [],
          bookUrl: String(r.bookUrl ?? "#"),
          overviewBlurb: String(r.overviewBlurb ?? ""),
          ridbAmenityTags: Array.isArray(r.ridbAmenityTags)
            ? (r.ridbAmenityTags as string[]).filter((t) => typeof t === "string")
            : [],
          imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : null,
          safetyScore:
            typeof r.safetyScore === "number" && Number.isFinite(r.safetyScore)
              ? r.safetyScore
              : tripSafetyScore,
          safetyScoreUsesTripOrigin: r.safetyScoreUsesTripOrigin === true,
          safetyScoreFallback: r.safetyScoreFallback === true,
        };
      });
      setCampgroundRows(rows);
      let message: string | null =
        j.ok === false && typeof j.message === "string"
          ? j.message
          : !res.ok && typeof j.message === "string"
            ? j.message
            : null;
      if (j.ok === true && rows.length === 0 && !message) {
        message =
          "No federal campgrounds matched this search in RIDB for your area. Try a different address or browse Recreation.gov.";
      }
      setCampgroundsMeta({
        loading: false,
        message,
        attribution: typeof j.attribution === "string" ? j.attribution : null,
      });
    } catch {
      setCampgroundRows([]);
      setCampgroundsMeta({
        loading: false,
        message: "Could not load campground suggestions. Check your connection and try again.",
        attribution: null,
      });
    }
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setAddressStepError(null);
    setShowSuggestions(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(value)}`);
        const data: string[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch { setSuggestions([]); }
    }, 300);
  };

  const tripDays =
    startDate && endDate
      ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0;

  const toggleCompanion = (tag: string) => {
    if (tag === "Just me") {
      setCompanions((prev) => (prev.includes("Just me") ? [] : ["Just me"]));
      return;
    }
    setCompanions((prev) => {
      const withoutJustMe = prev.filter((t) => t !== "Just me");
      return withoutJustMe.includes(tag)
        ? withoutJustMe.filter((t) => t !== tag)
        : [...withoutJustMe, tag];
    });
  };

  const toggleHealth = (tag: string) => {
    setHealthConcerns((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const goToDatesStep = async () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    setAddressStepError(null);
    setIsValidatingAddress(true);
    try {
      const res = await fetch(`/api/validate-address?address=${encodeURIComponent(trimmed)}`);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (data.ok) {
        setWizardStep(1);
        return;
      }
      setAddressStepError(
        typeof data.error === "string" && data.error.trim()
          ? data.error.trim()
          : "We could not verify that address. Try refining it or pick a suggestion from the list."
      );
    } catch {
      setAddressStepError("Could not verify that address right now. Check your connection and try again.");
    } finally {
      setIsValidatingAddress(false);
    }
  };

  const runScoutTrip = async () => {
    const distanceNum = 10;
    setErrorMessage(null);
    setReport(null);
    setChartData(null);
    setChecklist(null);
    setCampgroundRows([]);
    setCampgroundsMeta({ loading: false, message: null, attribution: null });
    setExpandedMetric({});
    setIsScouting(true);
    const { vulnerableMembers, medicalConditions } = groupProfileFromWizardSelections(companions, healthConcerns);

    try {
      const { report: nextReport, ...meta } = await generateSafetyReportFromAPI(
        address,
        startDate,
        endDate,
        distanceNum,
        {
          vulnerableMembers,
          medicalConditions,
        }
      );
      setReport(nextReport);
      setReportGeneratedAt(new Date().toISOString());
      setChartData(meta);
      setExpandedMetric({});
      const tripType = deriveTripType(startDate, endDate);
      const profile = buildProfile(companions, healthConcerns, companionDetails, healthDetails);
      setChecklist(recommendGear(profile, tripType, meta.weatherCtx));
      void loadCampgroundsFromScout(nextReport);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Something went wrong.";
      const { report: fallbackReport, ...fallbackMeta } = buildDegradedReportResult(
        startDate,
        endDate,
        {
          vulnerableMembers,
          medicalConditions,
        },
        `We couldn't finish loading your trip (${detail}). The dashboard below is an approximate view until you try again.`
      );
      setReport(fallbackReport);
      setReportGeneratedAt(new Date().toISOString());
      setChartData(fallbackMeta);
      setExpandedMetric({});
      const tripType = deriveTripType(startDate, endDate);
      const profile = buildProfile(companions, healthConcerns, companionDetails, healthDetails);
      setChecklist(recommendGear(profile, tripType, fallbackMeta.weatherCtx));
      setCampgroundRows([]);
      setCampgroundsMeta({ loading: false, message: null, attribution: null });
    } finally {
      setIsScouting(false);
    }
  };

  const resetTripPlanner = () => {
    setReport(null);
    setChartData(null);
    setChecklist(null);
    setCampgroundRows([]);
    setCampgroundsMeta({ loading: false, message: null, attribution: null });
    setErrorMessage(null);
    setAddressStepError(null);
    setExpandedMetric({});
    setWizardStep(0);
    setCompanionDetails("");
    setHealthDetails("");
    setReportGeneratedAt("");
    setReportView("main");
  };


  const overall = report ? overallPill(normalizedOverallScore) : null;
  const terrainDifficultyLevel = chartData?.terrainDifficultyLevel ?? 1;
  const terrainTone = wildlifeMatrixTone(terrainDifficultyLevel);
  const overallVerdict = overallTripVerdict(normalizedOverallScore);
  const keepInMind = buildKeepInMindItems(chartData, terrainDifficultyLevel);

  return (
    <div className="min-h-screen bg-[#fffaf4] text-[#1a1c1e]">
      <div className="scout-main-bg relative min-h-screen">
        <div
          className={`mx-auto flex w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-7 ${report ? "pb-10 pt-0 sm:pb-12 lg:pb-14" : "min-h-screen justify-between py-8 sm:py-10 lg:py-12"}`}
        >
          {!report && (
            <header className="text-center">
              <div className="flex items-center gap-2 sm:gap-3 justify-center">
                <span className="text-4xl leading-none sm:text-5xl lg:text-6xl" aria-hidden>
                  ⛺️
                </span>
                <p
                  className={`font-display tracking-tight text-[#1a1c1e] text-4xl font-extrabold sm:text-5xl lg:text-6xl`}
                >
                  Scout
                </p>
              </div>
              <div
                className="mx-auto mt-3 flex w-full max-w-lg items-center gap-2.5 px-2 sm:mt-4 sm:max-w-2xl sm:gap-3"
                role="presentation"
              >
                <span
                  className="h-0.5 min-w-8 flex-1 rounded-full bg-[#ea8a12] opacity-90 sm:min-w-12"
                  aria-hidden
                />
                <p className="font-display shrink-0 text-base font-extrabold tracking-tight text-[#1a1c1e] sm:text-lg">
                  Camp safer, Scout first.
                </p>
                <span
                  className="h-0.5 min-w-8 flex-1 rounded-full bg-[#ea8a12] opacity-90 sm:min-w-12"
                  aria-hidden
                />
              </div>
              {wizardStep === 0 ? (
                <p className="font-display mx-auto mt-4 max-w-xl px-2 text-sm font-medium leading-relaxed text-[#888780] sm:mt-5 sm:text-base">
                  Enter your trip details and get a personalized safety score, packing list, and campsite
                  recommendations.
                </p>
              ) : null}
            </header>
          )}

          {!report && (
            <div
              className="font-display flex flex-1 flex-col items-center justify-center px-2 pb-8 pt-6 sm:pt-10"
              role="region"
              aria-label="Trip planner"
            >
              <div className="w-full max-w-2xl space-y-10 text-center sm:space-y-12">
                <div className={wizardStep === 0 ? "space-y-4" : ""}>
                  {wizardStep === 0 ? (
                    <p className="text-[clamp(1.05rem,3.25vw,1.55rem)] font-extrabold tracking-tight text-[#1a1c1e] sm:text-[clamp(1.1rem,2.75vw,1.65rem)]">
                      Welcome Camper!
                    </p>
                  ) : null}
                  <div className={`flex justify-center gap-2.5 ${wizardStep === 0 ? "pt-1" : ""}`} aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          i === wizardStep ? "w-10 bg-[#ea8a12]" : "w-2 bg-[#eadfcd]"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {wizardStep === 0 && (
                  <div className="flex flex-col gap-8 sm:gap-10">
                    <p className="text-[clamp(1.15rem,3.5vw,1.85rem)] font-bold leading-snug text-[#3d4249]">
                      Where are you headed?
                    </p>
                    <div ref={suggestionsRef} className="relative w-full text-left">
                      <label className="relative flex min-w-0 w-full items-center gap-4 rounded-2xl border-2 border-[#eadfcd]/90 bg-[#fffcf7]/70 px-5 py-4 shadow-sm backdrop-blur-sm transition focus-within:border-[#d97706]/60 focus-within:ring-4 focus-within:ring-[#f7d6ab]/50 sm:px-6 sm:py-5">
                        <PinIcon className="h-7 w-7 shrink-0 text-[#d97706] sm:h-8 sm:w-8" />
                        <input
                          type="text"
                          autoComplete="street-address"
                          value={address}
                          onChange={(e) => handleAddressChange(e.target.value)}
                          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                          placeholder="Campsite or trailhead address"
                          className="min-w-0 flex-1 bg-transparent text-lg text-[#1a1c1e] outline-none placeholder:text-[#9aa0a8] sm:text-xl"
                        />
                      </label>
                      {showSuggestions && (
                        <ul className="absolute left-0 right-0 top-full z-50 mt-2 max-h-52 overflow-y-auto rounded-2xl border border-[#eadfcd]/90 bg-[#fffcf9]/95 py-1.5 text-base shadow-lg backdrop-blur-md sm:text-lg">
                          {suggestions.map((s, i) => (
                            <li
                              key={i}
                              onMouseDown={() => {
                                setAddress(s);
                                setSuggestions([]);
                                setShowSuggestions(false);
                                setAddressStepError(null);
                              }}
                              className="cursor-pointer truncate px-5 py-3 text-[#1a1c1e] transition hover:bg-[#fff3e0]/80"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {addressStepError ? (
                      <p className="text-center text-sm font-medium leading-relaxed text-red-700 sm:text-base">
                        {addressStepError}
                      </p>
                    ) : null}
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        disabled={!address.trim() || isValidatingAddress}
                        onClick={() => void goToDatesStep()}
                        className="rounded-full bg-[#ea8a12] px-12 py-4 text-base font-extrabold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:px-14 sm:py-4 sm:text-lg"
                      >
                        {isValidatingAddress ? "Checking…" : "Next"}
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 1 && (
                  <div className="flex flex-col gap-8 sm:gap-10">
                    <p className="text-[clamp(1.15rem,3.5vw,1.85rem)] font-bold leading-snug text-[#3d4249]">
                      When are you going?
                    </p>
                    <TripDateRangePicker
                      startDate={startDate}
                      endDate={endDate}
                      onRangeChange={(nextStart, nextEnd) => {
                        setStartDate(nextStart);
                        setEndDate(nextEnd);
                      }}
                      maxOffsetFromToday={15}
                    />
                    <p className="font-display text-sm font-medium leading-relaxed text-[#888780] sm:text-base">
                      Forecast-based scoring is strongest within the next week; the calendar only shows the next 16
                      days (today plus 15).
                    </p>
                    {(startDate || endDate) && (
                      <p className="text-sm text-[#6b7078] sm:text-base">
                        Trip window{" "}
                        <span className="font-semibold text-[#4f545c]">{formatRangeInput(startDate, endDate)}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-center gap-5 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddressStepError(null);
                          setWizardStep(0);
                        }}
                        className="rounded-full px-8 py-3.5 text-base font-bold text-[#6b7078] transition hover:bg-[#fff3e0]/60 hover:text-[#1a1c1e] sm:px-10 sm:py-4 sm:text-lg"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={!startDate || !endDate}
                        onClick={() => setWizardStep(2)}
                        className="rounded-full bg-[#ea8a12] px-12 py-4 text-base font-extrabold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:px-14 sm:text-lg"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="flex flex-col gap-8 sm:gap-10">
                    <div className="space-y-2">
                      <p className="text-[clamp(1.15rem,3.5vw,1.85rem)] font-bold leading-snug text-[#3d4249]">
                        Who&apos;s coming with you?
                      </p>
                      <p className="text-base text-[#888780] sm:text-lg">Select all that apply (optional).</p>
                    </div>
                    <div className="flex flex-col items-center gap-3 sm:gap-3.5">
                      {[COMPANION_TAGS.slice(0, 4), COMPANION_TAGS.slice(4)].map((row, rowIdx) => (
                        <div
                          key={rowIdx}
                          className="flex flex-wrap justify-center gap-3 sm:gap-3.5"
                        >
                          {row.map((tag) => {
                            const selected = companions.includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => toggleCompanion(tag)}
                                className={`rounded-full px-6 py-3.5 text-base font-bold transition sm:px-7 sm:py-4 sm:text-lg ${
                                  selected
                                    ? "bg-[#fff3e0] text-[#b45309] ring-2 ring-[#ea8a12]/60"
                                    : "bg-[#f5ebe0]/50 text-[#5f5450] ring-1 ring-[#eadfcd]/60 hover:bg-[#f0e4d4]/70"
                                }`}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div className="mx-auto w-full max-w-2xl pt-3 text-left">
                      <label htmlFor="companion-details" className="block text-base font-bold text-[#3d4249] sm:text-lg">
                        Further details <span className="font-semibold text-[#888780]">(optional)</span>
                      </label>
                      <textarea
                        id="companion-details"
                        rows={3}
                        value={companionDetails}
                        onChange={(e) => setCompanionDetails(e.target.value)}
                        placeholder="Ages, group size, pets…"
                        className="mt-3 min-h-[92px] w-full resize-y rounded-2xl border-2 border-[#eadfcd]/90 bg-[#fffcf7]/70 px-5 py-3 text-lg text-[#1a1c1e] outline-none placeholder:text-[#9aa0a8] focus:border-[#d97706]/60 focus:ring-4 focus:ring-[#f7d6ab]/50 sm:min-h-[100px] sm:px-6 sm:py-3.5 sm:text-xl"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-5 pt-2">
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className="rounded-full px-8 py-3.5 text-base font-bold text-[#6b7078] transition hover:bg-[#fff3e0]/60 hover:text-[#1a1c1e] sm:px-10 sm:py-4 sm:text-lg"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setWizardStep(3)}
                        className="rounded-full bg-[#ea8a12] px-12 py-4 text-base font-extrabold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] sm:px-14 sm:text-lg"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="flex flex-col gap-8 sm:gap-10">
                    <div className="space-y-2">
                      <p className="text-[clamp(1.15rem,3.5vw,1.85rem)] font-bold leading-snug text-[#3d4249]">
                        Any health considerations?
                      </p>
                      <p className="text-base text-[#888780] sm:text-lg">Select all that apply (optional).</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 sm:gap-3.5">
                      {HEALTH_TAGS.map((tag) => {
                        const selected = healthConcerns.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleHealth(tag)}
                            className={`rounded-full px-6 py-3.5 text-base font-bold transition sm:px-7 sm:py-4 sm:text-lg ${
                              selected
                                ? "bg-[#fff3e0] text-[#b45309] ring-2 ring-[#ea8a12]/60"
                                : "bg-[#f5ebe0]/50 text-[#5f5450] ring-1 ring-[#eadfcd]/60 hover:bg-[#f0e4d4]/70"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mx-auto w-full max-w-2xl pt-3 text-left">
                      <label htmlFor="health-details" className="block text-base font-bold text-[#3d4249] sm:text-lg">
                        Further details <span className="font-semibold text-[#888780]">(optional)</span>
                      </label>
                      <textarea
                        id="health-details"
                        rows={3}
                        value={healthDetails}
                        onChange={(e) => setHealthDetails(e.target.value)}
                        placeholder="Medications, allergies, other notes…"
                        className="mt-3 min-h-[92px] w-full resize-y rounded-2xl border-2 border-[#eadfcd]/90 bg-[#fffcf7]/70 px-5 py-3 text-lg text-[#1a1c1e] outline-none placeholder:text-[#9aa0a8] focus:border-[#d97706]/60 focus:ring-4 focus:ring-[#f7d6ab]/50 sm:min-h-[100px] sm:px-6 sm:py-3.5 sm:text-xl"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-5 pt-2">
                      <button
                        type="button"
                        onClick={() => setWizardStep(2)}
                        className="rounded-full px-8 py-3.5 text-base font-bold text-[#6b7078] transition hover:bg-[#fff3e0]/60 hover:text-[#1a1c1e] sm:px-10 sm:py-4 sm:text-lg"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={isScouting}
                        onClick={() => void runScoutTrip()}
                        className={`rounded-full px-12 py-4 text-base font-extrabold text-white shadow-md transition active:scale-[0.98] sm:px-14 sm:text-lg ${
                          isScouting ? "cursor-not-allowed bg-[#f1a64a]" : "bg-[#ea8a12] hover:brightness-110"
                        }`}
                      >
                        {isScouting ? "Scouting…" : "Scout my trip!"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {errorMessage && (
            <div
              className={`rounded-xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-center text-sm text-red-800 backdrop-blur-sm ${
                report ? "mt-6" : "mx-auto mt-4 max-w-md"
              }`}
            >
              {errorMessage}
            </div>
          )}

          {report && (
            <section className="scout-report-section mt-0">
              <nav className="fixed inset-x-0 top-0 z-40 border-b border-[#3a2a1c] bg-[#2c1f14] px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] text-[#f5f0e8] sm:px-6 sm:py-3.5 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
                    <button
                      type="button"
                      onClick={() => setReportView("main")}
                      className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-left transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8600A] sm:gap-2"
                      aria-label="Go to trip dashboard"
                    >
                      <span className="text-2xl sm:text-3xl" aria-hidden>
                        ⛺️
                      </span>
                      <span className="font-display truncate text-xl font-semibold tracking-tight text-[#f5f0e8] sm:text-3xl">
                        Scout
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={resetTripPlanner}
                      className="shrink-0 rounded-2xl bg-[#E8600A] px-3.5 py-1.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 sm:hidden"
                    >
                      New trip
                    </button>
                  </div>
                  <div className="-mx-4 flex min-w-0 items-center gap-4 overflow-x-auto overscroll-x-contain px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-end sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      onClick={() => setReportView("main")}
                      className={`shrink-0 border-b-2 px-1 pb-1 text-sm font-semibold transition sm:text-base ${
                        reportView === "main"
                          ? "border-[#E8600A] text-[#f5f0e8]"
                          : "border-transparent text-[rgba(245,240,232,0.35)] hover:text-[#f5f0e8]"
                      }`}
                    >
                      Trip Dashboard
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportView("packing")}
                      className={`shrink-0 border-b-2 px-1 pb-1 text-sm font-semibold transition sm:text-base ${
                        reportView === "packing"
                          ? "border-[#E8600A] text-[#f5f0e8]"
                          : "border-transparent text-[rgba(245,240,232,0.35)] hover:text-[#f5f0e8]"
                      }`}
                    >
                      Packing List
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportView("bookings")}
                      className={`shrink-0 border-b-2 px-1 pb-1 text-sm font-semibold transition sm:text-base ${
                        reportView === "bookings"
                          ? "border-[#E8600A] text-[#f5f0e8]"
                          : "border-transparent text-[rgba(245,240,232,0.35)] hover:text-[#f5f0e8]"
                      }`}
                    >
                      Book a Site
                    </button>
                    <button
                      type="button"
                      onClick={resetTripPlanner}
                      className="hidden shrink-0 rounded-[20px] bg-[#E8600A] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 sm:inline-flex"
                    >
                      Plan another trip
                    </button>
                  </div>
                </div>
              </nav>

              {reportView === "packing" ? (
                <div className="mx-auto mt-4 w-full max-w-7xl space-y-5 px-4 sm:mt-6 sm:px-6 lg:px-8">
                  {checklist && checklist.length > 0 ? (
                    <GearChecklist sections={checklist} />
                  ) : (
                    <p className="mt-8 text-center text-sm text-[#888780]">No packing list generated yet.</p>
                  )}
                </div>
              ) : reportView === "bookings" ? (
                <div className="mx-auto mt-4 w-full max-w-7xl space-y-5 px-4 sm:mt-6 sm:px-6 lg:px-8">
                  <header className="border-b border-[#eadfcd] border-l-4 border-l-[#ea8a12] pb-5 pl-5 text-left sm:pl-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8 lg:gap-10">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-[#ea8a12] sm:text-xs">
                          Nearby campgrounds
                        </p>
                        <h2 className="font-display text-[1.65rem] font-extrabold leading-[1.1] tracking-tight text-[#1a1c1e] sm:text-3xl lg:text-[2rem]">
                          Book a site
                        </h2>
                        <p className="pt-1 text-sm leading-snug text-[#5c534c] sm:text-[0.9375rem] lg:text-base">
                          Recommendations are tailored to your trip details, companions, and safety profile, then ordered by
                          amenity and fit. Always confirm dates and availability on Recreation.gov before you book.
                        </p>
                      </div>
                      {report ? (
                        <div className="shrink-0 border-t border-[#eadfcd] pt-4 sm:border-t-0 sm:pt-0 sm:text-right">
                          <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-[#ea8a12] sm:text-xs">
                            Your trip score
                          </p>
                          <div className="mt-1 flex flex-wrap items-end gap-2 sm:justify-end">
                            <p className="font-display text-3xl font-bold leading-none tracking-tight text-[#1a1c1e] sm:text-4xl">
                              {normalizedOverallScore.toFixed(1)}
                            </p>
                            <span className="pb-1 text-base text-[#888780] sm:text-lg">/ 10</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </header>

                  {campgroundsMeta.loading ? (
                    <div className="flex items-center justify-center gap-3 py-10 text-sm text-[#8b8e94]">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                      Loading nearby campgrounds…
                    </div>
                  ) : null}

                  {campgroundsMeta.message ? (
                    <div
                      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed sm:text-base ${
                        campgroundRows.length === 0
                          ? "border-amber-200/90 bg-amber-50/90 text-[#5c4518]"
                          : "border-[#eadfcd] bg-white/80 text-[#4f545c]"
                      }`}
                      role="status"
                    >
                      {campgroundsMeta.message}
                    </div>
                  ) : null}

                  {campgroundRows.length > 0 ? (
                    <ol className="space-y-3">
                      {campgroundRows.map((row, idx) => {
                        return (
                          <li key={row.facilityId}>
                            <a
                              href={row.bookUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group block rounded-2xl border border-[#f0d5b1] bg-white shadow-sm transition hover:border-[#ea8a12]/40 hover:shadow-md"
                            >
                              <div className="flex min-h-[7.5rem] gap-0 sm:min-h-[8.5rem] lg:min-h-[9rem]">
                                <div className="relative w-36 shrink-0 self-stretch sm:w-44 lg:w-52">
                                  {row.imageUrl ? (
                                    <img
                                      src={row.imageUrl}
                                      alt=""
                                      className="h-full min-h-[7.5rem] w-full rounded-l-2xl object-cover sm:min-h-[8.5rem] lg:min-h-[9rem]"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div
                                      className="flex h-full min-h-[7.5rem] w-full items-center justify-center rounded-l-2xl bg-[#f5ebe0] text-3xl sm:min-h-[8.5rem] sm:text-4xl lg:min-h-[9rem]"
                                      aria-hidden
                                    >
                                      ⛺️
                                    </div>
                                  )}
                                  <span className="absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#ea8a12] text-xs font-extrabold text-white shadow sm:left-3 sm:top-3">
                                    {idx + 1}
                                  </span>
                                </div>

                                <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-5 lg:p-6">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-display text-base font-bold leading-snug text-[#1a1c1e] sm:text-lg lg:text-xl">
                                      {row.name}
                                    </p>

                                    <p className="mt-1 text-[11px] text-[#8b8e94] sm:text-xs">
                                      ~{row.distanceMiles} mi away
                                    </p>

                                    {row.ridbAmenityTags.length > 0 ||
                                    row.highlights.some(
                                      (h) => h.includes("restriction") && (h.includes("pet") || h.includes("dog"))
                                    ) ? (
                                      <div className="mt-2 space-y-1.5">
                                        {row.ridbAmenityTags.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                            {row.ridbAmenityTags.map((tag) => (
                                              <span
                                                key={`${row.facilityId}-${tag}`}
                                                className="inline-flex items-center gap-1 rounded-full border border-[#e8dcc8] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#5c534c] sm:px-2.5 sm:py-1 sm:text-xs"
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        ) : null}
                                        {row.highlights.some(
                                          (h) =>
                                            h.includes("restriction") && (h.includes("pet") || h.includes("dog"))
                                        ) ? (
                                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 sm:px-3 sm:py-1.5 sm:text-sm">
                                            ⚠️ Pet restrictions
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}

                                    {row.overviewBlurb ? (
                                      <p className="mt-2 text-xs leading-relaxed text-[#5c534c] sm:text-sm">
                                        {row.overviewBlurb}
                                      </p>
                                    ) : null}
                                  </div>

                                  <div className="flex w-full shrink-0 flex-col items-center gap-2 sm:ml-auto sm:w-max">
                                    <p className="text-center text-[10px] font-bold uppercase tracking-wide text-[#8b8e94] sm:text-xs">
                                      Safety score
                                    </p>
                                    <div className="relative h-24 w-24 sm:h-28 sm:w-28">
                                      <svg
                                        viewBox="0 0 112 112"
                                        className="h-full w-full -rotate-90"
                                        aria-hidden
                                      >
                                        <circle cx="56" cy="56" r="46" stroke="#e2e8f0" strokeWidth="10" fill="none" />
                                        <circle
                                          cx="56"
                                          cy="56"
                                          r="46"
                                          stroke={`url(#camp-safety-gauge-${(row.facilityId || `row-${idx}`).replace(/[^a-zA-Z0-9_-]/g, "_")})`}
                                          strokeWidth="10"
                                          fill="none"
                                          strokeLinecap="round"
                                          strokeDasharray={2 * Math.PI * 46}
                                          strokeDashoffset={2 * Math.PI * 46 * (1 - row.safetyScore / 10)}
                                        />
                                        <defs>
                                          <linearGradient
                                            id={`camp-safety-gauge-${(row.facilityId || `row-${idx}`).replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                                            x1="0%"
                                            y1="0%"
                                            x2="100%"
                                            y2="0%"
                                          >
                                            <stop offset="0%" stopColor="#dc2626" />
                                            <stop offset="55%" stopColor="#ea8a12" />
                                            <stop offset="100%" stopColor="#fbbf24" />
                                          </linearGradient>
                                        </defs>
                                      </svg>
                                      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#6b7078] sm:text-base">
                                        {row.safetyScore.toFixed(1)}
                                      </span>
                                    </div>
                                    {row.safetyScoreUsesTripOrigin || row.safetyScoreFallback ? (
                                      <p className="max-w-[14rem] text-center text-[11px] text-[#b0a89e] sm:text-xs">
                                        {row.safetyScoreUsesTripOrigin ? (
                                          <span>(same area as your trip)</span>
                                        ) : (
                                          <span>(conditions unavailable; trip score shown)</span>
                                        )}
                                      </p>
                                    ) : null}
                                    <div className="flex w-full justify-end pt-1">
                                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#ea8a12] px-3.5 py-2 text-xs font-bold text-white transition group-hover:brightness-110 sm:px-4 sm:text-sm">
                                        Book on Recreation.gov
                                        <svg
                                          className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth={2.5}
                                          aria-hidden
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                          />
                                        </svg>
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </a>
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}

                  {!campgroundsMeta.loading ? (
                    <div className="mx-auto max-w-4xl rounded-xl border border-[#eadfcd] bg-[#faf8f5] px-4 py-3 sm:px-5 sm:py-4">
                      <p className="text-center text-[11px] leading-relaxed text-[#6b6560] sm:text-xs">
                        {campgroundsMeta.attribution ??
                          "Campground information comes from Recreation.gov and RIDB. Scout does not process payments; booking links open Recreation.gov in a new tab."}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  {chartData?.conditionsNotice ? (
                    <div
                      className="mt-5 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-[#5c4518] sm:px-5 sm:text-base"
                      role="status"
                    >
                      {chartData.conditionsNotice}
                    </div>
                  ) : null}
                  <div className={chartData?.conditionsNotice ? "mt-4 sm:mt-6" : "mt-4 sm:mt-5"}>
                    <header className="border-b border-[#eadfcd] border-l-4 border-l-[#ea8a12] pb-5 pl-4 text-left sm:pl-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-[#ea8a12] sm:text-xs">
                            Live overview
                          </p>
                          <h2 className="font-display text-[1.65rem] font-extrabold leading-[1.1] tracking-tight text-[#1a1c1e] sm:text-3xl lg:text-[2rem]">
                            Trip Dashboard
                          </h2>
                          <div className="flex flex-col gap-2.5 pt-1 text-sm leading-snug text-[#5c534c] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 sm:text-[0.9375rem]">
                            {address.trim() ? (
                              <span className="flex min-w-0 items-start gap-2">
                                <svg
                                  className="mt-0.5 h-4 w-4 shrink-0 text-[#ea8a12]"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  aria-hidden
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                  />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="min-w-0 font-medium text-[#3d3834]">{address.trim()}</span>
                              </span>
                            ) : null}
                            {startDate && endDate ? (
                              <span className="flex items-start gap-2 sm:items-center">
                                <svg
                                  className="mt-0.5 h-4 w-4 shrink-0 text-[#ea8a12] sm:mt-0"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  aria-hidden
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                                <span className="font-medium text-[#3d3834]">
                                  {formatRangeInput(startDate, endDate)}
                                  {tripDays > 0 ? (
                                    <span className="font-normal text-[#7a726c]">
                                      {" "}
                                      · {tripDays} {tripDays === 1 ? "day" : "days"}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {reportGeneratedAt ? (
                          <p className="shrink-0 text-[11px] leading-tight text-[#6b6560] sm:text-right sm:text-xs sm:leading-snug">
                            <span className="font-semibold uppercase tracking-wide text-[#ea8a12]">Scouted</span>
                            <br />
                            <time className="text-[#5c534c]" dateTime={reportGeneratedAt}>
                              {formatReportTimestamp(reportGeneratedAt)}
                            </time>
                          </p>
                        ) : null}
                      </div>
                    </header>
                  </div>
                  <section className="mt-5">
                    <h3 className="font-display border-b-2 border-[#ea8a12] pb-1.5 text-left text-lg font-extrabold tracking-tight text-[#1a1c1e] sm:text-xl">
                      Safety Breakdown
                    </h3>
                    <div className="mt-3 flex flex-col gap-2.5 xl:flex-row xl:items-stretch xl:gap-2.5">
                <article className="flex min-h-[200px] flex-col justify-between rounded-2xl border border-[#f0c084] bg-gradient-to-b from-[#fff3e0] to-[#ffe8cc] p-3 shadow-sm ring-1 ring-[#f7d6ab] sm:p-4 xl:w-[260px] xl:self-stretch">
                  <div>
                    <p className="font-display inline-block text-base font-bold text-[#4a3426]">
                      Overall Safety Score
                    </p>
                    <div className="mt-2 flex flex-wrap items-end justify-center gap-2 sm:justify-start">
                      <p className="font-display text-3xl font-bold leading-none tracking-tight text-[#1a1c1e] sm:text-4xl">
                        {normalizedOverallScore.toFixed(1)}
                      </p>
                      <span className="pb-1.5 text-base text-[#888780]">/ 10</span>
                      {overall ? (
                        <span
                          className={`mb-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${overall.className}`}
                        >
                          {overall.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-center text-xs font-medium text-[#8b8e94] sm:text-left">
                      10 is considered safer; 1 is more dangerous.
                    </p>
                    <div className="mt-3 space-y-2.5">
                      <p
                        className={`text-center font-display text-sm font-bold leading-snug sm:text-left ${overallVerdict.className}`}
                      >
                        {overallVerdict.headline}
                      </p>
                      {keepInMind.length > 0 ? (
                        <div>
                          <p className="text-center text-[11px] font-bold uppercase tracking-wide text-[#4a3426] sm:text-left">
                            Things to keep in mind
                          </p>
                          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-snug text-[#4a3426] sm:pl-5">
                            {keepInMind.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <p className="text-center text-[11px] leading-snug text-[#6b6560] sm:text-left">
                        Scout scores are approximations based on real-time data. Please check conditions yourself
                        before heading out.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-center">
                    <div className="relative h-24 w-24">
                      <svg viewBox="0 0 112 112" className="h-24 w-24 -rotate-90" aria-hidden>
                        <circle cx="56" cy="56" r="46" stroke="#e2e8f0" strokeWidth="10" fill="none" />
                        <circle
                          cx="56"
                          cy="56"
                          r="46"
                          stroke="url(#overallGaugeGradient)"
                          strokeWidth="10"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 46}
                          strokeDashoffset={2 * Math.PI * 46 * (1 - normalizedOverallScore / 10)}
                        />
                        <defs>
                          <linearGradient id="overallGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#dc2626" />
                            <stop offset="55%" stopColor="#ea8a12" />
                            <stop offset="100%" stopColor="#fbbf24" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[#6b7078]">
                        {normalizedOverallScore.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </article>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-2.5">
                  {report.metrics
                    .filter((metric) => ["Fire Risk", "Air Quality", "Weather Alertness"].includes(metric.label))
                    .map((metric) => {
                    const primary = metricPrimary(metric);
                    const secondary = metricSecondary(metric);
                    const isExpanded = Boolean(expandedMetric[metric.label]);
                    const details =
                      metric.label === "Fire Risk"
                        ? chartData?.fireDetails ?? detailTextByMetric[metric.label] ?? []
                        : metric.label === "Air Quality"
                          ? chartData?.airQualityDetails ?? detailTextByMetric[metric.label] ?? []
                          : chartData?.weatherHazardDetails ?? detailTextByMetric[metric.label] ?? [];

                    return (
                      <article
                        key={metric.label}
                        className="flex h-full min-h-[200px] flex-col rounded-2xl border border-[#f0d5b1] bg-[#fff7ec] p-3 shadow-sm sm:p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-sm font-bold text-[#1a1c1e] sm:text-base">
                            <span className="mr-1">{metric.icon}</span>
                            {metric.label === "Fire Risk"
                              ? "Fire Risk Level"
                              : metric.label === "Air Quality"
                                ? "Air Quality Index"
                                : "Weather Hazard Index"}
                          </p>
                          {!(metric.label === "Air Quality" && chartData?.airQualityUnavailable) && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${pillToneForLabel(secondary.pill)}`}
                            >
                              {secondary.pill}
                            </span>
                          )}
                        </div>
                        <p className="font-display mt-3 text-2xl font-bold tracking-tight text-[#1a1c1e] sm:text-3xl">
                          {metric.label === "Air Quality"
                            ? chartData?.airQualityUnavailable
                              ? "N/A"
                              : chartData?.airQualityLabel ?? primary.value
                            : metric.label === "Weather Alertness"
                              ? chartData?.weatherHazardLabel ?? primary.value
                            : primary.value}
                        </p>
                        <p className="mt-1 text-xs text-[#6b7078]">
                          {metric.label === "Air Quality" && chartData?.airQualityUnavailable
                            ? "Air quality forecasts are only available 5 days ahead (CAMS model limit)"
                            : metric.label === "Air Quality"
                              ? "Trip average air quality"
                              : metric.label === "Weather Alertness"
                                ? "Based off potential extreme weather events, NWS alerts, and flood zone data"
                                : primary.subtitle}
                        </p>
                        {metric.label === "Fire Risk" && (
                          <div className="mt-2 flex items-center gap-2">
                            {Array.from({ length: 5 }).map((_, idx) => {
                              const fireLevel = parseInt(primary.value.replace("Risk ", ""), 10);
                              return (
                                <span
                                  key={idx}
                                  className={`h-2.5 flex-1 rounded-full ${idx < fireLevel ? "bg-[#ea8a12]" : "bg-[#e5e7eb]"}`}
                                  aria-hidden
                                />
                              );
                            })}
                          </div>
                        )}
                        {metric.label === "Fire Risk" && (
                          <p className="mt-2 text-xs text-[#8b8e94]">1 = little to no risk, 5 = high wildfire risk.</p>
                        )}
                        <p className="mt-2 text-xs text-[#8b8e94]">
                          {metric.label === "Fire Risk"
                            ? ""
                            : metric.label === "Air Quality"
                            ? ""
                            : metric.label === "Weather Alertness"
                              ? ""
                              : secondary.line}
                        </p>
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedMetric((previous) => ({
                                ...previous,
                                [metric.label]: !previous[metric.label],
                              }))
                            }
                            className="rounded-lg border border-orange-200 bg-orange-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-orange-700 uppercase transition hover:bg-orange-200/70"
                            aria-expanded={isExpanded}
                            aria-label={`Toggle ${metric.label} details`}
                          >
                            {isExpanded ? "Hide details" : "Details"}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="mt-3 border-t border-[#d9dde3] pt-2.5 text-sm text-[#374151]">
                            {metric.label === "Air Quality" ? (
                              <p>
                                Air forecast data is typically available and most accurate for up to about 5 days from today.
                              </p>
                            ) : (
                              <p>{metric.note}</p>
                            )}
                            <ul className={`${metric.label !== "Air Quality" ? "mt-2" : "mt-0"} list-disc space-y-1 pl-5`}>
                              {details.map((detail) => (
                                <li key={detail}>{detail}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </article>
                    );
                  })}

                  <article className="flex h-full min-h-[240px] flex-col rounded-2xl border border-[#f0d5b1] bg-[#fff7ec] p-4 shadow-sm sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-base font-bold text-[#1a1c1e] sm:text-lg">
                        <span className="mr-1">🧗</span>
                        Elevation &amp; Wildlife Risk
                      </p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${terrainTone.className}`}>
                        {terrainTone.label}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <p className="font-display text-3xl font-bold tracking-tight text-[#1a1c1e] sm:text-[2rem]">
                        Difficulty {terrainDifficultyLevel}
                      </p>
                      {chartData?.terrainElevationDetails?.[0]?.includes("below sea level") && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-700 uppercase ring-1 ring-blue-200">
                          Below Sea Level
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[#6b7078]">
                      Campground difficulty based on elevation and terrain.{chartData?.terrainLabel ? ` Terrain: ${chartData.terrainLabel}.` : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <span
                          key={idx}
                          className={`h-2.5 flex-1 rounded-full ${idx < terrainDifficultyLevel ? "bg-[#ea8a12]" : "bg-[#e5e7eb]"}`}
                          aria-hidden
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[#8b8e94]">1 = flat and easy, 5 = very rugged and challenging.</p>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setExpandedMetric((previous) => ({ ...previous, ["Terrain & Elevation"]: !previous["Terrain & Elevation"] }))}
                        className="rounded-lg border border-orange-200 bg-orange-100 px-3 py-1.5 text-xs font-semibold tracking-wide text-orange-700 uppercase transition hover:bg-orange-200/70"
                        aria-expanded={Boolean(expandedMetric["Terrain & Elevation"])}
                        aria-label="Toggle terrain and elevation details"
                      >
                        {expandedMetric["Terrain & Elevation"] ? "Hide details" : "Details"}
                      </button>
                    </div>
                    {expandedMetric["Terrain & Elevation"] && (
                      <div className="mt-4 border-t border-[#d9dde3] pt-3 text-base text-[#374151]">
                        <ul className="list-disc space-y-1 pl-5">
                          {(chartData?.terrainElevationDetails ?? []).map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>

                  </div>
                </div>
                  </section>

                  <section className="mt-10" aria-labelledby="whats-next-heading">
                    <h3
                      id="whats-next-heading"
                      className="font-display border-b-2 border-[#ea8a12] pb-1.5 text-left text-lg font-extrabold tracking-tight text-[#1a1c1e] sm:text-xl"
                    >
                      What&apos;s Next?
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#6b7078] sm:text-base">
                      You&apos;ve reviewed your safety breakdown. Finish planning with packing, then lock in a site
                      while availability is best.
                    </p>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <article className="flex min-h-[200px] flex-col justify-between rounded-2xl border border-[#f0d5b1] bg-[#fff7ec] p-5 shadow-sm sm:min-h-[220px] sm:p-6">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ea8a12] text-sm font-extrabold text-white">
                              1
                            </span>
                            <p className="font-display text-lg font-bold text-[#1a1c1e] sm:text-xl">Packing list</p>
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-[#5f5450] sm:text-base">
                            Check off gear matched to your group, health notes, and forecast before you load the car.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReportView("packing")}
                          className="mt-5 w-full rounded-full border-2 border-[#3a2a1c] bg-[#ea8a12] py-3 text-sm font-extrabold text-[#f5f0e8] shadow-[0_3px_0_#2c1f14,0_8px_20px_rgba(44,31,20,0.18)] transition hover:brightness-110 active:translate-y-px active:shadow-[0_2px_0_#2c1f14] sm:text-base"
                        >
                          Open packing list
                        </button>
                      </article>
                      <article className="flex min-h-[200px] flex-col justify-between rounded-2xl border border-[#f0d5b1] bg-[#fff7ec] p-5 shadow-sm sm:min-h-[220px] sm:p-6">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ea8a12] text-sm font-extrabold text-white">
                              2
                            </span>
                            <p className="font-display text-lg font-bold text-[#1a1c1e] sm:text-xl">Book a campsite</p>
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-[#5f5450] sm:text-base">
                            Compare federal, state, and reservable sites near your trip. Official calendars fill fast on
                            weekends.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReportView("bookings")}
                          className="mt-5 w-full rounded-full border-2 border-[#3a2a1c] bg-[#ea8a12] py-3 text-sm font-extrabold text-[#f5f0e8] shadow-[0_3px_0_#2c1f14,0_8px_20px_rgba(44,31,20,0.18)] transition hover:brightness-110 active:translate-y-px active:shadow-[0_2px_0_#2c1f14] sm:text-base"
                        >
                          View site recommendations
                        </button>
                      </article>
                    </div>
                  </section>
                </>
              )}
              {reportView === "main" && (tripDays > 5 || tripDays > 10) && (
                <p className="mt-4 text-xs text-[#8b8e94]">
                  Data coverage limits for this {tripDays}-day trip:{" "}
                  <span className="font-medium">Air quality:</span> 5 days ahead (CAMS model);{" "}
                  {tripDays > 10 && <><span className="font-medium">Fire proximity:</span> past 10 days (NASA FIRMS); </>}
                  <span className="font-medium">Wind, precipitation &amp; temperature:</span> 16 days ahead.
                </p>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
      />
    </svg>
  );
}
