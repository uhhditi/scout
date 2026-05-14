"use client";

import { useEffect, useRef, useState } from "react";
import { type SafetyMetric, type SafetyReport } from "@/lib/safetyReport";
import {
  calculateBearRisk,
  getBearDangerRating,
  calculateOverallSafetyScore,
  applyGroupMultipliers,
  type GroupProfile,
  type RiskScores,
  getRiskLevel,
} from "@/lib/riskScoring";
import { GearChecklist } from "@/app/components/gear-checklist";
import { TripDateRangePicker } from "@/app/components/trip-date-range-picker";
import { recommendGear, deriveTripType, type TripProfile, type WeatherContext, type ChecklistSection } from "@/lib/gearRecommender";
import { getExtremeWeatherLabel } from "@/lib/airQualityCopy";
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

function metricSecondary(metric: SafetyMetric) {
  const v = metric.value;
  switch (metric.label) {
    case "Fire Risk": {
      const level = Math.max(1, Math.min(5, Math.round(6 - (v / 100) * 5)));
      const pill =
        level <= 2 ? "Low" : level === 3 ? "Moderate" : level === 4 ? "High" : "Severe";
      return { line: "", pill };
    }
    case "Air Quality": {
      const aqi = Math.round(Math.max(28, Math.min(165, 175 - v * 1.25)));
      const pill = aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : "Sensitive";
      return { line: `${aqi} AQI`, pill };
    }
    case "Weather Alertness": {
      const temp = 52 + (v % 34);
      const pill = v >= 75 ? "Low" : v >= 55 ? "Moderate" : "High";
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
      const level = Math.max(1, Math.min(5, Math.round(6 - (v / 100) * 5)));
      return { value: `Risk ${level}`, subtitle: "Risk level based on current proximity to wildfire and adverse conditions." };
    }
    case "Air Quality": {
      const aqi = Math.round(Math.max(28, Math.min(165, 175 - v * 1.25)));
      return { value: `${aqi} AQI`, subtitle: "Current particulate estimate" };
    }
    case "Weather Alertness": {
      const temp = 52 + (v % 34);
      return { value: `${temp}° Temp`, subtitle: "Expected daytime high" };
    }
    case "Bear Risk":
      return { value: `Risk ${Math.round(100 - v)}`, subtitle: "Bear activity risk based on elevation and season" };
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
  } catch {
    return buildDegradedReportResult(
      startDate,
      endDate,
      groupProfile,
      "We could not reach the Scout conditions service. Check your connection and try again."
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    const detail = typeof body.error === "string" ? body.error : "";
    let notice =
      "Forecast and safety data could not be loaded. That often happens when trip dates are too far in the future, a data provider timed out, or the request could not be completed.";
    if (response.status === 404) {
      notice =
        "We could not place that address on the map. Try a fuller street address, a nearby town, or a landmark, then run Scout again.";
    } else if (response.status === 400) {
      notice = "Those trip dates look invalid. Pick a valid start and end date and try again.";
    }
    if (detail) {
      notice = `${notice} (${detail})`;
    }
    return buildDegradedReportResult(startDate, endDate, groupProfile, notice);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return buildDegradedReportResult(
      startDate,
      endDate,
      groupProfile,
      "The conditions service returned an unexpected response. Please try again in a moment."
    );
  }
  if (!data || typeof data !== "object") {
    return buildDegradedReportResult(
      startDate,
      endDate,
      groupProfile,
      "Trip conditions could not be interpreted. Please try again."
    );
  }

  try {
    return buildReportResultFromConditionsPayload(data as ConditionsPayload, startDate, endDate, groupProfile);
  } catch {
    return buildDegradedReportResult(
      startDate,
      endDate,
      groupProfile,
      "Something went wrong while building your safety report. The dashboard below is an approximate view; try again in a moment."
    );
  }
}

type CampgroundSearchRow = {
  facilityId: string;
  name: string;
  distanceMiles: number;
  amenityMatchScore: number;
  highlights: string[];
  bookUrl: string;
  snippet: string;
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
          snippet: String(r.snippet ?? ""),
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
  const bearDangerRating = chartData?.bearDangerRating ?? 1;
  const isBearExpanded = Boolean(expandedMetric["Bear Risk"]);
  const wildlifeTone = wildlifeMatrixTone(bearDangerRating);

  return (
    <div className="min-h-screen bg-[#fffaf4] text-[#1a1c1e]">
      <div className="scout-main-bg relative min-h-screen">
        <div
          className={`mx-auto flex w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-7 ${report ? "py-12 lg:py-14" : "min-h-screen justify-between py-8 sm:py-10 lg:py-12"}`}
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
            </header>
          )}

          {!report && (
            <div
              className="font-display flex flex-1 flex-col items-center justify-center px-2 pb-8 pt-6 sm:pt-10"
              role="region"
              aria-label="Trip planner"
            >
              <div className="w-full max-w-2xl space-y-10 text-center sm:space-y-12">
                <div className="space-y-4">
                  <p className="text-[clamp(1.05rem,3.25vw,1.55rem)] font-extrabold tracking-tight text-[#1a1c1e] sm:text-[clamp(1.1rem,2.75vw,1.65rem)]">
                    Welcome Camper!
                  </p>
                  <div className="flex justify-center gap-2.5 pt-1" aria-hidden>
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
                          {suggestions.map((s) => (
                            <li
                              key={s}
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
                    <p className="text-sm font-medium leading-relaxed text-[#888780] sm:text-base">
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
            <section className="mt-0 pt-16">
              <nav className="fixed inset-x-0 top-0 z-40 border-b border-[#3a2a1c] bg-[#2c1f14] px-4 py-5 text-[#f5f0e8] sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center justify-start gap-1 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setReportView("main")}
                      className="flex items-center gap-1 rounded-lg px-1 py-0.5 text-left transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8600A] sm:gap-2"
                      aria-label="Go to trip dashboard"
                    >
                      <span className="text-2xl sm:text-3xl" aria-hidden>
                        ⛺️
                      </span>
                      <span className="font-display text-2xl font-semibold tracking-tight text-[#f5f0e8] sm:text-3xl">
                        Scout
                      </span>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-5 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setReportView("main")}
                      className={`border-b-2 px-1 pb-1 text-base font-semibold transition ${
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
                      className={`border-b-2 px-1 pb-1 text-base font-semibold transition ${
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
                      className={`border-b-2 px-1 pb-1 text-base font-semibold transition ${
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
                      className="rounded-[20px] bg-[#E8600A] px-6 py-3 text-base font-bold text-white shadow-sm transition hover:brightness-110"
                    >
                      Plan another trip
                    </button>
                  </div>
                </div>
              </nav>

              {reportView === "packing" ? (
                <div className="mx-auto mt-6 w-full max-w-7xl space-y-5 px-4 sm:px-6 lg:px-8">
                  {checklist && checklist.length > 0 ? (
                    <GearChecklist sections={checklist} />
                  ) : (
                    <p className="mt-8 text-center text-sm text-[#888780]">No packing list generated yet.</p>
                  )}
                </div>
              ) : reportView === "bookings" ? (
                <div className="mx-auto mt-6 w-full max-w-7xl space-y-5 px-4 sm:px-6 lg:px-8">
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

                                    {row.highlights.length > 0 ? (
                                      <div className="mt-2 flex flex-wrap gap-2 sm:gap-2.5">
                                        {uniqueAmenityTags(row.highlights, 6).map((tag) => (
                                          <span
                                            key={`${row.facilityId}-${tag}`}
                                            className="inline-flex items-center gap-1 rounded-full border border-[#f0d5b1] bg-[#fff7ec] px-2.5 py-1 text-xs font-semibold text-[#7a5c2e] sm:px-3 sm:py-1.5 sm:text-sm"
                                          >
                                            {tag}
                                          </span>
                                        ))}
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
                  <div className={chartData?.conditionsNotice ? "mt-6" : "mt-5"}>
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
                    <p className="mt-1.5 text-center text-xs font-semibold text-[#2d2926] sm:text-left">
                      10 is very safe, 1 is dangerous.
                    </p>
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
                          : metric.label === "Weather Alertness"
                            ? chartData?.weatherHazardDetails ?? detailTextByMetric[metric.label] ?? []
                        : detailTextByMetric[metric.label] ?? [];

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
                                : metric.label === "Weather Alertness"
                                  ? "Weather Hazard Index"
                                  : metric.label === "Bear Risk"
                                    ? "Bear Risk Level"
                                    : "Current Temp"}
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
                                ? "Based off potential extreme weather events"
                              : primary.subtitle}
                        </p>
                        {metric.label === "Fire Risk" && (
                          <div className="mt-2 flex items-center gap-2">
                            {Array.from({ length: 5 }).map((_, idx) => {
                              const fireLevel = Math.max(1, Math.min(5, Math.round(6 - (metric.value / 100) * 5)));
                              const active = idx < fireLevel;
                              return (
                                <span
                                  key={idx}
                                  className={`h-2 flex-1 rounded-full ${active ? "bg-[#ea8a12]" : "bg-[#e5e7eb]"}`}
                                  aria-hidden
                                />
                              );
                            })}
                          </div>
                        )}
                        {metric.label === "Fire Risk" && (
                          <p className="mt-2 text-xs text-[#8b8e94]">1 = little to no risk, 5 = high wildfire risk.</p>
                        )}
                        <div className="mt-3">
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

                  <article className="flex h-full min-h-[200px] flex-col rounded-2xl border border-[#f0d5b1] bg-[#fff7ec] p-3 shadow-sm sm:p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display text-sm font-bold text-[#1a1c1e] sm:text-base">
                          <span className="mr-1">🐻</span>
                          Bear Risk Level
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${wildlifeTone.className}`}
                        >
                          {wildlifeTone.label}
                        </span>
                      </div>
                      <p className="font-display mt-3 text-2xl font-bold tracking-tight text-[#1a1c1e] sm:text-3xl">
                        {bearDangerRating} / 5
                      </p>
                      <p className="mt-1 text-xs text-[#6b7078]">
                        Bear danger rating based on elevation, latitude, and seasonality.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        {Array.from({ length: 5 }).map((_, idx) => {
                          const active = idx < bearDangerRating;
                          return (
                            <span
                              key={idx}
                              className={`h-2 flex-1 rounded-full ${active ? "bg-[#ea8a12]" : "bg-[#e5e7eb]"}`}
                              aria-hidden
                            />
                          );
                        })}
                      </div>
                      <div className="mt-2 text-xs text-[#8b8e94]">
                        1 = minimal activity, 5 = highest observed bear activity conditions.
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMetric((previous) => ({
                              ...previous,
                              ["Bear Risk"]: !previous["Bear Risk"],
                            }))
                          }
                          className="rounded-lg border border-orange-200 bg-orange-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-orange-700 uppercase transition hover:bg-orange-200/70"
                          aria-expanded={isBearExpanded}
                          aria-label="Toggle Bear Risk details"
                        >
                          {isBearExpanded ? "Hide details" : "Details"}
                        </button>
                      </div>
                      {isBearExpanded && (
                        <div className="mt-3 border-t border-[#d9dde3] pt-2.5 text-sm text-[#374151]">
                          <ul className="mt-0 list-disc space-y-1 pl-5">
                            {(chartData?.bearRiskDetails ?? detailTextByMetric["Bear Risk"] ?? []).map((detail) => (
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
