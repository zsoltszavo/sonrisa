/**
 * Apostrophe-like characters are ambiguous: in "Pāpa‘ikou" (USGS place, ʻokina) they sit inside
 * a word, in "Côte d’Ivoire" or "L'Aquila" they separate words. `normaliseText` joins across
 * them; `normalisedVariants` also offers the split form so both readings can match.
 * Replaced before NFKD, which would turn "´" into a space plus a combining accent.
 */
const APOSTROPHES = /['`´‘’ʹʻʼ]/gu;
const COMBINING_MARKS = /\p{M}/gu;
const NON_WORD_RUNS = /[^\p{L}\p{N}]+/gu;

/** Latin letters NFKD doesn't decompose, so stripping accents alone leaves them as they are. */
const LETTER_FOLDS: Record<string, string> = {
  ı: 'i',
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ħ: 'h',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};
const FOLDABLE = new RegExp(`[${Object.keys(LETTER_FOLDS).join('')}]`, 'gu');

/**
 * Canonical form of text for Keyword matching (D4): lower case, accents stripped (also
 * "ł", "ı", "ß", ...), every run of non-letter/non-digit characters collapsed to one space, trimmed.
 *
 * Decomposition (NFKD) runs before lower-casing: compatibility forms like "𝜜" (math bold) only
 * become a cased letter ("Α") after NFKD, and "İ" decomposes to "I" + a combining dot that is
 * stripped before it can reappear via `toLowerCase()`. Found by the idempotency property test.
 */
export function normaliseText(text: string): string {
  return normalise(text, '');
}

/** Both readings of apostrophes (joining and word-breaking); one entry when the text has none. */
export function normalisedVariants(text: string): string[] {
  return [...new Set([normalise(text, ''), normalise(text, ' ')])];
}

function normalise(text: string, apostrophe: '' | ' '): string {
  return text
    .replace(APOSTROPHES, apostrophe)
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(FOLDABLE, (letter) => LETTER_FOLDS[letter] ?? letter)
    .replace(NON_WORD_RUNS, ' ')
    .trim();
}

/**
 * Whole word/phrase containment on already-normalised text. Both sides are space-separated
 * tokens, so padding with spaces gives word boundaries without `\b` (which is ASCII-only in JS).
 */
export function containsPhrase(normalisedText: string, normalisedPhrase: string): boolean {
  if (normalisedPhrase === '') return false;
  return ` ${normalisedText} `.includes(` ${normalisedPhrase} `);
}
