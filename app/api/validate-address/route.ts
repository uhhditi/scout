import { NextRequest, NextResponse } from "next/server";
import { resolveUsAddress } from "@/lib/usAddressGeocode";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (!address) {
    return NextResponse.json({ ok: false, error: "Enter an address to continue." }, { status: 400 });
  }

  const resolved = await resolveUsAddress(address);
  if (!resolved.ok) {
    return NextResponse.json({
      ok: false,
      error: "We could not find that location. Try a more specific street address, a nearby landmark, or city and state.",
    });
  }

  return NextResponse.json({
    ok: true,
    normalizedLabel: resolved.displayName ?? null,
    lat: resolved.lat,
    lon: resolved.lon,
  });
}
