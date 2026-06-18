/**
 * Amenity tags and description blurbs for campground cards — facility description only.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentence boundaries — ignore periods in decimals (e.g. 1.5). */
function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  const re = /(?<!\d)[.!?]+(?=\s+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    while (start < text.length && /\s/.test(text[start]!)) start += 1;
    if (start > re.lastIndex) re.lastIndex = start;
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

function firstTwoSentences(text: string): string {
  if (!text) return "";
  const sentences = splitSentences(text);
  if (sentences.length === 0) return text;
  return sentences.slice(0, 2).join(" ").trim();
}

/** First two sentences of the Overview section (RIDB HTML). */
export function extractOverviewBlurb(html: string): string {
  const overviewMatch = html.match(/<h2[^>]*>\s*Overview\s*<\/h2>([\s\S]*?)(?=<h2|$)/i);
  let chunk: string;
  if (overviewMatch) {
    chunk = overviewMatch[1];
  } else {
    const beforeFirstH2 = html.split(/<h2/i)[0] ?? "";
    if (stripHtml(beforeFirstH2).trim()) {
      chunk = beforeFirstH2;
    } else {
      const firstSection = html.match(/<h2[^>]*>[^<]*<\/h2>([\s\S]*?)(?=<h2|$)/i);
      chunk = firstSection ? firstSection[1] : html;
    }
  }
  return firstTwoSentences(stripHtml(chunk).trim());
}

type FacilityRule = {
  tag: string;
  test: (facility: string) => boolean;
};

const FACILITY_RULES: FacilityRule[] = [
  {
    tag: "🚿 Showers",
    test: (f) => /\bshowers?\b/.test(f) && !/\bno\b.{0,30}\bshowers?\b/.test(f),
  },
  {
    tag: "🚻 Flush toilets",
    test: (f) => /\bflush toilets?\b/.test(f) && !/\bno\b.{0,30}\bflush toilets?\b/.test(f),
  },
  {
    tag: "💧 Drinking water",
    test: (f) => /\bdrinking water\b/.test(f) && !/\bno\b.{0,30}\bdrinking water\b/.test(f),
  },
  {
    tag: "⚡ Electric hookups",
    test: (f) =>
      (/\bfull hook-?up\b/.test(f) || /\belectric hookups?\b/.test(f)) &&
      !/\bno\b.{0,30}\bhook-?ups?\b/.test(f) &&
      !/\bno electrical hookups?\b/.test(f),
  },
  {
    tag: "💧 Water hookups",
    test: (f) =>
      (/\bfull hook-?up\b/.test(f) || /\bwater hookups?\b/.test(f)) &&
      !/\bno\b.{0,30}\bhook-?ups?\b/.test(f),
  },
  {
    tag: "🔌 Sewer hookup",
    test: (f) =>
      (/\bfull hook-?up\b/.test(f) || /\bsewer hookup\b/.test(f)) &&
      !/\bno\b.{0,30}\bhook-?ups?\b/.test(f),
  },
  { tag: "🗑️ Dump station", test: (f) => /\bdump station\b/.test(f) },
  {
    tag: "♿ Accessible",
    test: (f) => /\baccessible\b/.test(f) || /\bada\b/.test(f),
  },
  { tag: "🐻 Food storage lockers", test: (f) => /\bfood storage locker\b/.test(f) },
  {
    tag: "🐾 Pets allowed",
    test: (f) =>
      !/\b(no pets|pets not allowed|pets prohibited|not permitted)\b/.test(f) &&
      (/\bpets?\s+(are\s+)?allowed\b/.test(f) || /\bpet[- ]friendly\b/.test(f)),
  },
  {
    tag: "🚫 No pets",
    test: (f) => /\b(no pets|pets not allowed|pets prohibited|not permitted)\b/.test(f),
  },
  {
    tag: "🔥 Campfires",
    test: (f) => /\bcampfire rings?\b/.test(f) || /\bfire rings?\b/.test(f),
  },
  { tag: "🍳 Grills", test: (f) => /\bgrill\b/.test(f) },
  { tag: "🧺 Picnic tables", test: (f) => /\bpicnic tables?\b/.test(f) },
  { tag: "⛺ Tent-only area", test: (f) => /\btent only\b/.test(f) },
  { tag: "👥 Group sites", test: (f) => /\bgroup campsites?\b/.test(f) || /\bgroup sites?\b/.test(f) },
  { tag: "🐴 Horse / equestrian", test: (f) => /\bhorse campsites?\b/.test(f) || /\bequestrian\b/.test(f) },
  { tag: "🏪 General store nearby", test: (f) => /\bgeneral store\b/.test(f) },
  { tag: "ℹ️ Visitor center", test: (f) => /\bvisitor center\b/.test(f) },
  { tag: "📶 Cell service", test: (f) => /\bcell (phone )?service\b/.test(f) },
];

export function extractRidbAmenityTagsFromFacility(facilityText: string): string[] {
  const facility = stripHtml(facilityText).toLowerCase();
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const rule of FACILITY_RULES) {
    if (rule.test(facility) && !seen.has(rule.tag)) {
      seen.add(rule.tag);
      tags.push(rule.tag);
    }
  }

  return tags.slice(0, 12);
}
