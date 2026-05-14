import { NextRequest, NextResponse } from "next/server";
import { resolveUsAddress } from "@/lib/usAddressGeocode";
import { fetchConditionsPayload } from "@/lib/fetchConditionsPayload";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const distance = searchParams.get("distance");

  if (!startDate || !endDate || !distance) {
    return NextResponse.json({ error: "Missing startDate, endDate, or distance" }, { status: 400 });
  }

  let lat: number;
  let lon: number;

  if (latParam != null && latParam !== "" && lonParam != null && lonParam !== "") {
    lat = parseFloat(latParam);
    lon = parseFloat(lonParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "Invalid lat or lon" }, { status: 400 });
    }
  } else if (address) {
    const resolved = await resolveUsAddress(address);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: "Address not found. Try a more specific address, nearby landmark, or city/state." },
        { status: 404 }
      );
    }
    lat = resolved.lat;
    lon = resolved.lon;
  } else {
    return NextResponse.json({ error: "Provide address or both lat and lon" }, { status: 400 });
  }

  const distanceNum = parseInt(distance, 10) || 10;
  const payload = await fetchConditionsPayload({
    lat,
    lon,
    startDate,
    endDate,
    distanceMiles: distanceNum,
  });

  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }

  return NextResponse.json(payload);
}
