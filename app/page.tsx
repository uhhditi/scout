"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { type SafetyMetric, type SafetyReport } from "@/lib/safetyReport";
import {
  calculateFireRisk,
  calculateAirQualityRisk,
  calculateWeatherAlertness,
  calculateWaterAccess,
  calculateBearRisk,
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
    "Wind and dry-fuel conditions suggest carrying a backup suppression tool and avoiding open flames after dusk.",
    "Check county burn restrictions before arrival and keep your campfire fully contained to designated rings.",
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
  if (score >= 82) return { label: "OPTIMAL", className: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" };
  if (score >= 68) return { label: "FAVORABLE", className: "bg-amber-100 text-amber-700 ring-1 ring-amber-200" };
  if (score >= 52) return { label: "CAUTION", className: "bg-orange-100 text-orange-700 ring-1 ring-orange-200" };
  return { label: "ELEVATED", className: "bg-red-100 text-red-700 ring-1 ring-red-200" };
}

function metricSecondary(metric: SafetyMetric) {
  const v = metric.value;
  switch (metric.label) {
    case "Fire Risk": {
      const level = Math.max(1, Math.min(5, Math.round(6 - (v / 100) * 5)));
      const pill =
        level <= 2 ? "Low" : level === 3 ? "Moderate" : level === 4 ? "High" : "Severe";
      return { line: `Level ${level} of 5`, pill };
    }
    case "Air Quality": {
      const aqi = Math.round(Math.max(28, Math.min(165, 175 - v * 1.25)));
      const pill = aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : "Sensitive";
      return { line: `${aqi} AQI`, pill };
    }
    case "Water Access": {
      const pill = v >= 72 ? "Flowing" : v >= 50 ? "Variable" : "Low";
      return { line: `${Math.round(v)}% capacity`, pill };
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
      return { value: `Risk ${level}`, subtitle: "Current wildfire risk level" };
    }
    case "Air Quality": {
      const aqi = Math.round(Math.max(28, Math.min(165, 175 - v * 1.25)));
      return { value: `${aqi} AQI`, subtitle: "Current particulate estimate" };
    }
    case "Water Access":
      return { value: `${Math.round(v)}% Capacity`, subtitle: "Refill and source availability" };
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

type ReportResult = {
  report: SafetyReport;
  temps: number[];
  fireRisk: number;
  airRisk: number;
  bearRisk: number;
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
    const weatherAlertness = calculateWeatherAlertness(weatherDaily, startDate, endDate);
    const hasWater = water && water.elements && water.elements.length > 0;
    const waterAccess = calculateWaterAccess(hasWater, distance);
    
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

    const overallSafety = calculateOverallSafetyScore(
      fireRisk,
      airQualityRisk,
      weatherAlertness,
      waterAccess,
      bearRisk
    );

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
        note: `Air quality index currently at ${airHourly[0] || 50}. Monitor for smoke and particulates.`,
        icon: "💨",
      },
      {
        label: "Weather Alertness",
        value: 100 - weatherAlertness,
        note: `Weather conditions show precipitation at ${weatherDaily.precipitation_sum?.[0]?.toFixed(1) || 0}mm risk of severe weather.`,
        icon: "⛈️",
      },
      {
        label: "Water Access",
        value: waterAccess,
        note: "Water availability in the area based on nearby streams and water features.",
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
      report: { overallScore: overallSafety, status: getRiskLevel(overallSafety), metrics },
      temps: weatherDaily.temperature_2m_max || [],
      fireRisk,
      airRisk: airQualityRisk,
      bearRisk,
      airQualityUnavailable: !!airQualityUnavailable,
    };
  } catch (error) {
    throw error;
  }
}

export default function Home() {
  const [siteType, setSiteType] = useState<"campsite" | "trail">("campsite");
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [trailDistance, setTrailDistance] = useState("");
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [chartData, setChartData] = useState<Omit<ReportResult, "report"> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<Record<string, boolean>>({});
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

  const chartSeed = report?.overallScore ?? 72;

  const tripDays =
    startDate && endDate
      ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedStartDate =
      siteType === "campsite" ? startDate : new Date().toISOString().slice(0, 10);
    const normalizedEndDate = siteType === "campsite" ? endDate : normalizedStartDate;
    const querySeed =
      siteType === "trail" ? `${address} | distance:${trailDistance}` : address;
    const distanceNum = siteType === "trail" ? (parseFloat(trailDistance) || 10) * 1.60934 : 10;

    setErrorMessage(null);
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
    }
  };

  const overall = report ? overallPill(report.overallScore) : null;

  return (
    <div className="min-h-screen bg-[#fffaf4] text-[#1a1c1e]">
      <div className="scout-main-bg relative min-h-screen">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 lg:px-10 lg:py-14">
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="flex w-full shrink-0 gap-2 rounded-xl border border-[#e8ddcc] bg-white p-1.5 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setSiteType("campsite")}
                    className={`rounded-lg px-4 py-2.5 text-sm font-semibold sm:text-base ${
                      siteType === "campsite"
                        ? "bg-[#ea8a12] text-white"
                        : "text-[#6d7279] hover:text-[#1a1c1e]"
                    }`}
                  >
                    Campsite
                  </button>
                  <button
                    type="button"
                    onClick={() => setSiteType("trail")}
                    className={`rounded-lg px-4 py-2.5 text-sm font-semibold sm:text-base ${
                      siteType === "trail"
                        ? "bg-[#ea8a12] text-white"
                        : "text-[#6d7279] hover:text-[#1a1c1e]"
                    }`}
                  >
                    Trail
                  </button>
                </div>

                <div ref={suggestionsRef} className="relative min-w-0 flex-1">
                  <label className="relative flex min-w-0 w-full items-center gap-3 rounded-xl border border-[#e8ddcc] bg-white px-4 py-3 sm:px-5">
                    <PinIcon className="h-5 w-5 shrink-0 text-[#d97706]" />
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => handleAddressChange(e.target.value)}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      placeholder="Yosemite Valley, CA"
                      className="min-w-0 flex-1 bg-transparent text-base text-[#1a1c1e] outline-none placeholder:text-[#7b8189] sm:text-lg"
                    />
                  </label>
                  {showSuggestions && (
                    <ul className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-[#e8ddcc] bg-white shadow-lg">
                      {suggestions.map((s) => (
                        <li
                          key={s}
                          onMouseDown={() => {
                            setAddress(s);
                            setSuggestions([]);
                            setShowSuggestions(false);
                          }}
                          className="cursor-pointer truncate px-4 py-2.5 text-sm text-[#1a1c1e] hover:bg-[#fdf6ec]"
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {siteType === "campsite" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="relative flex items-center gap-3 rounded-xl border border-[#e8ddcc] bg-white px-4 py-3 sm:px-5">
                    <CalendarIcon className="h-5 w-5 shrink-0 text-[#8b8e94]" />
                    <span className="sr-only">Start date</span>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-base text-[#1a1c1e] outline-none sm:text-lg"
                    />
                  </label>
                  <label className="relative flex items-center gap-3 rounded-xl border border-[#e8ddcc] bg-white px-4 py-3 sm:px-5">
                    <span className="sr-only">End date</span>
                    <input
                      type="date"
                      required
                      min={startDate || undefined}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-base text-[#1a1c1e] outline-none sm:text-lg"
                    />
                  </label>
                </div>
              ) : (
                <label className="flex w-full items-center gap-3 rounded-xl border border-[#e8ddcc] bg-white px-4 py-3 sm:px-5">
                  <span className="text-sm font-medium whitespace-nowrap text-[#6d7279] sm:text-base">
                    Miles
                  </span>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.1"
                    value={trailDistance}
                    onChange={(e) => setTrailDistance(e.target.value)}
                    placeholder="8.5"
                    className="min-w-0 flex-1 bg-transparent text-base text-[#1a1c1e] outline-none placeholder:text-[#7b8189] sm:text-lg"
                  />
                </label>
              )}

              {siteType === "campsite" && (startDate || endDate) ? (
                <p className="text-center text-xs text-[#6b7078] sm:text-left">
                  Trip window:{" "}
                  <span className="text-[#9aa0a8]">{formatRangeInput(startDate, endDate)}</span>
                </p>
              ) : null}

              <button
                type="submit"
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ea8a12] px-5 py-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-110 sm:text-base"
              >
                Scout Area
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
                    {siteType === "campsite"
                      ? `Forecast window ${formatRange(startDate, endDate)}`
                      : `Trail distance planned: ${trailDistance} miles`}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-5">
                  <article className="flex shrink-0 flex-col justify-between rounded-2xl border border-[#eadfcd] bg-white p-5 shadow-sm xl:w-[240px]">
                    <div>
                      <p className="font-display text-center text-lg font-bold text-[#1a1c1e] sm:text-left">
                        Overall Safety Score
                      </p>
                      <div className="mt-3 flex flex-wrap items-end justify-center gap-3 sm:justify-start">
                        <p className="font-display text-4xl font-bold leading-none tracking-tight text-[#1a1c1e] sm:text-5xl">
                          {report.overallScore}
                        </p>
                        <span className="pb-2 text-lg text-[#888780]">/ 100</span>
                        {overall ? (
                          <span
                            className={`mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${overall.className}`}
                          >
                            {overall.label}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-4 text-center text-sm leading-relaxed text-[#888780] sm:text-left">
                        {report.status}.
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
                            strokeDashoffset={2 * Math.PI * 46 * (1 - report.overallScore / 100)}
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
                          {report.overallScore}
                        </span>
                      </div>
                    </div>
                  </article>

                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    {report.metrics.slice(0, 4).map((metric) => {
                      const primary = metricPrimary(metric);
                      const secondary = metricSecondary(metric);
                      const isExpanded = Boolean(expandedMetric[metric.label]);
                      const details = detailTextByMetric[metric.label] ?? [];

                      return (
                        <article
                          key={metric.label}
                          className="rounded-2xl border border-[#eadfcd] bg-white p-5 shadow-sm sm:min-h-[210px] sm:p-6"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-display text-base font-bold text-[#1a1c1e] sm:text-lg">
                              <span className="mr-1">{metric.icon}</span>
                              {metric.label === "Fire Risk"
                                ? "Fire Risk Level"
                                : metric.label === "Air Quality"
                                  ? "Air Quality Index"
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
                            {metric.label === "Air Quality" && chartData?.airQualityUnavailable ? "N/A" : primary.value}
                          </p>
                          <p className="mt-1 text-sm text-[#6b7078]">
                            {metric.label === "Air Quality" && chartData?.airQualityUnavailable ? "Air quality forecasts are only available 5 days ahead (CAMS model limit)" : primary.subtitle}
                          </p>
                          <p className="mt-2 text-xs text-[#8b8e94]">{metric.label === "Air Quality" && chartData?.airQualityUnavailable ? "" : secondary.line}</p>
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
                            <div className="mt-4 border-t border-[#d9dde3] pt-3 text-sm text-[#374151]">
                              <p>{metric.note}</p>
                              <div className="mt-2 space-y-2">
                                {details.map((detail) => (
                                  <p key={detail}>{detail}</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
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

          <div className={report ? "mt-10 border-t border-[#e5e7eb] pt-10" : "mt-10"}>
            <DashboardCharts
              chartSeed={chartSeed}
              temps={chartData?.temps}
              fireRisk={chartData?.fireRisk}
              airRisk={chartData?.airRisk}
              bearRisk={chartData?.bearRisk}
            />
          </div>
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
