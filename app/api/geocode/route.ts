import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json([]);

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`;
  const res = await fetch(url, { headers: { "User-Agent": "scout-app" } });
  if (!res.ok) return NextResponse.json([]);

  const data: { display_name: string }[] = await res.json();
  return NextResponse.json(data.map((r) => r.display_name));
}
