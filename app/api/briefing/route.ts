import { NextResponse } from "next/server";

type BriefingRequest = {
  address: string;
  conditions: {
    tempLow: number;
    tempHigh: number;
    windSpeed: number;
    precipChance: number;
    aqi: number;
    fireRiskLabel: "low" | "moderate" | "high" | "extreme";
  };
  scores: {
    overall: number;
    weather: number;
    temperature: number;
    wind: number;
    precipitation: number;
    fire: number;
    airQuality: number;
  };
  group: {
    vulnerableMembers: string[];
    medicalConditions: string[];
  };
  partySize: string;
  tripDays: number;
  userNotes: string;
};

function buildPrompt(payload: BriefingRequest): string {
  const { address, conditions, scores, group, partySize, tripDays, userNotes } = payload;
  const { tempLow, tempHigh, windSpeed, precipChance, aqi, fireRiskLabel } = conditions;
  return `
You are an enthusiastic camping safety advisor. Based on the data below, write a concise safety briefing in exactly 3 sentences. Each sentence must be complete. Be specific and actionable, do not repeat the scores back.

LOCATION:
- Address: ${address}

CONDITIONS (what's actually happening):
- Temperature: low ${tempLow}°F, high ${tempHigh}°F
- Wind: ${windSpeed} mph
- Precipitation: ${precipChance}% chance
- Air Quality Index: ${aqi}
- Fire Risk: ${fireRiskLabel} (low/moderate/high/extreme)

RISK SCORES (1-10, higher = more dangerous):
- Overall: ${scores.overall}
- Weather: ${scores.weather}
- Temperature: ${scores.temperature}
- Wind: ${scores.wind}
- Precipitation: ${scores.precipitation}
- Fire: ${scores.fire}
- Air Quality: ${scores.airQuality}

GROUP PROFILE:
- Vulnerable members: ${group.vulnerableMembers.join(", ") || "none"}
- Medical conditions: ${group.medicalConditions.join(", ") || "none"}
- Party size: ${partySize}
- Trip duration: ${tripDays} nights
- Additional notes: ${userNotes || "none"}

Use specific numbers from the conditions above (exact temperatures, wind speed, AQI etc).
Format each sentence as a direct actionable instruction starting with a verb.
Mention the location by name where relevant.
Do NOT give generic advice — every sentence must have advice and reference something specific from the data above.
`;
}

function extractBriefing(data: unknown): string {
  return (
    (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY (or GOOGLE_API_KEY).", briefing: null },
        { status: 200 }
      );
    }

    const payload = (await request.json()) as BriefingRequest;
    const prompt = buildPrompt(payload);
    console.log("[briefing] Gemini prompt:\n", prompt);
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => "");
      console.log("Gemini error:", `Model ${model} failed (${geminiRes.status}). ${detail}`);
      return NextResponse.json(
        {
          error: "Gemini request failed.",
          detail,
          briefing: null,
        },
        { status: 200 }
      );
    }

    const data = await geminiRes.json();
    const briefing = extractBriefing(data);
    console.log("[briefing] Gemini output:\n", briefing);
    return NextResponse.json({ briefing: briefing || null });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error generating briefing.",
        briefing: null,
      },
      { status: 200 }
    );
  }
}

