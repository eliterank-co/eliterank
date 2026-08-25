import { describe, expect, it } from 'vitest';
import { KNOWN_TYPO_DOMAINS, suggestEmailCorrection } from './emailDomainTypos';

/**
 * The addresses traced to real hard bounces in the 2026-08 audit are the
 * fixtures — this guard exists to catch exactly these.
 */
describe('suggestEmailCorrection', () => {
  it.each([
    ['z.morales@gamil.com', 'z.morales@gmail.com'],
    ['someone@gmail.con', 'someone@gmail.com'],
    ['someone@hotmail.con', 'someone@hotmail.com'],
    ['someone@yahoo.cm', 'someone@yahoo.com'],
    ['someone@yahoo.co', 'someone@yahoo.com'],
  ])('corrects the audited bounce %s', (input, expected) => {
    expect(suggestEmailCorrection(input)).toBe(expected);
  });

  it('normalises case and whitespace', () => {
    expect(suggestEmailCorrection('  Ada.Lovelace@GAMIL.COM ')).toBe(
      'ada.lovelace@gmail.com',
    );
  });

  it('keeps the local part intact, including dots and plus-addressing', () => {
    expect(suggestEmailCorrection('ada.b+comps@gmial.com')).toBe(
      'ada.b+comps@gmail.com',
    );
  });

  /**
   * These matter more than the true positives: a false positive puts a
   * misleading prompt in front of a nominator entering a perfectly good
   * address. Every domain here is real and appears in live recipient data.
   */
  it.each([
    'ada@gmail.com',
    'ada@yahoo.ca',
    'ada@yahoo.es',
    'ada@hotmail.es',
    'ada@yahoo.co.uk',
    'ada@hotmail.co.uk',
    'ada@icloud.com',
    'ada@eliterank.co',
    'ada@somecompany.io',
  ])('leaves the legitimate domain in %s alone', (input) => {
    expect(suggestEmailCorrection(input)).toBeNull();
  });

  it('returns null for incomplete input instead of guessing', () => {
    for (const bad of ['', 'nope', '@gmail.com', 'ada@', 'ada@gmail', null, undefined]) {
      expect(suggestEmailCorrection(bad)).toBeNull();
    }
  });

  it('never maps a domain to itself', () => {
    for (const typo of KNOWN_TYPO_DOMAINS) {
      const suggestion = suggestEmailCorrection(`ada@${typo}`);
      expect(suggestion).not.toBeNull();
      expect(suggestion).not.toBe(`ada@${typo}`);
    }
  });
});
