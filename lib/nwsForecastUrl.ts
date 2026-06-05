/** NWS forecast page for a lat/lon (opens weather.gov / NOAA). */
export function buildNwsForecastUrl(lat: number, lon: number): string {
  const url = new URL("https://forecast.weather.gov/MapClick.php");
  url.searchParams.set("lat", lat.toFixed(4));
  url.searchParams.set("lon", lon.toFixed(4));
  return url.toString();
}
