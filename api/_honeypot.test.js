import { describe, it, expect } from 'vitest';
import { classifyHoneypot, honeypotShape, isAutofillSpill } from './_honeypot.js';

/**
 * The honeypot rejection carries only a UA today, and every event in
 * production carries the same frozen Chrome UA — which every Android Chrome
 * reports. These two helpers add what the UA cannot say: whether the value is
 * the voter's own data spilled by autofill, or something a bot wrote.
 */
describe('classifyHoneypot', () => {
  const voter = { firstName: 'Neveen', lastName: 'Faress', email: 'nfaress84@gmail.com' };

  it('reports empty for the normal case', () => {
    expect(classifyHoneypot('', voter)).toBe('empty');
    expect(classifyHoneypot(undefined, voter)).toBe('empty');
  });

  it('names the visible field an autofill spill duplicates', () => {
    expect(classifyHoneypot('Neveen', voter)).toBe('firstName');
    expect(classifyHoneypot('Faress', voter)).toBe('lastName');
    expect(classifyHoneypot('Neveen Faress', voter)).toBe('fullName');
    expect(classifyHoneypot('nfaress84@gmail.com', voter)).toBe('email');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(classifyHoneypot('  neveen  ', voter)).toBe('firstName');
  });

  it('reports unrelated for a value the voter never typed', () => {
    // The #668 mechanism — a saved organization — lands here, and so does a
    // bot payload. honeypotShape() is what tells those two apart.
    expect(classifyHoneypot('Royal LePage Realty', voter)).toBe('unrelated');
    expect(classifyHoneypot('http://spam.example/x', voter)).toBe('unrelated');
  });

  it('does not match a blank visible field against a filled honeypot', () => {
    expect(classifyHoneypot('Neveen', { firstName: '', lastName: '', email: '' })).toBe('unrelated');
  });
});

describe('honeypotShape', () => {
  it('flags links and markup', () => {
    expect(honeypotShape('http://spam.example/x')).toBe('link');
    expect(honeypotShape('www.spam.example')).toBe('link');
    expect(honeypotShape('<a href="#">x</a>')).toBe('link');
  });

  it('flags oversized payloads', () => {
    expect(honeypotShape('a'.repeat(61))).toBe('long');
  });

  it('reads a saved organization or address line as text', () => {
    expect(honeypotShape('Royal LePage Realty')).toBe('textLike');
    expect(honeypotShape("O'Brien & Sons, Inc.")).toBe('textLike');
    expect(honeypotShape('123 Bay St')).toBe('textLike');
  });

  it('reports empty for the normal case', () => {
    expect(honeypotShape('')).toBe('empty');
    expect(honeypotShape(null)).toBe('empty');
  });
});

describe('isAutofillSpill', () => {
  const voter = { firstName: 'Neveen', lastName: 'Faress', email: 'nfaress84@gmail.com' };

  it('lets a voter through when the trap holds their own data', () => {
    for (const v of ['Neveen', 'Faress', 'Neveen Faress', 'nfaress84@gmail.com']) {
      expect(isAutofillSpill(classifyHoneypot(v, voter))).toBe(true);
    }
  });

  it('still blocks a value the voter never typed', () => {
    expect(isAutofillSpill(classifyHoneypot('Royal LePage Realty', voter))).toBe(false);
    expect(isAutofillSpill(classifyHoneypot('http://spam.example/x', voter))).toBe(false);
  });

  it('blocks a truthy non-string honeypot — autofill only ever writes strings', () => {
    expect(isAutofillSpill(classifyHoneypot(42, voter))).toBe(false);
    expect(isAutofillSpill(classifyHoneypot({}, voter))).toBe(false);
  });
});
