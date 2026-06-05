import { NextRequest, NextResponse } from "next/server";
import { resolveUsAddress } from "@/lib/usAddressGeocode";
import { haversineMiles } from "@/lib/haversineMiles";
import { scoreCampgroundAmenityFit } from "@/lib/campgroundFit";
import { getCampgroundSearchOutboundLimiter } from "@/lib/outboundRateLimiter";
import { fetchRidbFacilityImageUrl, isValidTripYmdRange } from "@/lib/recreationGovCampground";
import { normalizeCampgroundDisplayName } from "@/lib/normalizeCampgroundDisplayName";
import { fetchConditionsPayload } from "@/lib/fetchConditionsPayload";
import { buildReportResultFromConditionsPayload } from "@/lib/tripReportFromConditionsPayload";
import { groupProfileFromWizardSelections } from "@/lib/groupProfileFromWizard";
import { extractOverviewBlurb, extractRidbAmenityTagsFromFacility } from "@/lib/extractRidbAmenityTags";

export const maxDuration = 60;

type CampgroundsBody = {
  address?: string;
  startDate?: string;
  endDate?: string;
  distance?: number;
  companions?: string[];
  healthConcerns?: string[];
  tripSafetyScore?: number;
};

function ridbFacilityCoords(f: Record<string, unknown>): { lat: number; lon: number } | null {
  const latRaw = f.FacilityLatitude;
  const lonRaw = f.FacilityLongitude;
  const lat = typeof latRaw === "number" ? latRaw : parseFloat(String(latRaw ?? ""));
  const lon = typeof lonRaw === "number" ? lonRaw : parseFloat(String(lonRaw ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/** RIDB often omits Reservable; only drop when explicitly false. */
function isExplicitlyNonReservable(reservable: unknown): boolean {
  if (reservable === false) return true;
  if (reservable === 0) return true;
  if (typeof reservable !== "string") return false;
  const s = reservable.trim().toLowerCase();
  return s === "false" || s === "no" || s === "0";
}

function facilityDescriptionLooksClosed(desc: string): boolean {
  const d = desc.trim();
  if (!d) return false;
  if (/\b(temporarily\s+closed|no\s+reservations)\b/i.test(d)) return true;
  if (/\bnot\s+accepting\s+reservations\b/i.test(d)) return true;
  if (/\bclosed\s+(?:for|to|until|through)\b/i.test(d)) return true;
  if (/\b(?:campground|facility|area|park)\s+(?:is\s+)?closed\b/i.test(d)) return true;
  return false;
}

function normalizeTripSafetyScore(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  const x = raw > 10 ? raw / 10 : raw;
  return Math.max(0, Math.min(10, Math.round(x * 10) / 10));
}

function blendedRankScore(
  safetyScore: number,   // 0–10
  amenityScore: number,  // 0–100
  distanceMiles: number, // actual miles
  maxSearchRadius = 50
): number {
  const safetyNorm  = safetyScore / 10;
  const amenityNorm = amenityScore / 100;
  const distanceNorm = 1 - Math.min(distanceMiles / maxSearchRadius, 1);
  // Safety 40% · proximity 40% · amenity fit 20%
  return safetyNorm * 0.40 + distanceNorm * 0.40 + amenityNorm * 0.20;
}

const MAX_LISTED = 5;
const SAME_SAFETY_SCORE_RADIUS_MILES = 15;

export async function POST(request: NextRequest) {
  const apiKey = process.env.RIDB_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      code: "missing_api_key",
      message:
        "Add RIDB_API_KEY to .env.local (free Recreation Information Database key from recreation.gov) to search and rank nearby federal campgrounds.",
      results: [],
    });
  }

  let body: CampgroundsBody;
  try {
    body = (await request.json()) as CampgroundsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  const distanceMiles =
    typeof body.distance === "number" && Number.isFinite(body.distance) && body.distance > 0
      ? Math.min(50, Math.round(body.distance))
      : 10;
  const companions = Array.isArray(body.companions)
    ? body.companions.filter((x) => typeof x === "string")
    : [];
  const healthConcerns = Array.isArray(body.healthConcerns)
    ? body.healthConcerns.filter((x) => typeof x === "string")
    : [];
  const tripSafetyScore = normalizeTripSafetyScore(body.tripSafetyScore);
  const groupProfile = groupProfileFromWizardSelections(companions, healthConcerns);

  if (!address || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing address, startDate, or endDate" }, { status: 400 });
  }
  if (!isValidTripYmdRange(startDate, endDate)) {
    return NextResponse.json({ error: "Invalid startDate or endDate" }, { status: 400 });
  }

  const resolved = await resolveUsAddress(address);
  if (!resolved.ok) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  const limiter = getCampgroundSearchOutboundLimiter();
  const originLat = resolved.lat;
  const originLon = resolved.lon;
  const searchRadiusMiles = Math.min(100, Math.max(10, distanceMiles * 4));

  const ridbUrl = new URL("https://ridb.recreation.gov/api/v1/facilities");
  ridbUrl.searchParams.set("latitude", String(originLat));
  ridbUrl.searchParams.set("longitude", String(originLon));
  ridbUrl.searchParams.set("radius", String(searchRadiusMiles));
  ridbUrl.searchParams.set("activity", "9,109");
  ridbUrl.searchParams.set("full", "true");
  ridbUrl.searchParams.set("limit", "100");

  await limiter.acquire();
  const ridbRes = await fetch(ridbUrl, {
    headers: {
      Accept: "application/json",
      apikey: apiKey,
      "User-Agent": "scout-app/1.0 (campground search)",
    },
  });

  if (!ridbRes.ok) {
    const snippet = await ridbRes.text().catch(() => "");
    return NextResponse.json(
      {
        ok: false,
        code: "ridb_error",
        message: `RIDB request failed (${ridbRes.status}). Check RIDB_API_KEY and try again.`,
        detail: snippet.slice(0, 240),
        results: [],
      },
      { status: 502 }
    );
  }

  const ridbJson = (await ridbRes.json()) as { RECDATA?: Record<string, unknown>[] };
  const rawList = Array.isArray(ridbJson.RECDATA) ? ridbJson.RECDATA : [];

  // ── Pass 1: filter, score amenities, sort by amenity fit ─────────────────
  const candidates = rawList
    .map((f) => {
      if (isExplicitlyNonReservable(f.Reservable)) return null;
      const descHtml = String(f.FacilityDescription ?? "");
      if (facilityDescriptionLooksClosed(descHtml)) return null;
      const coords = ridbFacilityCoords(f);
      if (!coords) return null;
      const dMi = haversineMiles(originLat, originLon, coords.lat, coords.lon);
      const name = String(f.FacilityName ?? "Campground");
      const keywords = String(f.Keywords ?? "");
      const attrs = Array.isArray(f.ATTRIBUTES)
        ? (f.ATTRIBUTES as Record<string, unknown>[])
            .map((a) => `${String(a.AttributeName ?? "")}: ${String(a.AttributeValue ?? "")}`)
            .join(", ")
        : "";
      const amenityBlob = [name, descHtml, keywords, attrs].filter(Boolean).join(" · ");
      const id = String(f.FacilityID ?? f.LegacyFacilityID ?? "");
      if (!id) return null;
      const { highlights, amenityMatchScore } = scoreCampgroundAmenityFit({
        amenityText: amenityBlob,
        companions,
        healthConcerns,
      });
      const overviewBlurb = extractOverviewBlurb(descHtml);
      return {
        id,
        name,
        lat: coords.lat,
        lon: coords.lon,
        dMi,
        amenityBlob,
        amenityMatchScore,
        highlights,
        overviewBlurb,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => {
      if (b.amenityMatchScore !== a.amenityMatchScore) return b.amenityMatchScore - a.amenityMatchScore;
      return a.dMi - b.dMi;
    })
    .slice(0, MAX_LISTED);

  // ── Pass 2: compute safety score for each candidate in parallel ──────────
  const withSafety = await Promise.all(
    candidates.map(async (row) => {
      // Within radius — reuse trip score, no extra API call
      if (row.dMi <= SAME_SAFETY_SCORE_RADIUS_MILES) {
        return {
          ...row,
          safetyScore: tripSafetyScore,
          safetyScoreUsesTripOrigin: true,
          safetyScoreFallback: false,
        };
      }

      // Beyond radius — rescore at campground coordinates
      try {
        const payload = await fetchConditionsPayload({
          lat: row.lat,
          lon: row.lon,
          startDate,
          endDate,
          distanceMiles,
          beforeOutboundFetch: () => limiter.acquire(),
        });
        if ("error" in payload) {
          return {
            ...row,
            safetyScore: tripSafetyScore,
            safetyScoreUsesTripOrigin: false,
            safetyScoreFallback: true,
          };
        }
        const { report } = buildReportResultFromConditionsPayload(payload, startDate, endDate, groupProfile);
        return {
          ...row,
          safetyScore: normalizeTripSafetyScore(report.overallScore),
          safetyScoreUsesTripOrigin: false,
          safetyScoreFallback: false,
        };
      } catch {
        return {
          ...row,
          safetyScore: tripSafetyScore,
          safetyScoreUsesTripOrigin: false,
          safetyScoreFallback: true,
        };
      }
    })
  );

  // ── Pass 3: re-rank by blended score, take top 5 ────────────────────────
  const reranked = withSafety
    .map((row) => ({
      ...row,
      rankScore: blendedRankScore(row.safetyScore, row.amenityMatchScore, row.dMi, searchRadiusMiles),
    }))
    .sort((a, b) => b.rankScore - a.rankScore);

  // ── Pass 4: fetch images for final 5 in parallel ────────────────────────
  const results = (
    await Promise.all(
      reranked.map(async (row) => {
        const imageUrl = await fetchRidbFacilityImageUrl(row.id, apiKey, limiter);

        const { highlights: enrichedHighlights, amenityMatchScore: enrichedAmenityScore } = scoreCampgroundAmenityFit({
          amenityText: row.amenityBlob,
          companions,
          healthConcerns,
        });

        const ridbAmenityTags = extractRidbAmenityTagsFromFacility(row.amenityBlob);

        return {
          facilityId: row.id,
          name: normalizeCampgroundDisplayName(row.name),
          distanceMiles: Math.round(row.dMi * 10) / 10,
          latitude: row.lat,
          longitude: row.lon,
          amenityMatchScore: enrichedAmenityScore,
          highlights: enrichedHighlights,
          bookUrl: `https://www.recreation.gov/camping/campgrounds/${encodeURIComponent(row.id)}`,
          overviewBlurb: row.overviewBlurb,
          ridbAmenityTags,
          imageUrl,
          safetyScore: row.safetyScore,
          safetyScoreUsesTripOrigin: row.safetyScoreUsesTripOrigin,
          safetyScoreFallback: row.safetyScoreFallback,
          rankScore: Math.round(row.rankScore * 1000) / 1000,
        };
      })
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({
    ok: true,
    tripSafetyScore,
    origin: { lat: originLat, lon: originLon },
    results,
    attribution:
      "Campground names, descriptions, attributes, and photos from RIDB. Listings are for planning only — always confirm fees, rules, and availability on Recreation.gov before booking. Risk scores match your trip dashboard within 15 miles; farther sites use the same model at campground coordinates. Scout does not process payments.",
  });
}