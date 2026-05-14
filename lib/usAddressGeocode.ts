/**
 * Resolve a free-text address to coordinates using the same Nominatim query
 * variants and US filter as `/api/conditions`, so validation matches trip scoring.
 */
export async function resolveUsAddress(address: string): Promise<
  | { ok: true; lat: number; lon: number; displayName?: string }
  | { ok: false }
> {
  const trimmed = address.trim();
  if (!trimmed) return { ok: false };

  const queryVariants = [
    trimmed,
    trimmed.replace(/\s+\d{5}(?:-\d{4})?$/, "").trim(),
    trimmed.split(",").map((part) => part.trim()).slice(-3).join(", "),
    trimmed.split(",").map((part) => part.trim()).slice(-2).join(", "),
  ];
  const uniqueQueries = Array.from(new Set(queryVariants.filter(Boolean)));

  for (const query of uniqueQueries) {
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`;
    const geoRes = await fetch(geocodeUrl, { headers: { "User-Agent": "scout-app" } });
    if (!geoRes.ok) continue;

    const geoData = (await geoRes.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (Array.isArray(geoData) && geoData.length > 0) {
      const hit = geoData[0];
      const lat = parseFloat(hit.lat);
      const lon = parseFloat(hit.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {
          ok: true,
          lat,
          lon,
          displayName: typeof hit.display_name === "string" ? hit.display_name : undefined,
        };
      }
    }
  }

  return { ok: false };
}
