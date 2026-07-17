import { describe, it, expect } from 'vitest';
import { isValidEmail, normalizeEmail, EMAIL_REGEX } from './email';

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('jane@example.com')).toBe(true);
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.domain.io')).toBe(true);
  });

  it('accepts regardless of surrounding whitespace or case', () => {
    expect(isValidEmail('  Jane@Example.COM  ')).toBe(true);
  });

  it('extracts and accepts a "Name <addr>" contact string', () => {
    expect(isValidEmail('Jane Doe <jane@x.com>')).toBe(true);
  });

  it('rejects the junk that used to slip through (the original bug)', () => {
    expect(isValidEmail('idk')).toBe(false);
    expect(isValidEmail('n/a')).toBe(false);
    expect(isValidEmail('.')).toBe(false);
  });

  it('rejects empty / whitespace / nullish', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('   ')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });

  it('rejects addresses that the old `.includes("@")` check wrongly accepted', () => {
    expect(isValidEmail('@')).toBe(false);
    expect(isValidEmail('x@')).toBe(false);
    expect(isValidEmail('idk@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('requires a dot in the domain (no bare-domain typos)', () => {
    expect(isValidEmail('mg.17chiquis@gmail')).toBe(false); // real recoverable typo from prod
    expect(isValidEmail('a@b')).toBe(false);
  });

  it('rejects internal whitespace', () => {
    expect(isValidEmail('foo bar@example.com')).toBe(false);
    expect(isValidEmail('foo @example.com')).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases so storage has one canonical form', () => {
    expect(normalizeEmail('  Jane@Example.COM ')).toBe('jane@example.com');
  });

  it('extracts a bare address from "Name <addr>"', () => {
    expect(normalizeEmail('Jane Doe <Jane@X.com>')).toBe('jane@x.com');
  });

  it('returns empty string for nullish/blank so callers can do `|| null`', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail('   ')).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });

  it('leaves junk untouched (still invalid, just normalized text)', () => {
    // normalizeEmail does not validate — it only canonicalizes.
    expect(normalizeEmail('IDK')).toBe('idk');
  });

  it('two casings of the same address normalize identically (dedupe safety)', () => {
    expect(normalizeEmail('Person@Site.com')).toBe(normalizeEmail('person@site.COM'));
  });
});

describe('EMAIL_REGEX', () => {
  it('is exported for any callers that need the raw pattern', () => {
    expect(EMAIL_REGEX.test('jane@example.com')).toBe(true);
    expect(EMAIL_REGEX.test('idk')).toBe(false);
  });
});
