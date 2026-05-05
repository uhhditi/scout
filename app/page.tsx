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
  applyGroupMultipliers,
  type GroupProfile,
  type RiskScores,
  getRiskLevel,
  getNearestFireDistanceKm,
  extractFireCoordinates,
} from "@/lib/riskScoring";
import { DashboardCharts } from "@/app/components/dashboard-charts";

function formatRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "Select dates";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Select dates";
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
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

function mmToInches(mm: number) {
  return mm * 0.0393701;
}

const COMPANION_TAGS = ["Kids", "Elderly", "Pets"] as const;

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

function getAirQualityLabel(rating: number): string {
  switch (rating) {
    case 1:
      return "Good";
    case 2:
      return "Moderate";
    case 3:
      return "Unhealthy for Sensitive Groups";
    case 4:
      return "Unhealthy";
    case 5:
      return "Very Unhealthy";
    default:
      return "Unknown";
  }
}

function getAirQualityRating(avgAqi: number): number {
  if (avgAqi > 200) return 5;
  if (avgAqi > 150) return 4;
  if (avgAqi > 100) return 3;
  if (avgAqi > 50) return 2;
  return 1;
}

function getExtremeWeatherLabel(score: number): string {
  if (score >= 80) return "Severe conditions expected";
  if (score >= 60) return "Significant weather risk";
  if (score >= 40) return "Moderate weather risk";
  if (score >= 25) return "Minor weather risk";
  return "Calm conditions";
}

type ReportResult = {
  report: SafetyReport;
  temps: number[];
  fireRisk: number;
  fireDetails: string[];
  airRisk: number;
  airQualityRating: number;
  airQualityLabel: string;
  airQualityDetails: string[];
  weatherHazardScore: number;
  weatherHazardLabel: string;
  weatherHazardDetails: string[];
  weatherRisk: number;
  bearRisk: number;
  bearDangerRating: number;
  bearRiskDetails: string[];
  airQualityUnavailable: boolean;
  aiBriefing: string | null;
  forecastNotice?: string;
  forecastWindowUsed?: {
    startDate: string;
    endDate: string;
  };
};

async function generateSafetyReportFromAPI(
  address: string,
  startDate: string,
  endDate: string,
  distance: number,
  groupProfile: GroupProfile,
  partySize: string,
  userNotes: string
): Promise<ReportResult> {
  try {
    const url = `/api/conditions?address=${encodeURIComponent(address)}&startDate=${startDate}&endDate=${endDate}&distance=${distance}`;
    
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed to fetch conditions data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const { weather, airQuality, airQualityUnavailable, fire, location, forecastNotice, forecastWindowUsed } = data;

    // For wildlife, use a simple calculation for now
    const wildlifeData = { bears: 0 }; // Placeholder, can be expanded later

    // Calculate individual risk scores
    const weatherDaily = weather?.daily || {};
    const airHourly = airQuality?.hourly?.us_aqi || [];

    // Use first day for initial assessment; fire proximity uses great-circle distance to campsite
    const fireRisk = calculateFireRisk(
      fire,
      weatherDaily,
      startDate,
      endDate,
      location?.lat,
      location?.lon
    );
    const airQualityRisk = calculateAirQualityRisk(airHourly);
    const avgAqi = airHourly.length
      ? airHourly.reduce((sum: number, value: number) => sum + value, 0) / airHourly.length
      : 0;
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
    const weatherAlertness = calculateWeatherAlertness(weatherDaily, startDate, endDate);
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
    const weatherHazardDetails = [
      hazardSignals.length > 0
        ? `Potential extreme weather signals include ${hazardSignals.join(", ")}.`
        : "No thunderstorms, snow, heavy rain, or extreme wind are currently forecast in your trip window.",
      "Plan layers, rain protection, and a quick shelter strategy before reaching remote sections.",
    ];
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const seenMonths = new Set<number>();
    const cur = new Date(startDateObj);
    while (cur <= endDateObj) {
      seenMonths.add(cur.getMonth() + 1);
      cur.setMonth(cur.getMonth() + 1);
    }
    const areaElevation = Number(location?.elevation ?? wildlifeData.bears ?? 0);
    const bearRisk = Math.max(
      ...Array.from(seenMonths).map((m) => calculateBearRisk(areaElevation, location?.lat || 39, m))
    );
    const bearDangerRating = Math.max(
      ...Array.from(seenMonths).map((m) =>
        getBearDangerRating(areaElevation, location?.lat || 39, m)
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
      `Weather impact: peak wind is ${kmhToMph(strongestWind).toFixed(1)} mph (${windLevel}), and precipitation ranges ${mmToInches(driestDay).toFixed(2)}-${mmToInches(wettestDay).toFixed(2)} in (${precipitationLevel}). Higher wind with lower rainfall increases fire spread potential.`,
    ];
    const bearRiskDetails = [
      `Your area elevation is ${Math.round(metersToFeet(areaElevation))} ft, and higher elevation areas generally see more bear activity.`,
      "Store all food and scented items in bear-proof containers or hang them properly.",
    ];

    const overallSafetyRaw = calculateOverallSafetyScore(
      fireRisk,
      airQualityRisk,
      weatherAlertness,
      bearRisk
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
    const tempLow = tempsWindow.length ? Math.min(...tempsWindow) : 50;
    const tempHigh = tempsWindow.length ? Math.max(...tempsWindow) : 70;
    const precipChance =
      precipitationWindow.length > 0
        ? Math.round((precipitationWindow.filter((value: number) => value > 0.5).length / precipitationWindow.length) * 100)
        : 0;
    const fireRiskLabel: "low" | "moderate" | "high" | "extreme" =
      adjustedFireRisk >= 75
        ? "extreme"
        : adjustedFireRisk >= 55
          ? "high"
          : adjustedFireRisk >= 30
            ? "moderate"
            : "low";
    const tripDays =
      Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));

    let aiBriefing: string | null = null;
    try {
      const briefRes = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          conditions: {
            tempLow: Math.round(tempLow),
            tempHigh: Math.round(tempHigh),
            windSpeed: Math.round(kmhToMph(strongestWind)),
            precipChance,
            aqi: Math.round(avgAqi || 0),
            fireRiskLabel,
          },
          scores: {
            overall: Number(adjustedRiskScores.overall.toFixed(1)),
            weather: Number(adjustedRiskScores.weather.toFixed(1)),
            temperature: Number(adjustedRiskScores.temperature.toFixed(1)),
            wind: Number(adjustedRiskScores.wind.toFixed(1)),
            precipitation: Number(adjustedRiskScores.precipitation.toFixed(1)),
            fire: Number(adjustedRiskScores.fire.toFixed(1)),
            airQuality: Number(adjustedRiskScores.airQuality.toFixed(1)),
          },
          group: groupProfile,
          partySize,
          tripDays,
          userNotes,
        }),
      });
      if (briefRes.ok) {
        const briefData = await briefRes.json();
        const briefingText =
          typeof briefData?.briefing === "string" ? briefData.briefing.trim() : "";
        const errorText =
          typeof briefData?.error === "string" ? briefData.error.trim() : "";
        aiBriefing = briefingText || (errorText ? `AI briefing unavailable: ${errorText}` : null);
      }
    } catch {
      aiBriefing = "AI briefing unavailable: request failed.";
    }

    const metrics = [
      {
        label: "Fire Risk",
        value: 100 - adjustedFireRisk, // Invert: lower risk score = higher safety
        note: `Fire risk index based on hotspot detections from the last 5 days plus forecast wind (${kmhToMph(weatherDaily.windspeed_10m_max?.[0] || 0).toFixed(1)} mph) and precipitation.`,
        icon: "🔥",
      },
      {
        label: "Air Quality",
        value: 100 - adjustedAirQualityRisk,
        note: `Air quality index today is ${airHourly[0] || 50}. Monitor for smoke and particulates.`,
        icon: "💨",
      },
      {
        label: "Weather Alertness",
        value: 100 - adjustedWeatherAlertness,
        note: "Weather hazard index is calculated from storm codes, heavy precipitation, and extreme winds.",
        icon: "⛈️",
      },
      {
        label: "Bear Risk",
        value: 100 - bearRisk,
        note: `Bear activity risk based on wildlife data and season.`,
        icon: "🐻",
      },
    ];

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
      airQualityUnavailable: !!airQualityUnavailable,
      aiBriefing,
      forecastNotice,
      forecastWindowUsed,
    };
  } catch (error) {
    throw error;
  }
}

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
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [chartData, setChartData] = useState<Omit<ReportResult, "report"> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<Record<string, boolean>>({});
  const [isScouting, setIsScouting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddressChange = (value: string) => {
    setAddress(value);
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

  const normalizedOverallScore = report
    ? report.overallScore > 10
      ? report.overallScore / 10
      : report.overallScore
    : 7.2;
  const chartSeed = normalizedOverallScore * 10;
  const tripDays =
    startDate && endDate
      ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0;

  const toggleCompanion = (tag: string) => {
    setCompanions((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleHealth = (tag: string) => {
    setHealthConcerns((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const runScoutTrip = async () => {
    const distanceNum = 10;
    setErrorMessage(null);
    setReport(null);
    setChartData(null);
    setExpandedMetric({});
    setIsScouting(true);
    try {
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
      const partySize = companions.length > 0 ? `${companions.length + 1}+` : "not specified";
      const userNotes = [companionDetails.trim(), healthDetails.trim()]
        .filter(Boolean)
        .join(" | ");

      const { report: nextReport, ...meta } = await generateSafetyReportFromAPI(
        address,
        startDate,
        endDate,
        distanceNum,
        {
          vulnerableMembers,
          medicalConditions,
        },
        partySize,
        userNotes
      );
      setReport(nextReport);
      setReportGeneratedAt(new Date().toISOString());
      setChartData(meta);
      setExpandedMetric({});
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setReport(null);
      setChartData(null);
    } finally {
      setIsScouting(false);
    }
  };

  const resetTripPlanner = () => {
    setReport(null);
    setChartData(null);
    setErrorMessage(null);
    setExpandedMetric({});
    setWizardStep(0);
    setCompanionDetails("");
    setHealthDetails("");
    setReportGeneratedAt("");
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
          <header className={report ? "" : "text-center"}>
            <div className={`flex items-center gap-2 sm:gap-3 ${report ? "" : "justify-center"}`}>
              <span
                className={`leading-none ${report ? "text-3xl sm:text-4xl" : "text-5xl sm:text-6xl"}`}
                aria-hidden
              >
                ⛺️
              </span>
              <p
                className={`font-display tracking-tight text-[#1a1c1e] ${
                  report
                    ? "text-2xl font-bold sm:text-3xl"
                    : "text-4xl font-extrabold sm:text-5xl lg:text-6xl"
                }`}
              >
                Scout
              </p>
            </div>
            {!report && (
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
            )}
          </header>

          {!report && (
            <div
              className="font-display flex flex-1 flex-col items-center justify-center px-2 pb-8 pt-6 sm:pt-10"
              role="region"
              aria-label="Trip planner"
            >
              <div className="w-full max-w-2xl space-y-10 text-center sm:space-y-12">
                <div className="space-y-4">
                  <p className="text-[clamp(1.45rem,5vw,2.35rem)] font-extrabold tracking-tight text-[#1a1c1e]">
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
                              }}
                              className="cursor-pointer truncate px-5 py-3 text-[#1a1c1e] transition hover:bg-[#fff3e0]/80"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        disabled={!address.trim()}
                        onClick={() => setWizardStep(1)}
                        className="rounded-full bg-[#ea8a12] px-12 py-4 text-base font-extrabold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:px-14 sm:py-4 sm:text-lg"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 1 && (
                  <div className="flex flex-col gap-8 sm:gap-10">
                    <p className="text-[clamp(1.15rem,3.5vw,1.85rem)] font-bold leading-snug text-[#3d4249]">
                      When are you going?
                    </p>
                    <div className="grid w-full gap-4 sm:grid-cols-2 sm:gap-5">
                      <label className="flex min-h-[3.5rem] items-center gap-4 rounded-2xl border-2 border-[#eadfcd]/90 bg-[#fffcf7]/70 px-5 py-4 shadow-sm backdrop-blur-sm transition focus-within:border-[#d97706]/60 focus-within:ring-4 focus-within:ring-[#f7d6ab]/50 sm:min-h-[4rem] sm:px-6 sm:py-5">
                        <CalendarIcon className="h-7 w-7 shrink-0 text-[#8b8e94] sm:h-8 sm:w-8" />
                        <span className="sr-only">Start date</span>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            const nextStart = e.target.value;
                            if (!nextStart) {
                              setStartDate("");
                              return;
                            }
                            setStartDate(nextStart);
                            if (endDate && endDate < nextStart) {
                              setEndDate(nextStart);
                            }
                          }}
                          className="min-w-0 flex-1 bg-transparent text-lg text-[#1a1c1e] outline-none sm:text-xl"
                        />
                      </label>
                      <label className="flex min-h-[3.5rem] items-center gap-4 rounded-2xl border-2 border-[#eadfcd]/90 bg-[#fffcf7]/70 px-5 py-4 shadow-sm backdrop-blur-sm transition focus-within:border-[#d97706]/60 focus-within:ring-4 focus-within:ring-[#f7d6ab]/50 sm:min-h-[4rem] sm:px-6 sm:py-5">
                        <span className="sr-only">End date</span>
                        <input
                          type="date"
                          min={startDate || undefined}
                          value={endDate}
                          onChange={(e) => {
                            const nextEnd = e.target.value;
                            if (!nextEnd) {
                              setEndDate("");
                              return;
                            }
                            let clampedEnd = nextEnd;
                            if (startDate && clampedEnd < startDate) {
                              clampedEnd = startDate;
                            }
                            setEndDate(clampedEnd);
                          }}
                          className="min-w-0 flex-1 bg-transparent text-lg text-[#1a1c1e] outline-none sm:text-xl"
                        />
                      </label>
                    </div>
                    <p className="text-sm font-medium leading-relaxed text-[#888780] sm:text-base">
                      Forecast-based scoring works for trips within 16 days and is strongest within 5-7 days from today.
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
                        onClick={() => setWizardStep(0)}
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
                      <p className="text-base text-[#888780] sm:text-lg">Select all that apply — optional.</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 sm:gap-3.5">
                      {COMPANION_TAGS.map((tag) => {
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
                      <p className="text-[clamp(1.35rem,4.5vw,2.25rem)] font-bold leading-snug text-[#3d4249] sm:font-extrabold">
                        Any health considerations?
                      </p>
                      <p className="text-base text-[#888780] sm:text-lg">Select all that apply — optional.</p>
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
            <section className="mt-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display inline-block text-3xl font-bold text-[#1a1c1e] sm:text-4xl">
                    Your Personalized Safety Report
                  </h2>
                  <p className="mt-1 text-sm text-[#888780]">
                    {`Forecast window ${formatRange(startDate, endDate)}`}
                  </p>
                  {chartData?.forecastNotice ? (
                    <p className="mt-2 text-xs text-[#7b8189]">
                      {chartData.forecastNotice} Using{" "}
                      {formatRange(
                        chartData.forecastWindowUsed?.startDate || startDate,
                        chartData.forecastWindowUsed?.endDate || endDate
                      )}{" "}
                      for forecast-dependent metrics.
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 flex w-full flex-col gap-3 sm:mt-0 sm:w-auto sm:flex-row sm:items-start">
                  <button
                    type="button"
                    onClick={resetTripPlanner}
                    className="h-11 shrink-0 rounded-xl bg-[#ea8a12] px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110 sm:self-stretch"
                  >
                    Plan another trip
                  </button>
                </div>
              </div>

              <section className="mt-5">
                <h3 className="font-display inline-block border-b-2 border-[#ea8a12] pb-1 text-xl font-bold text-[#1a1c1e] sm:text-2xl">
                  Safety Summary
                </h3>
                <div className="mt-3">
                  <p className="text-lg leading-relaxed text-black sm:text-xl">
                    {chartData?.aiBriefing ?? "AI briefing unavailable for this trip."}
                  </p>
                </div>
              </section>

              <details open className="group mt-5 rounded-2xl border border-[#eadfcd] bg-white/90 p-3.5 shadow-sm sm:p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <h3 className="font-display inline-block border-b-2 border-[#ea8a12] pb-1 text-xl font-bold text-[#1a1c1e] sm:text-2xl">
                    Safety Breakdown
                  </h3>
                  <span aria-hidden className="text-[#7b8189] transition-transform duration-200 group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-stretch xl:gap-3">
                <article className="flex min-h-[240px] flex-col justify-between rounded-2xl border border-[#f0c084] bg-gradient-to-b from-[#fff3e0] to-[#ffe8cc] p-4 shadow-sm ring-1 ring-[#f7d6ab] sm:p-5 xl:w-[300px] xl:self-stretch">
                  <div>
                    <p className="font-display inline-block text-lg font-bold text-[#b45309]">
                      Overall Safety Score
                    </p>
                    <div className="mt-3 flex flex-wrap items-end justify-center gap-3 sm:justify-start">
                      <p className="font-display text-4xl font-bold leading-none tracking-tight text-[#1a1c1e] sm:text-5xl">
                        {normalizedOverallScore.toFixed(1)}
                      </p>
                      <span className="pb-2 text-lg text-[#888780]">/ 10</span>
                      {overall ? (
                        <span
                          className={`mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${overall.className}`}
                        >
                          {overall.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-center text-xs text-[#8b8e94] sm:text-left">
                      10 is very safe, 1 is dangerous.
                    </p>
                  </div>
                  <div className="mt-6 flex items-center justify-center">
                    <div className="relative h-28 w-28">
                      <svg viewBox="0 0 112 112" className="h-28 w-28 -rotate-90" aria-hidden>
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
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#6b7078]">
                        {normalizedOverallScore.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </article>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
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
                        className="flex h-full min-h-[240px] flex-col rounded-2xl border border-[#f0d5b1] bg-[#fff7ec] p-4 shadow-sm sm:p-5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-base font-bold text-[#1a1c1e] sm:text-lg">
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
                        <p className="font-display mt-4 text-3xl font-bold tracking-tight text-[#1a1c1e] sm:text-[2rem]">
                          {metric.label === "Air Quality"
                            ? chartData?.airQualityUnavailable
                              ? "N/A"
                              : chartData?.airQualityLabel ?? primary.value
                            : metric.label === "Weather Alertness"
                              ? chartData?.weatherHazardLabel ?? primary.value
                            : primary.value}
                        </p>
                        <p className="mt-1 text-sm text-[#6b7078]">
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
                                  className={`h-2.5 flex-1 rounded-full ${active ? "bg-[#ea8a12]" : "bg-[#e5e7eb]"}`}
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
                            : metric.label === "Air Quality" && chartData?.airQualityUnavailable
                            ? ""
                            : metric.label === "Weather Alertness"
                              ? `Hazard score: ${chartData?.weatherHazardScore ?? 0} / 100`
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
                            className="rounded-lg border border-orange-200 bg-orange-100 px-3 py-1.5 text-xs font-semibold tracking-wide text-orange-700 uppercase transition hover:bg-orange-200/70"
                            aria-expanded={isExpanded}
                            aria-label={`Toggle ${metric.label} details`}
                          >
                            {isExpanded ? "Hide details" : "Details"}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="mt-4 border-t border-[#d9dde3] pt-3 text-base text-[#374151]">
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
                          <span className="mr-1">🐻</span>
                          Bear Risk Level
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${wildlifeTone.className}`}
                        >
                          {wildlifeTone.label}
                        </span>
                      </div>
                      <p className="font-display mt-4 text-3xl font-bold tracking-tight text-[#1a1c1e] sm:text-[2rem]">
                        {bearDangerRating} / 5
                      </p>
                      <p className="mt-1 text-sm text-[#6b7078]">
                        Bear danger rating based on elevation, latitude, and seasonality.
                      </p>
                      <div className="mt-4 flex items-center gap-2">
                        {Array.from({ length: 5 }).map((_, idx) => {
                          const active = idx < bearDangerRating;
                          return (
                            <span
                              key={idx}
                              className={`h-2.5 flex-1 rounded-full ${active ? "bg-[#ea8a12]" : "bg-[#e5e7eb]"}`}
                              aria-hidden
                            />
                          );
                        })}
                      </div>
                      <div className="mt-3 text-xs text-[#8b8e94]">
                        1 = minimal activity, 5 = highest observed bear activity conditions.
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMetric((previous) => ({
                              ...previous,
                              ["Bear Risk"]: !previous["Bear Risk"],
                            }))
                          }
                          className="rounded-lg border border-orange-200 bg-orange-100 px-3 py-1.5 text-xs font-semibold tracking-wide text-orange-700 uppercase transition hover:bg-orange-200/70"
                          aria-expanded={isBearExpanded}
                          aria-label="Toggle Bear Risk details"
                        >
                          {isBearExpanded ? "Hide details" : "Details"}
                        </button>
                      </div>
                      {isBearExpanded && (
                        <div className="mt-4 border-t border-[#d9dde3] pt-3 text-base text-[#374151]">
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
              </details>
              <details open className="group mt-5 rounded-2xl border border-[#eadfcd] bg-white/90 p-3.5 shadow-sm sm:p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <h3 className="font-display inline-block border-b-2 border-[#ea8a12] pb-1 text-xl font-bold text-[#1a1c1e] sm:text-2xl">
                    Visualizations
                  </h3>
                  <span aria-hidden className="text-[#7b8189] transition-transform duration-200 group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-3">
                  <DashboardCharts
                    chartSeed={chartSeed}
                    temps={chartData?.temps}
                    fireRisk={chartData?.fireRisk}
                    airRisk={chartData?.airRisk}
                    bearRisk={chartData?.bearRisk}
                  />
                </div>
              </details>
              {(tripDays > 5 || tripDays > 10) && (
                <p className="mt-4 text-xs text-[#8b8e94]">
                  Data coverage limits for this {tripDays}-day trip —{" "}
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

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-9.75A2.25 2.25 0 015.25 6.5h13.5a2.25 2.25 0 012.25 2.25v9.75"
      />
    </svg>
  );
}
