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
You are briefing an experienced camper who is about to leave for their trip. 
They know camping. They do not need explanations of why risks are dangerous.

Write exactly 3 sentences. Each must be a concrete camping decision or action 
they can act on right now — what to pack, when to hike, where to set up camp, 
what to skip. Ordered from most to least urgent.

Rules:
- Use exact numbers from the data (temps, wind speed, AQI, precip %)
- Weave medical conditions and vulnerable members into camping advice naturally
  (e.g. "bring an extra inhaler" not "asthma sufferers face elevated risk")
- Never explain why something is dangerous — only what to do about it
- Every sentence must be specific to this location and this group

BAD: "With a broken neck in the group, avoid strenuous activity that could 
lead to re-injury."
GOOD: "Skip the ridge trail and set up base camp low — stick to flat ground 
given the neck injury in your group."

BAD: "High winds of 35mph pose a significant tent stability risk."  
GOOD: "Guy out your tent with extra stakes tonight — 35mph gusts expected."

LOCATION: ${address}
CONDITIONS:
- Temperature: low ${tempLow}°F, high ${tempHigh}°F
- Wind: ${windSpeed} mph  
- Precipitation: ${precipChance}% chance
- Air Quality Index: ${aqi}
- Fire Risk: ${fireRiskLabel}

GROUP:
- Vulnerable members: ${group.vulnerableMembers.join(", ") || "none"}
- Medical conditions: ${group.medicalConditions.join(", ") || "none"}
- Party size: ${partySize}, ${tripDays} nights
- Notes: ${userNotes || "none"}
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

