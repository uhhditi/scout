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
            text: `Today is ${today}. Extract camping trip details from the user's message. If a month is mentioned without a year, use the next upcoming occurrence. Map companions to these exact values only: "Just me", "Partner", "Friends", "Kids", "Elderly", "Pets". Map health concerns to: "Asthma", "Allergies", "Mobility issues", "Heart condition". Return startDate and endDate as YYYY-MM-DD. If no specific dates given, pick a weekend in the stated month.`,
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

  return NextResponse.json({
    location,
    startDate,
    endDate,
    companions: Array.isArray(parsed.companions) ? parsed.companions as string[] : [],
    healthConcerns: Array.isArray(parsed.healthConcerns) ? parsed.healthConcerns as string[] : [],
    complete: Boolean(location && startDate && endDate),
  });
}
