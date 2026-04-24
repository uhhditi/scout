"use client";

import { FormEvent, useState } from "react";
import { type SafetyMetric, type SafetyReport } from "@/lib/safetyReport";
import {
  calculateFireRisk,
  calculateAirQualityRisk,
  calculateWeatherAlertness,
  calculateWaterAccess,
  calculateBearRisk,
  getBearDangerRating,
  calculateOverallSafetyScore,
  getRiskLevel,
} from "@/lib/riskScoring";
import { DashboardCharts } from "@/app/components/dashboard-charts";

function formatRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
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
  "Water Access": [
    "Nearest refill reliability can vary by season, so verify streams and taps before setting out.",
    "Carry filtration and a reserve supply in case natural sources are low or temporarily inaccessible.",
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
    case "Water Access": {
      const pill = v >= 72 ? "Easy" : v >= 50 ? "Moderate" : v >= 35 ? "Limited" : "No access";
      return { line: "Distance-based access estimate", pill };
    }
    case "Weather Alertness": {
      const temp = 52 + (v % 34);
      const pill = v >= 75 ? "Clear" : v >= 55 ? "Mixed" : "Unsettled";
      return { line: `${temp}° projected`, pill };
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
      return { value: `Risk ${level}`, subtitle: "Wildlife risk level based off proximity to wildfire and adverse conditions." };
    }
    case "Air Quality": {
      const aqi = Math.round(Math.max(28, Math.min(165, 175 - v * 1.25)));
      return { value: `${aqi} AQI`, subtitle: "Current particulate estimate" };
    }
    case "Water Access":
      return { value: `${Math.round(v)} index`, subtitle: "Distance to nearest water source" };
    case "Weather Alertness": {
      const temp = 52 + (v % 34);
      return { value: `${temp}° Temp`, subtitle: "Expected daytime high" };
    }
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

function getWaterAccessLabel(distanceToWaterKm?: number, hasNearbyWater?: boolean): string {
  if (!hasNearbyWater) return "No Access";
  if (!distanceToWaterKm) return "Moderate Access";
  if (distanceToWaterKm < 0.5) return "Easy Access";
  if (distanceToWaterKm < 2) return "Moderate Access";
  return "Limited Access";
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
  waterAccessLabel: string;
  waterAccessDetails: string[];
  bearRisk: number;
  bearDangerRating: number;
  bearRiskDetails: string[];
  airQualityUnavailable: boolean;
};

async function generateSafetyReportFromAPI(
  address: string,
  startDate: string,
  endDate: string,
  distance: number
): Promise<ReportResult> {
  try {
    const url = `/api/conditions?address=${encodeURIComponent(address)}&startDate=${startDate}&endDate=${endDate}&distance=${distance}`;
    console.log("Fetching conditions from:", url);
    
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed to fetch conditions data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const { weather, airQuality, airQualityUnavailable, fire, location, water } = data;

    // Parse water data - check if any water features found

    // For wildlife, use a simple calculation for now
    const wildlifeData = { bears: 0 }; // Placeholder, can be expanded later

    // Calculate individual risk scores
    const weatherDaily = weather?.daily || {};
    const airHourly = airQuality?.hourly?.us_aqi || [];

    // Use first day for initial assessment
    const fireRisk = calculateFireRisk(fire, weatherDaily, startDate, endDate);
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
    const weatherHazardScore = weatherAlertness;
    const weatherHazardLabel = getExtremeWeatherLabel(weatherHazardScore);
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
    const hasWater = water && water.elements && water.elements.length > 0;
    const waterAccess = calculateWaterAccess(hasWater, distance);
    const waterAccessLabel = getWaterAccessLabel(distance, hasWater);
    const waterDistanceMiles = distance * 0.621371;
    const waterAccessDetails = [
      hasWater
        ? `Estimated nearest water source is about ${waterDistanceMiles.toFixed(1)} miles from your location.`
        : "No nearby water source was detected within the current search area.",
      "Nearest refill reliability can vary by season, so verify streams and taps before setting out.",
    ];
    
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const seenMonths = new Set<number>();
    const cur = new Date(startDateObj);
    while (cur <= endDateObj) {
      seenMonths.add(cur.getMonth() + 1);
      cur.setMonth(cur.getMonth() + 1);
    }
    const bearRisk = Math.max(
      ...Array.from(seenMonths).map((m) => calculateBearRisk(wildlifeData.bears || 0, location?.lat || 39, m))
    );
    const bearDangerRating = Math.max(
      ...Array.from(seenMonths).map((m) =>
        getBearDangerRating(wildlifeData.bears || 0, location?.lat || 39, m)
      )
    );
    const strongestWind = windWindow.length ? Math.max(...windWindow) : 0;
    const driestDay = precipitationWindow.length ? Math.min(...precipitationWindow) : 0;
    const wettestDay = precipitationWindow.length ? Math.max(...precipitationWindow) : 0;
    const windLevel =
      strongestWind > 40 ? "high" : strongestWind > 30 ? "moderately high" : strongestWind > 20 ? "elevated" : "low";
    const precipitationLevel =
      wettestDay > 20 ? "heavy" : wettestDay > 10 ? "moderate" : wettestDay > 5 ? "light-to-moderate" : "light";
    const fireDetails = [
      fire?.length
        ? `${fire.length} active fire hotspot(s) were detected in your search area, increasing wildfire concern nearby.`
        : "No active fire hotspots were detected in your search area.",
      `Weather impact: peak wind is ${strongestWind.toFixed(1)} km/h (${windLevel}), and precipitation ranges ${driestDay.toFixed(1)}-${wettestDay.toFixed(1)} mm (${precipitationLevel}). Higher wind with lower rainfall increases fire spread potential.`,
    ];
    const areaElevation = Number(location?.elevation ?? wildlifeData.bears ?? 0);
    const bearRiskDetails = [
      `Your area elevation is ${Math.round(areaElevation)} m, and higher elevation areas generally see more bear activity.`,
      "Store all food and scented items in bear-proof containers or hang them properly.",
    ];

    const overallSafetyRaw = calculateOverallSafetyScore(
      fireRisk,
      airQualityRisk,
      weatherAlertness,
      waterAccess,
      bearRisk
    );
    const overallSafety = overallSafetyRaw > 10 ? overallSafetyRaw / 10 : overallSafetyRaw;

    const metrics = [
      {
        label: "Fire Risk",
        value: 100 - fireRisk, // Invert: lower risk score = higher safety
        note: `Fire risk index based on active fires, wind conditions (${weatherDaily.windspeed_10m_max?.[0]?.toFixed(1) || 0} km/h), and precipitation.`,
        icon: "🔥",
      },
      {
        label: "Air Quality",
        value: 100 - airQualityRisk,
        note: `Air quality index today is ${airHourly[0] || 50}. Monitor for smoke and particulates.`,
        icon: "💨",
      },
      {
        label: "Weather Alertness",
        value: 100 - weatherAlertness,
        note: "Weather hazard index is calculated from storm codes, heavy precipitation, and extreme winds.",
        icon: "⛈️",
      },
      {
        label: "Water Access",
        value: waterAccess,
        note: "Score calculated by distance to the nearest body of water.",
        icon: "💧",
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
      temps: weatherDaily.temperature_2m_max || [],
      fireRisk,
      fireDetails,
      airRisk: airQualityRisk,
      airQualityRating,
      airQualityLabel,
      airQualityDetails,
      weatherHazardScore,
      weatherHazardLabel,
      weatherHazardDetails,
      weatherRisk: weatherAlertness,
      waterAccessLabel,
      waterAccessDetails,
      bearRisk,
      bearDangerRating,
      bearRiskDetails,
      airQualityUnavailable: !!airQualityUnavailable,
    };
  } catch (error) {
    throw error;
  }
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [chartData, setChartData] = useState<Omit<ReportResult, "report"> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<Record<string, boolean>>({});
  const [isScouting, setIsScouting] = useState(false);

  const normalizedOverallScore = report
    ? report.overallScore > 10
      ? report.overallScore / 10
      : report.overallScore
    : 7.2;
  const chartSeed = normalizedOverallScore * 10;
  const todayIso = new Date().toISOString().slice(0, 10);
  const maxForecastDate = new Date();
  maxForecastDate.setDate(maxForecastDate.getDate() + 16);
  const maxForecastIso = maxForecastDate.toISOString().slice(0, 10);

  const tripDays =
    startDate && endDate
      ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedStartDate = startDate;
    const normalizedEndDate = endDate;
    const querySeed = address;
    const distanceNum = 10;

    setErrorMessage(null);
    setReport(null);
    setChartData(null);
    setExpandedMetric({});
    setIsScouting(true);
    try {
      const { report: nextReport, ...meta } = await generateSafetyReportFromAPI(
        querySeed,
        normalizedStartDate,
        normalizedEndDate,
        distanceNum
      );
      setReport(nextReport);
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

  const overall = report ? overallPill(normalizedOverallScore) : null;
  const bearDangerRating = chartData?.bearDangerRating ?? 1;
  const isBearExpanded = Boolean(expandedMetric["Bear Risk"]);
  const wildlifeTone = wildlifeMatrixTone(bearDangerRating);

  return (
    <div className="min-h-screen bg-[#fffaf4] text-[#1a1c1e]">
      <div className="scout-main-bg relative min-h-screen">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-7 lg:py-14">
          <header>
            <div className="flex items-center gap-2">
              <span className="text-3xl" aria-hidden>
                ⛺️
              </span>
              <p className="font-display text-2xl font-bold text-[#1a1c1e]">Scout</p>
            </div>
            <h1 className="font-display mt-4 text-[clamp(1.9rem,4.8vw,3.2rem)] leading-[1.05] font-bold whitespace-nowrap text-[#1a1c1e]">
              Camp With Ease, Scout Your Site.
            </h1>
            <p className="mt-3 text-[clamp(0.95rem,2.2vw,1.15rem)] whitespace-nowrap text-[#5f646b]">
              Real-time fire risk, air quality, and water access data for your next wilderness adventure.
            </p>
          </header>

          <form
            onSubmit={handleSubmit}
            className="font-display mt-8 rounded-2xl border border-[#eadfcd] bg-white p-5 shadow-lg ring-1 ring-[#f5ecde] backdrop-blur-sm sm:mt-10 sm:p-6"
          >
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[#6b7078]">
                Enter campsite address to get started
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <label className="relative flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-[#e8ddcc] bg-white px-4 py-3 sm:px-5">
                  <PinIcon className="h-5 w-5 shrink-0 text-[#d97706]" />
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Yellowstone National Park, WY 82190"
                    className="min-w-0 flex-1 bg-transparent text-base text-[#1a1c1e] outline-none placeholder:text-[#7b8189] sm:text-lg"
                  />
                </label>
              </div>
              <p className="text-xs text-[#7b8189]">
                Forecast coverage currently supports trips up to 16 days from today.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="relative flex items-center gap-3 rounded-xl border border-[#e8ddcc] bg-white px-4 py-3 sm:px-5">
                  <CalendarIcon className="h-5 w-5 shrink-0 text-[#8b8e94]" />
                  <span className="sr-only">Start date</span>
                  <input
                    type="date"
                    required
                    min={todayIso}
                    max={maxForecastIso}
                    value={startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      if (!nextStart) {
                        setStartDate("");
                        return;
                      }
                      const clampedStart = nextStart > maxForecastIso ? maxForecastIso : nextStart;
                      setStartDate(clampedStart);
                      if (endDate && endDate < clampedStart) {
                        setEndDate(clampedStart);
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-base text-[#1a1c1e] outline-none sm:text-lg"
                  />
                </label>
                <label className="relative flex items-center gap-3 rounded-xl border border-[#e8ddcc] bg-white px-4 py-3 sm:px-5">
                  <span className="sr-only">End date</span>
                  <input
                    type="date"
                    required
                    min={startDate || todayIso}
                    max={maxForecastIso}
                    value={endDate}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      if (!nextEnd) {
                        setEndDate("");
                        return;
                      }
                      let clampedEnd = nextEnd > maxForecastIso ? maxForecastIso : nextEnd;
                      const minEnd = startDate || todayIso;
                      if (clampedEnd < minEnd) {
                        clampedEnd = minEnd;
                      }
                      setEndDate(clampedEnd);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-base text-[#1a1c1e] outline-none sm:text-lg"
                  />
                </label>
              </div>

              {(startDate || endDate) ? (
                <p className="text-center text-xs text-[#6b7078] sm:text-left">
                  Trip window:{" "}
                  <span className="text-[#9aa0a8]">{formatRangeInput(startDate, endDate)}</span>
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isScouting}
                className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white shadow-md transition sm:text-base ${
                  isScouting
                    ? "cursor-not-allowed bg-[#f1a64a]"
                    : "bg-[#ea8a12] hover:brightness-110"
                }`}
              >
                {isScouting ? "Scouting..." : "Scout Area"}
              </button>
            </div>
          </form>

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {report && (
            <section className="mt-10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-3xl font-bold text-[#1a1c1e] sm:text-4xl">
                    {address}
                  </h2>
                  <p className="mt-1 text-sm text-[#888780]">
                    {`Forecast window ${formatRange(startDate, endDate)}`}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-4">
                  <article className="flex min-h-[260px] flex-col justify-between rounded-2xl border border-[#f0c084] bg-gradient-to-b from-[#fff3e0] to-[#ffe8cc] p-5 shadow-sm ring-1 ring-[#f7d6ab] sm:p-6 xl:w-[300px] xl:self-stretch">
                    <div>
                      <p className="font-display text-center text-lg font-bold text-[#1a1c1e] sm:text-left">
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
                      <p className="mt-3 text-center text-base leading-relaxed text-[#5f646b] sm:text-left">
                        {report.status}
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

                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
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
                          : metric.label === "Water Access"
                            ? chartData?.waterAccessDetails ?? detailTextByMetric[metric.label] ?? []
                        : detailTextByMetric[metric.label] ?? [];

                    return (
                      <article
                        key={metric.label}
                        className="flex h-full min-h-[260px] flex-col rounded-2xl border border-[#eadfcd] bg-white p-5 shadow-sm sm:p-6"
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
                                  : metric.label === "Water Access"
                                    ? "Water Sources"
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
                            : metric.label === "Water Access"
                              ? chartData?.waterAccessLabel ?? primary.value
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

                  <article className="flex h-full min-h-[260px] flex-col rounded-2xl border border-[#eadfcd] bg-white p-5 shadow-sm sm:p-6">
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
              </div>
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

          {report && (
            <div className="mt-10 border-t border-[#e5e7eb] pt-10">
              <DashboardCharts
                chartSeed={chartSeed}
                temps={chartData?.temps}
                fireRisk={chartData?.fireRisk}
                airRisk={chartData?.airRisk}
                bearRisk={chartData?.bearRisk}
              />
            </div>
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
