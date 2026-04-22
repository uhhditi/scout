export type SafetyMetric = {
  label: string;
  value: number;
  note: string;
  icon: string;
};

export type SafetyReport = {
  overallScore: number;
  status: string;
  metrics: SafetyMetric[];
};

function boundedScore(seed: number, min = 30, max = 95) {
  return min + (seed % (max - min + 1));
}

export async function getSafetyReport(
  address: string,
  startDate: string,
  endDate: string,
): Promise<SafetyReport> {
  // This mock generator can be replaced with real API calls later.
  const base = `${address.trim().toLowerCase()}|${startDate}|${endDate}`;
  let hash = 0;

  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 33 + base.charCodeAt(i)) >>> 0;
  }

  const fireRiskScore = boundedScore(hash + 13);
  const airQualityScore = boundedScore(hash + 29);
  const waterAccessScore = boundedScore(hash + 43);
  const weatherAlertnessScore = boundedScore(hash + 59);
  const overallScore = Math.round(
    (fireRiskScore +
      airQualityScore +
      waterAccessScore +
      weatherAlertnessScore) /
      4,
  );

  const status =
    overallScore >= 80
      ? "Great conditions"
      : overallScore >= 65
        ? "Use caution"
        : "High risk day";

  return {
    overallScore,
    status,
    metrics: [
      {
        label: "Fire Risk",
        value: fireRiskScore,
        note:
          fireRiskScore >= 75
            ? "Low wildfire pressure expected."
            : "Bring backup safety gear and check local advisories.",
        icon: "🔥",
      },
      {
        label: "Air Quality",
        value: airQualityScore,
        note:
          airQualityScore >= 75
            ? "Breathing conditions look favorable."
            : "Sensitive groups should limit long exposure.",
        icon: "🌬️",
      },
      {
        label: "Water Access",
        value: waterAccessScore,
        note:
          waterAccessScore >= 75
            ? "Nearby refill points look reliable."
            : "Pack extra water and filtration options.",
        icon: "💧",
      },
      {
        label: "Weather Alertness",
        value: weatherAlertnessScore,
        note:
          weatherAlertnessScore >= 75
            ? "Forecast appears stable."
            : "Monitor local weather updates before departure.",
        icon: "⛅",
      },
    ],
  };
}
