import { type SafetyReport } from "@/lib/safetyReport";
import {
  calculateFireRisk,
  calculateAirQualityRisk,
  calculateWeatherAlertness,
  calculateBearRisk,
  getBearDangerRating,
  calculateOverallSafetyScore,
  calculateElevationMobilityRisk,
  terrainRoughnessLabel,
  applyGroupMultipliers,
  type GroupProfile,
  type RiskScores,
  getRiskLevel,
  getNearestFireDistanceKm,
  extractFireCoordinates,
} from "@/lib/riskScoring";
import { type WeatherContext } from "@/lib/gearRecommender";
import { kmToMiles, kmhToMph, metersToFeet, mmToInches } from "@/lib/geoUnits";
import { getAirQualityLabel, getAirQualityRating, getExtremeWeatherLabel } from "@/lib/airQualityCopy";
import { type ConditionsPayload } from "@/lib/fetchConditionsPayload";

export type { ConditionsPayload };

export type TripReportResult = {
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
  terrainDifficultyScore: number;
  terrainDifficultyLevel: number;
  terrainElevationDetails: string[];
  terrainLabel: string;
  nwsAlertEvents: string[];
  airQualityUnavailable: boolean;
  conditionsNotice?: string;
  dataSummaryIncomplete?: boolean;
  forecastNotice?: string;
  forecastWindowUsed?: {
    startDate: string;
    endDate: string;
  };
  weatherCtx: WeatherContext;
};

/**
 * Builds the same trip safety report used on the dashboard from a conditions API payload
 * (weather, air, fire, location) plus trip dates and group profile.
 */
export function buildReportResultFromConditionsPayload(
  payload: ConditionsPayload,
  startDate: string,
  endDate: string,
  groupProfile: GroupProfile
): TripReportResult {
  const {
    weather,
    airQuality,
    airQualityUnavailable: airQualityUnavailableRaw,
    fire,
    location,
    forecastNotice,
    forecastWindowUsed,
  } = payload;
  const weatherUnavailableFlag = Boolean(payload.weatherUnavailable);
  const weatherUnavailableReason =
    typeof payload.weatherUnavailableReason === "string" ? payload.weatherUnavailableReason.trim() : "";
  const airQualityUnavailable = Boolean(airQualityUnavailableRaw);

  const wildlifeData = { bears: 0 };

  const rawDaily = (weather?.daily ?? {}) as Record<string, number[]>;
  const weatherDaily = {
    weathercode: Array.isArray(rawDaily?.weathercode) ? rawDaily.weathercode : [],
    precipitation_sum: Array.isArray(rawDaily?.precipitation_sum) ? rawDaily.precipitation_sum : [],
    windspeed_10m_max: Array.isArray(rawDaily?.windspeed_10m_max) ? rawDaily.windspeed_10m_max : [],
    temperature_2m_max: Array.isArray(rawDaily?.temperature_2m_max) ? rawDaily.temperature_2m_max : [],
  };
  const tempsEarly = weatherDaily.temperature_2m_max;
  const missingWeather = weatherUnavailableFlag || tempsEarly.length === 0;

  const airHourly = (airQuality?.hourly as { us_aqi?: number[] } | undefined)?.us_aqi || [];

  let fireRisk = calculateFireRisk(fire, weatherDaily, startDate, endDate, location?.lat, location?.lon);
  if (missingWeather) {
    fireRisk = Math.max(fireRisk, 38);
  }
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
  let weatherAlertness = calculateWeatherAlertness(weatherDaily, startDate, endDate);
  if (missingWeather) {
    weatherAlertness = Math.max(weatherAlertness, 38);
  }
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
  let weatherHazardDetails = [
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
    ...Array.from(seenMonths).map((m) => getBearDangerRating(areaElevation, location?.lat || 39, m))
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
    location?.lat != null && location?.lon != null ? getNearestFireDistanceKm(fire, location.lat, location.lon) : null;
  let fireDetails = [
    firePointCount > 0
      ? nearestFireKm != null
        ? `${firePointCount} active fire hotspot(s) were observed in the last 5 days. Nearest is about ${kmToMiles(nearestFireKm).toFixed(1)} mi from your campsite, which increases wildfire concern nearby.`
        : `${firePointCount} active fire hotspot(s) were observed in the last 5 days within your search area, increasing wildfire concern nearby.`
      : "No active fire hotspots were observed in the last 5 days in your search area.",
    `Weather impact: peak wind is ${kmhToMph(strongestWind).toFixed(1)} mph (${windLevel}), and precipitation ranges ${mmToInches(driestDay).toFixed(2)}-${mmToInches(wettestDay).toFixed(2)} in (${precipitationLevel}). Higher wind with lower rainfall increases fire spread potential.`,
  ];
  if (missingWeather) {
    const wmsg =
      weatherUnavailableReason ||
      "Weather forecast data was not available for this trip window. If your trip is far in the future, try dates within the next two weeks for full scoring.";
    fireDetails = [
      wmsg,
      "Wind and precipitation context was not available to model fire-weather impact for this trip.",
    ];
    weatherHazardDetails = [
      wmsg,
      "Plan layers, rain protection, and a quick shelter strategy before reaching remote sections.",
    ];
  }
  const bearRiskDetails = [
    `Your area elevation is ${Math.round(metersToFeet(areaElevation))} ft, and higher elevation areas generally see more bear activity.`,
    "Store all food and scented items in bear-proof containers or hang them properly.",
  ];
  const baseTerrainScore = calculateElevationMobilityRisk(areaElevation, 0);
  const terrainDifficultyScore = baseTerrainScore;
  const terrainDifficultyLevel = Math.max(1, Math.min(5, Math.ceil(terrainDifficultyScore / 20)));
  const terrainLabel = terrainRoughnessLabel(0);
  const terrainElevationDetails: string[] = [
    `Elevation: ${Math.round(metersToFeet(areaElevation))} ft — ${terrainLabel.toLowerCase()} terrain.${areaElevation > 2000 ? " High altitude increases physical effort and acclimatization time." : areaElevation > 1000 ? " Moderate elevation with some stamina demands on trail." : " Relatively low elevation."}`,
  ];

  const overallSafetyRaw = calculateOverallSafetyScore(fireRisk, airQualityRisk, weatherAlertness, bearRisk);
  const maxTemp = (weatherDaily.temperature_2m_max || []).length ? Math.max(...weatherDaily.temperature_2m_max) : 20;
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
      note: "Fire risk index based on hotspot detections from the last 5 days plus forecast conditions.",
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
      rawPeakTempF: tempsWindow.length ? Math.round(Math.max(...tempsWindow) * 9 / 5 + 32) : undefined,
    },
    {
      label: "Bear Risk",
      value: 100 - bearRisk,
      note: "Bear activity risk based on wildlife data and season.",
      icon: "🐻",
    },
  ];

  const rainCodes = new Set([51, 53, 55, 61, 63, 65, 67, 80, 81, 82]);
  const thunderCodes = new Set([95, 96, 99]);
  const weatherCtx: WeatherContext = {
    hasRain:
      !missingWeather &&
      (weatherCodeWindow.some((c: number) => rainCodes.has(c)) || precipitationWindow.some((p: number) => p > 1)),
    highFireRisk: fireRisk >= 30,
    isCold: !missingWeather && (weatherDaily.temperature_2m_max || []).some((t: number) => t < 13),
    isHighAltitude: (location?.elevation ?? 0) > 2500,
    hasThunderstorm: !missingWeather && weatherCodeWindow.some((c: number) => thunderCodes.has(c)),
    highBearRisk: bearDangerRating >= 3,
    poorAirQuality: !airQualityUnavailable && airQualityRisk > 40,
  };

  const noticeParts: string[] = [];
  if (missingWeather) {
    noticeParts.push(
      weatherUnavailableReason ||
        "Weather forecast data was not available for this trip window. If your trip is far in the future, try dates within the next two weeks for full scoring."
    );
  }
  if (forecastNotice) noticeParts.push(forecastNotice);
  const conditionsNotice = noticeParts.length > 0 ? noticeParts.join(" ") : undefined;
  const dataSummaryIncomplete = missingWeather;

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
    nwsAlertEvents: [],
    airQualityUnavailable: !!airQualityUnavailable,
    conditionsNotice,
    dataSummaryIncomplete,
    forecastNotice,
    forecastWindowUsed,
    weatherCtx,
  };
}
