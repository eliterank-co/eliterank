import { describe, it, expect } from 'vitest';
import { classifyHoneypot, honeypotShape, shouldRejectHoneypot, CHECKBOX_TRIPPED } from './_honeypot.js';

const voter = { firstName: 'Neveen', lastName: 'Faress', email: 'nfaress84@gmail.com' };

/**
 * The rule these tests pin down was written against 13 hours of production
 * data: 8 honeypot events, 7 of them `unrelated` + `textLike`, every one
 * carrying a browser fingerprint and a 4-29s fill time, with distinct values
 * across distinct networks and distinct contestant pages. Arbitrary text in
 * this field is a browser writing a saved profile value into a control the
 * voter cannot see — not evidence of a bot.
 */
describe('shouldRejectHoneypot', () => {
  it('passes the normal case — an untouched trap', () => {
    expect(shouldRejectHoneypot('', voter)).toMatchObject({ reject: false, rule: 'empty' });
    expect(shouldRejectHoneypot(undefined, voter)).toMatchObject({ reject: false, rule: 'empty' });
  });

  it('rejects a ticked checkbox — autofill cannot produce this', () => {
    expect(shouldRejectHoneypot(CHECKBOX_TRIPPED, voter)).toMatchObject({ reject: true, rule: 'checkbox' });
    expect(shouldRejectHoneypot(' ON ', voter)).toMatchObject({ reject: true, rule: 'checkbox' });
  });

  it('rejects payloads no address book holds', () => {
    expect(shouldRejectHoneypot('http://spam.example/x', voter)).toMatchObject({ reject: true, rule: 'payload' });
    expect(shouldRejectHoneypot('<a href="#">x</a>', voter)).toMatchObject({ reject: true, rule: 'payload' });
    expect(shouldRejectHoneypot('a'.repeat(61), voter)).toMatchObject({ reject: true, rule: 'payload' });
    expect(shouldRejectHoneypot('$%^&*{}', voter)).toMatchObject({ reject: true, rule: 'payload' });
  });

  it('rejects a truthy non-string — never came from a form control', () => {
    expect(shouldRejectHoneypot(42, voter)).toMatchObject({ reject: true, rule: 'payload' });
    expect(shouldRejectHoneypot({}, voter)).toMatchObject({ reject: true, rule: 'payload' });
  });

  it('passes a saved profile value spilled by autofill', () => {
    // These are the shapes production actually produced. A voter is not a bot
    // because Chrome filled a field they cannot see.
    for (const v of ['Royal LePage Realty', '123 Bay St', '+1 416-555-1234', 'Toronto', "O'Brien & Sons"]) {
      expect(shouldRejectHoneypot(v, voter)).toMatchObject({ reject: false, rule: 'autofill' });
    }
  });

  it('passes an echo of the voter’s own field', () => {
    for (const v of ['Neveen', 'Faress', 'Neveen Faress', 'nfaress84@gmail.com']) {
      expect(shouldRejectHoneypot(v, voter).reject).toBe(false);
    }
  });

  it('still reports the verdict and shape for the logs', () => {
    expect(shouldRejectHoneypot('Neveen', voter)).toMatchObject({ verdict: 'firstName', shape: 'textLike' });
    expect(shouldRejectHoneypot('Royal LePage', voter)).toMatchObject({ verdict: 'unrelated', shape: 'textLike' });
  });
});

describe('classifyHoneypot', () => {
  it('names the visible field a value duplicates', () => {
    expect(classifyHoneypot('Neveen', voter)).toBe('firstName');
    expect(classifyHoneypot('Faress', voter)).toBe('lastName');
    expect(classifyHoneypot('Neveen Faress', voter)).toBe('fullName');
    expect(classifyHoneypot('nfaress84@gmail.com', voter)).toBe('email');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(classifyHoneypot('  neveen  ', voter)).toBe('firstName');
  });

  it('reports unrelated for a value the voter never typed', () => {
    expect(classifyHoneypot('Royal LePage Realty', voter)).toBe('unrelated');
  });

  it('does not match a blank visible field against a filled honeypot', () => {
    expect(classifyHoneypot('Neveen', { firstName: '', lastName: '', email: '' })).toBe('unrelated');
  });
});

describe('honeypotShape', () => {
  it('flags links and markup', () => {
    expect(honeypotShape('http://spam.example/x')).toBe('link');
    expect(honeypotShape('www.spam.example')).toBe('link');
  });

  it('flags oversized payloads', () => {
    expect(honeypotShape('a'.repeat(61))).toBe('long');
  });

  it('reads saved profile data as text, including phone numbers and emails', () => {
    expect(honeypotShape('Royal LePage Realty')).toBe('textLike');
    expect(honeypotShape('+1 416-555-1234')).toBe('textLike');
    expect(honeypotShape('someone@example.com')).toBe('textLike');
  });

  it('reports empty for the normal case', () => {
    expect(honeypotShape('')).toBe('empty');
    expect(honeypotShape(null)).toBe('empty');
  });
});
