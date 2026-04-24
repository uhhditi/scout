// Risk Scoring Functions - Convert raw API data to 1-100 risk scores
// Higher score = higher risk

/**
 * Fire Risk Score (1-100)
 * Based on: Active fire proximity, weather conditions (wind, precipitation), season
 * Now considers the entire trip window by taking the maximum risk across all days
 */
export function calculateFireRisk(
  fireData: any[],
  weatherDaily: {
    weathercode: number[];
    precipitation_sum: number[];
    windspeed_10m_max: number[];
  },
  startDate: string,
  endDate: string
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  let maxRisk = 0;

  for (let dayIndex = 0; dayIndex < Math.min(days, weatherDaily.weathercode.length); dayIndex++) {
    let score = 5; // baseline - most days are low risk

    // Factor 1: Active fires nearby (NASA FIRMS data)
    if (fireData && fireData.length > 0) {
      score += 40; // significant risk if fires detected nearby
    }

    // Factor 2: Low precipitation = higher fire risk
    const precipitation = weatherDaily.precipitation_sum[dayIndex] || 0;
    if (precipitation < 1) {
      score += 20;
    } else if (precipitation < 5) {
      score += 10;
    } else if (precipitation > 10) {
      score -= 10; // Wet = lower risk
    }

    // Factor 3: High winds = higher fire risk
    const windSpeed = weatherDaily.windspeed_10m_max[dayIndex] || 0;
    if (windSpeed > 40) {
      score += 25;
    } else if (windSpeed > 30) {
      score += 15;
    } else if (windSpeed > 20) {
      score += 8;
    }

    // Factor 4: Weather conditions
    const weatherCode = weatherDaily.weathercode[dayIndex] || 0;
    // Codes 80-82 (showers), 95-99 (thunderstorms) = lower fire risk
    if ([80, 81, 82, 95, 96, 99].includes(weatherCode)) {
      score -= 15;
    }

    const dayRisk = Math.max(1, Math.min(100, score));
    maxRisk = Math.max(maxRisk, dayRisk);
  }

  return maxRisk;
}

/**
 * Air Quality Risk Score (1-100)
 * Based on: US AQI index
 * US AQI Scale: 0-50 (Good), 51-100 (Moderate), 101-150 (Unhealthy for Sensitive), 151-200 (Unhealthy), 201-300 (Very Unhealthy), 301+ (Hazardous)
 */
export function calculateAirQualityRisk(usAqiValues: number[]): number {
  if (!usAqiValues || usAqiValues.length === 0) return 20;

  // Get average AQI over the time period
  const avgAqi = usAqiValues.reduce((a, b) => a + b, 0) / usAqiValues.length;

  if (avgAqi > 300) return 100; // Hazardous
  if (avgAqi > 200) return 85; // Very unhealthy
  if (avgAqi > 150) return 70; // Unhealthy
  if (avgAqi > 100) return 55; // Unhealthy for sensitive groups
  if (avgAqi > 50) return 35; // Moderate
  return 15; // Good
}

/**
 * Weather Alertness Score (1-100)
 * Based on: Storm risk, precipitation, extreme wind, severe weather codes
 * Now considers the entire trip window by taking the maximum alertness across all days
 */
export function calculateWeatherAlertness(
  weatherDaily: {
    weathercode: number[];
    precipitation_sum: number[];
    windspeed_10m_max: number[];
  },
  startDate: string,
  endDate: string
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  let maxAlertness = 0;

  for (let dayIndex = 0; dayIndex < Math.min(days, weatherDaily.weathercode.length); dayIndex++) {
    let score = 20; // baseline

    const weatherCode = weatherDaily.weathercode[dayIndex] || 0;
    const precipitation = weatherDaily.precipitation_sum[dayIndex] || 0;
    const windSpeed = weatherDaily.windspeed_10m_max[dayIndex] || 0;

    // Severe thunderstorms (95-99)
    if ([95, 96, 99].includes(weatherCode)) {
      score += 50;
    }
    // Regular thunderstorms/showers (80-82)
    else if ([80, 81, 82].includes(weatherCode)) {
      score += 30;
    }
    // Rain (51-67)
    else if ([51, 53, 55, 61, 63, 65, 66, 67].includes(weatherCode)) {
      score += 15;
    }
    // Sleet/snow (71-77, 85-86)
    else if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
      score += 35;
    }

    // Heavy precipitation
    if (precipitation > 20) {
      score += 20;
    } else if (precipitation > 10) {
      score += 10;
    } else if (precipitation > 5) {
      score += 5;
    }

    // Extreme wind
    if (windSpeed > 50) {
      score += 30;
    } else if (windSpeed > 40) {
      score += 20;
    } else if (windSpeed > 30) {
      score += 10;
    }

    const dayAlertness = Math.max(1, Math.min(100, score));
    maxAlertness = Math.max(maxAlertness, dayAlertness);
  }

  return maxAlertness;
}

/**
 * Water Access Score (1-100)
 * Lower score = better access to water
 * Based on: Proximity to water features from OSM
 */
export function calculateWaterAccess(
  hasNearbyWater: boolean,
  distanceToWaterKm?: number
): number {
  // If water is nearby, score is LOW (good access = low risk)
  if (hasNearbyWater) {
    if (distanceToWaterKm && distanceToWaterKm < 0.5) {
      return 10; // Water very close
    }
    if (distanceToWaterKm && distanceToWaterKm < 2) {
      return 25; // Water close
    }
    return 35; // Water in area
  }

  // No water nearby = higher score (harder to find water = higher risk)
  return 75;
}

/**
 * Bear Risk Score (1-100)
 * Based on: Elevation, season, location type
 */
export function calculateBearRisk(
  elevation: number,
  latitude: number,
  month: number
): number {
  let score = 20; // baseline

  // Elevation factor: Bears more common in mountainous areas
  if (elevation > 2500) {
    score += 35; // High mountain
  } else if (elevation > 1500) {
    score += 20; // Mid-mountain
  } else if (elevation > 500) {
    score += 10; // Foothills
  }

  // Season factor: Bears more active in certain months
  // Spring (3-5): Emerging from hibernation, hungry
  if (month >= 3 && month <= 5) {
    score += 15;
  }
  // Summer (6-8): Active, cubs around
  else if (month >= 6 && month <= 8) {
    score += 20;
  }
  // Fall (9-11): Fattening up, more aggressive
  else if (month >= 9 && month <= 11) {
    score += 25;
  }
  // Winter (12, 1-2): Hibernating, lower activity
  else {
    score -= 15;
  }

  // Latitude factor: Different bear species in different regions
  // Northern latitudes = grizzly/polar bears (more aggressive)
  if (latitude > 50) {
    score += 20;
  } else if (latitude > 45) {
    score += 10;
  }

  return Math.max(1, Math.min(100, score));
}

/**
 * Bear danger rating (1-5)
 * 5 = highest expected bear activity
 */
export function getBearDangerRating(
  elevation: number,
  latitude: number,
  month: number
): number {
  const score = calculateBearRisk(elevation, latitude, month);

  if (score >= 80) return 5; // Extreme
  if (score >= 60) return 4; // High
  if (score >= 40) return 3; // Moderate
  if (score >= 25) return 2; // Low
  return 1; // Minimal
}

/**
 * Overall Safety Score (0-10)
 * Weighted by real-world severity of each risk class
 */
export function calculateOverallSafetyScore(
  fireRisk: number,
  airQualityRisk: number,
  weatherAlertness: number,
  waterAccess: number,
  bearRisk: number
): number {
  const fireSafety = 100 - fireRisk;
  const airSafety = 100 - airQualityRisk;
  const weatherSafety = 100 - weatherAlertness;
  const waterSafety = 100 - waterAccess;
  const bearSafety = 100 - bearRisk;

  const weighted =
    fireSafety * 0.3 +
    weatherSafety * 0.25 +
    airSafety * 0.2 +
    waterSafety * 0.15 +
    bearSafety * 0.1;

  // Convert 0-100 to 0-10 rounded to 1 decimal.
  return Math.round(weighted) / 10;
}

/**
 * Get risk level label
 */
export function getRiskLevel(
  score: number
): string {
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
