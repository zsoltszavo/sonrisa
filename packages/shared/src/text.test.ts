import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { containsPhrase, normalisedVariants, normaliseText } from './text.js';

describe('normaliseText', () => {
  it.each([
    ['São Paulo', 'sao paulo'],
    ['ZÜRICH', 'zurich'],
    ['Pāpa‘ikou, Hawaii', 'papaikou hawaii'],
    ["Côte d'Ivoire", 'cote divoire'],
    ['İstanbul', 'istanbul'],
    ['  POLO-26 ,  Bosnia & Herzegovina ', 'polo 26 bosnia herzegovina'],
    ['ﬁre', 'fire'],
    ['東京 地震', '東京 地震'],
    ['!!!', ''],
    ['Diyarbakır', 'diyarbakir'],
    ['Łódź', 'lodz'],
    ['Straße', 'strasse'],
    ['Tromsø', 'tromso'],
    ['L´Aquila', 'laquila'],
  ])('%j → %j', (input, expected) => {
    expect(normaliseText(input)).toBe(expected);
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (s) => {
        const once = normaliseText(s);
        expect(normaliseText(once)).toBe(once);
      }),
    );
  });

  it('ignores case', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme-ascii' }), (s) => {
        expect(normaliseText(s.toUpperCase())).toBe(normaliseText(s));
      }),
    );
  });
});

describe('normalisedVariants', () => {
  it('offers the joined and the split reading of an apostrophe', () => {
    expect(normalisedVariants('L’Aquila')).toEqual(['laquila', 'l aquila']);
  });

  it('has one entry when there is no apostrophe', () => {
    expect(normalisedVariants('São Paulo')).toEqual(['sao paulo']);
  });
});

describe('containsPhrase', () => {
  it('matches whole words, not substrings', () => {
    expect(containsPhrase('market turmoil deepens', 'oil')).toBe(false);
    expect(containsPhrase('oil prices fall', 'oil')).toBe(true);
  });

  it('matches a phrase only as consecutive words', () => {
    expect(containsPhrase('the san andreas fault', 'san andreas')).toBe(true);
    expect(containsPhrase('san jose and andreas', 'san andreas')).toBe(false);
  });

  it('never matches an empty phrase', () => {
    expect(containsPhrase('anything', '')).toBe(false);
    expect(containsPhrase('', '')).toBe(false);
  });
});
