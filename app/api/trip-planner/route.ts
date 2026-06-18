import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
  }

  let description: string;
  try {
    const body = await request.json();
    description = typeof body.description === "string" ? body.description.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: "Please describe your trip" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: `Today is ${today}. Extract camping trip details from the user's message and fill in smart defaults for anything missing.

LOCATION rules:
- If the user names a specific park, campground, forest, or wilderness area → use it directly.
- If the user mentions a city or general area (e.g. "Seattle", "near Denver", "around LA", "Pacific Northwest", "California mountains") → convert to the single most iconic/popular camping destination in that area, NOT the city (e.g. "Seattle" → "Olympic National Park, WA", "Denver" → "Rocky Mountain National Park, CO", "LA" → "Angeles National Forest, CA", "Pacific Northwest" → "Mount Rainier National Park, WA").
- If the user gives absolutely no location context at all → return location as empty string.

DATE rules:
- If specific dates are given → use them.
- If a month is mentioned without specific days → pick the first full weekend of that month (Friday to Sunday).
- If no date or month is mentioned at all → use the nearest upcoming weekend from today (${today}).
- Always return YYYY-MM-DD format.

Map companions to these exact values only: "Just me", "Partner", "Friends", "Kids", "Elderly", "Pets". Map health concerns to: "Asthma", "Allergies", "Mobility issues", "Heart condition".`,
          }],
        },
        contents: [{ role: "user", parts: [{ text: description }] }],
        generationConfig: {
          temperature: 0,
          response_mime_type: "application/json",
          response_schema: {
            type: "object",
            properties: {
              location: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              companions: { type: "array", items: { type: "string" } },
              healthConcerns: { type: "array", items: { type: "string" } },
            },
            required: ["location", "startDate", "endDate"],
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Gemini error (${res.status}): ${err.slice(0, 200)}` },
      { status: res.status >= 400 && res.status < 600 ? res.status : 500 }
    );
  }

  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not parse trip details from your description. Try being more specific about location and dates." }, { status: 422 });
  }

  const location = typeof parsed.location === "string" ? parsed.location.trim() : "";
  const startDate = typeof parsed.startDate === "string" ? parsed.startDate.trim() : "";
  const endDate = typeof parsed.endDate === "string" ? parsed.endDate.trim() : "";

  const result = {
    location,
    startDate,
    endDate,
    companions: Array.isArray(parsed.companions) ? parsed.companions as string[] : [],
    healthConcerns: Array.isArray(parsed.healthConcerns) ? parsed.healthConcerns as string[] : [],
    complete: Boolean(location && startDate && endDate),
  };

  console.log("[trip-planner] parsed:", JSON.stringify(result, null, 2));

  return NextResponse.json(result);
}
