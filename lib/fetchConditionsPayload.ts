export type ConditionsPayload = {
  location: { lat: number; lon: number; elevation: number | null };
  weather: Record<string, unknown>;
  weatherUnavailable: boolean;
  weatherUnavailableReason?: string;
  airQuality: Record<string, unknown>;
  airQualityUnavailable: boolean;
  fire: Array<Record<string, unknown>>;
  forecastNotice?: string;
  forecastWindowUsed?: { startDate: string; endDate: string };
};

export async function fetchConditionsPayload(params: {
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
  distanceMiles: number;
  /** Called before each outbound HTTP request (e.g. rate limiting). */
  beforeOutboundFetch?: () => Promise<void>;
}): Promise<ConditionsPayload | { error: string; status: number }> {
  const { lat, lon, startDate, endDate, distanceMiles, beforeOutboundFetch } = params;

  let elevation: number | null = null;
  const elevationUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
  await beforeOutboundFetch?.();
  const elevationRes = await fetch(elevationUrl);
  if (elevationRes.ok) {
    const elevationData = (await elevationRes.json()) as { elevation?: number[] };
    const value = elevationData?.elevation?.[0];
    elevation = typeof value === "number" ? value : null;
  }

  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) {
    return { error: "Invalid date format", status: 400 };
  }

  const maxForecastDate = new Date();
  maxForecastDate.setDate(maxForecastDate.getDate() + 16);
  const clampedStart = startDateObj > maxForecastDate ? maxForecastDate : startDateObj;
  const clampedEndCandidate = endDateObj > maxForecastDate ? maxForecastDate : endDateObj;
  const clampedEnd = clampedEndCandidate < clampedStart ? clampedStart : clampedEndCandidate;

  const formattedStart = clampedStart.toISOString().split("T")[0];
  const formattedEnd = clampedEnd.toISOString().split("T")[0];
  const forecastDateClamped = startDateObj > maxForecastDate || endDateObj > maxForecastDate;

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,precipitation_sum,precipitation_probability_max,windspeed_10m_max,temperature_2m_max` +
    `&temperature_unit=fahrenheit&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`;
  const airQualityUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=us_aqi&timezone=auto&start_date=${formattedStart}&end_date=${formattedEnd}`;
  const distanceNum = Number.isFinite(distanceMiles) ? Math.max(1, Math.round(distanceMiles)) : 10;
  const fireSearchRadiusKm = Math.max(distanceNum * 1.4, 25);
  const latOffset = fireSearchRadiusKm / 111.32;
  const lonOffset = fireSearchRadiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - latOffset;
  const maxLat = lat + latOffset;
  const minLon = lon - lonOffset;
  const maxLon = lon + lonOffset;
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  const fireParams = new URLSearchParams({
    f: "json",
    where: "1=1",
    geometry: bbox,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
  });
  const fireUrl =
    `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/` +
    `WFIGS_Incident_Locations_Current/FeatureServer/0/query?${fireParams.toString()}`;

  await beforeOutboundFetch?.();
  await beforeOutboundFetch?.();
  await beforeOutboundFetch?.();
  const [weatherRes, airRes, fireRes] = await Promise.all([
    fetch(weatherUrl),
    fetch(airQualityUrl),
    fetch(fireUrl, {
      headers: {
        "User-Agent": "scout-app",
        Accept: "application/json",
      },
    }),
  ]);

  let weatherData: Record<string, unknown> = { daily: {} };
  let weatherUnavailable = false;
  let weatherUnavailableReason: string | undefined;

  if (!weatherRes.ok) {
    weatherUnavailable = true;
    weatherUnavailableReason =
      "Weather forecast data is not available for this request. Trip dates may be beyond the forecast window (about 16 days from today), or the weather service may be temporarily unavailable.";
  } else {
    try {
      weatherData = (await weatherRes.json()) as Record<string, unknown>;
    } catch {
      weatherUnavailable = true;
      weatherUnavailableReason = "Weather forecast data could not be read. Please try again in a moment.";
    }
  }

  const daily = (weatherData?.daily ?? {}) as Record<string, unknown>;
  const hasDailySeries =
    Array.isArray(daily.time) && daily.time.length > 0
      ? true
      : Array.isArray(daily.temperature_2m_max) && daily.temperature_2m_max.length > 0;

  if (!weatherUnavailable && !hasDailySeries) {
    weatherUnavailable = true;
    weatherUnavailableReason =
      "No daily weather forecast was returned for this date range. If your trip starts far in the future, try dates within the next two weeks for full scoring.";
  }

  const airQualityUnavailable = !airRes.ok;
  const airData = airRes.ok ? await airRes.json() : { hourly: { us_aqi: [] } };

  let fireData: Array<Record<string, unknown>> = [];
  if (fireRes.ok) {
    const fireJson = (await fireRes.json()) as { features?: unknown[] };
    const features = Array.isArray(fireJson?.features) ? fireJson.features : [];
    fireData = (features as Array<{ geometry?: { x?: number; y?: number }; attributes?: Record<string, unknown> }>)
      .filter((feature) => {
        const category = String(feature?.attributes?.IncidentTypeCategory ?? "").toUpperCase();
        return category === "WF";
      })
      .map((feature) => {
        const fy = feature?.geometry?.y;
        const fx = feature?.geometry?.x;
        if (typeof fy !== "number" || typeof fx !== "number") {
          return null;
        }
        return {
          lat: fy,
          lon: fx,
          incidentName: feature.attributes?.IncidentName ?? null,
          incidentSize: feature.attributes?.IncidentSize ?? null,
          dailyAcres: feature.attributes?.DailyAcres ?? null,
          state: feature.attributes?.POOState ?? null,
          discoveryDateTime: feature.attributes?.FireDiscoveryDateTime ?? null,
        } as Record<string, unknown>;
      })
      .filter((row): row is Record<string, unknown> => row !== null);
  }

  return {
    location: { lat, lon, elevation },
    weather: weatherData,
    weatherUnavailable,
    ...(weatherUnavailableReason ? { weatherUnavailableReason } : {}),
    airQuality: airData as Record<string, unknown>,
    airQualityUnavailable,
    fire: fireData,
    ...(forecastDateClamped
      ? {
          forecastNotice:
            "Forecast inputs were capped to the latest available weather window (up to 16 days ahead).",
          forecastWindowUsed: {
            startDate: formattedStart,
            endDate: formattedEnd,
          },
        }
      : {}),
  };
}
