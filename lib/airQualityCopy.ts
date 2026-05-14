export function getAirQualityLabel(rating: number): string {
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

export function getAirQualityRating(avgAqi: number): number {
  if (avgAqi > 200) return 5;
  if (avgAqi > 150) return 4;
  if (avgAqi > 100) return 3;
  if (avgAqi > 50) return 2;
  return 1;
}

export function getExtremeWeatherLabel(score: number): string {
  if (score >= 80) return "Severe conditions expected";
  if (score >= 60) return "Significant weather risk";
  if (score >= 40) return "Moderate weather risk";
  if (score >= 25) return "Minor weather risk";
  return "Calm conditions";
}
