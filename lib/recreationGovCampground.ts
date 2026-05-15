/**
 * RIDB / Recreation.gov helpers for campground search (facility media images).
 */

/** Basic YYYY-MM-DD range validation (start <= end, both parseable as UTC calendar dates). */
export function isValidTripYmdRange(startYmd: string, endYmd: string): boolean {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startYmd.trim());
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endYmd.trim());
  if (!m1 || !m2) return false;
  const ys = Number(m1[1]);
  const ms = Number(m1[2]);
  const ds = Number(m1[3]);
  const ye = Number(m2[1]);
  const me = Number(m2[2]);
  const de = Number(m2[3]);
  const start = new Date(Date.UTC(ys, ms - 1, ds));
  const end = new Date(Date.UTC(ye, me - 1, de));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (start.getUTCFullYear() !== ys || start.getUTCMonth() !== ms - 1 || start.getUTCDate() !== ds) return false;
  if (end.getUTCFullYear() !== ye || end.getUTCMonth() !== me - 1 || end.getUTCDate() !== de) return false;
  return start <= end;
}

/** First HTTPS or HTTP image URL from RIDB facility media list. */
export async function fetchRidbFacilityImageUrl(
  facilityId: string,
  ridbApiKey: string,
  limiter: { acquire: () => Promise<void> },
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  await limiter.acquire();
  const url = `https://ridb.recreation.gov/api/v1/facilities/${encodeURIComponent(facilityId)}/media?limit=12`;
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      apikey: ridbApiKey,
      "User-Agent": "scout-app/1.0 (campground search)",
    },
  });
  if (!res.ok) return null;
  let data: { RECDATA?: Record<string, unknown>[] };
  try {
    data = (await res.json()) as { RECDATA?: Record<string, unknown>[] };
  } catch {
    return null;
  }
  const rows = Array.isArray(data.RECDATA) ? data.RECDATA : [];
  for (const row of rows) {
    const u = row.MediaURL ?? row.MediaUrl ?? row.URL ?? row.url ?? row.URLAddress;
    if (typeof u === "string" && /^https?:\/\//i.test(u)) {
      return u;
    }
  }
  return null;
}
