const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
]);

/**
 * If RIDB/Recreation.gov returns SHOUTING ALL CAPS names, convert to readable title case.
 * Mixed-case names from the API are left unchanged.
 */
export function normalizeCampgroundDisplayName(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return s;
  const looksAllCaps = letters === letters.toUpperCase();
  if (!looksAllCaps) return s;

  return s
    .split(/\s+/)
    .map((token, i) =>
      token
        .split("-")
        .map((part) => {
          const lower = part.toLowerCase();
          if (i > 0 && SMALL_WORDS.has(lower)) return lower;
          return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : part;
        })
        .join("-")
    )
    .join(" ");
}
