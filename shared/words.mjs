// The one word normaliser shared by the CLI and the engine. Keep this file dependency-free: the engine bundles it
// for the browser and the CLI imports it directly.
//
// Rules: NFC, lowercase, keep Unicode letters (Devanagari included), combining marks, digits and ASCII apostrophes;
// strip danda and every other punctuation mark. Typographic apostrophes are treated as ASCII apostrophes so a curly
// quote in a source still matches a straight quote in a script.
export function normalizeWord(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}']/gu, '');
}

/** Split on whitespace, normalise every token, drop tokens that are only punctuation. */
export function normalizedTokens(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

export function countWords(text) {
  return normalizedTokens(text).length;
}

export function normalizedText(text) {
  return normalizedTokens(text).join(' ');
}
