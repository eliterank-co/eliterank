import { describe, it, expect } from 'vitest';
import {
  splitCustomAnswers,
  hasCustomAnswer,
  countAnsweredCustomQuestions,
  resolveNominationFormConfig,
} from './nominationFormDefaults';

describe('splitCustomAnswers', () => {
  it('separates cq_-prefixed custom answers from eligibility keys', () => {
    const blob = {
      lives_in_area: true,
      is_single: false,
      cq_abc123: 'Yes',
      cq_def456: true,
    };
    const { eligibility, custom } = splitCustomAnswers(blob);
    expect(eligibility).toEqual({ lives_in_area: true, is_single: false });
    expect(custom).toEqual({ cq_abc123: 'Yes', cq_def456: true });
  });

  it('returns empty buckets for null / non-object input', () => {
    expect(splitCustomAnswers(null)).toEqual({ eligibility: {}, custom: {} });
    expect(splitCustomAnswers(undefined)).toEqual({ eligibility: {}, custom: {} });
    expect(splitCustomAnswers('nope')).toEqual({ eligibility: {}, custom: {} });
  });

  it('is round-trippable — merging the two buckets rebuilds the blob', () => {
    const blob = { age_eligible: true, cq_x: 'hi' };
    const { eligibility, custom } = splitCustomAnswers(blob);
    expect({ ...eligibility, ...custom }).toEqual(blob);
  });
});

describe('hasCustomAnswer', () => {
  const q = (id, type = 'short_text') => ({ id, type });

  it('counts non-empty strings as answered, blank/whitespace as not', () => {
    expect(hasCustomAnswer(q('cq_1'), { cq_1: 'guy' })).toBe(true);
    expect(hasCustomAnswer(q('cq_1'), { cq_1: '   ' })).toBe(false);
    expect(hasCustomAnswer(q('cq_1'), { cq_1: '' })).toBe(false);
  });

  it('counts booleans (yes/no, checkbox) as answered — including false', () => {
    expect(hasCustomAnswer(q('cq_1', 'yes_no'), { cq_1: true })).toBe(true);
    expect(hasCustomAnswer(q('cq_1', 'yes_no'), { cq_1: false })).toBe(true);
    expect(hasCustomAnswer(q('cq_1', 'checkbox'), { cq_1: false })).toBe(true);
  });

  it('treats missing / null as not answered', () => {
    expect(hasCustomAnswer(q('cq_1'), {})).toBe(false);
    expect(hasCustomAnswer(q('cq_1'), { cq_1: null })).toBe(false);
    expect(hasCustomAnswer(q('cq_1'), null)).toBe(false);
    expect(hasCustomAnswer(null, { cq_1: 'x' })).toBe(false);
  });
});

describe('countAnsweredCustomQuestions', () => {
  const questions = [
    { id: 'cq_1', type: 'short_text' },
    { id: 'cq_2', type: 'yes_no' },
  ];

  it('counts only questions with a response', () => {
    expect(countAnsweredCustomQuestions(questions, { cq_1: 'hi' })).toBe(1);
    expect(countAnsweredCustomQuestions(questions, { cq_1: 'hi', cq_2: false })).toBe(2);
    expect(countAnsweredCustomQuestions(questions, {})).toBe(0);
    expect(countAnsweredCustomQuestions(questions, null)).toBe(0);
  });

  it('ignores eligibility keys and answers to unconfigured questions', () => {
    expect(
      countAnsweredCustomQuestions(questions, { lives_in_area: true, cq_removed: 'orphan' })
    ).toBe(0);
  });

  it('returns 0 for a non-array question list', () => {
    expect(countAnsweredCustomQuestions(undefined, { cq_1: 'hi' })).toBe(0);
  });
});

describe('resolveNominationFormConfig (guard)', () => {
  it('returns no custom questions for null / malformed config', () => {
    expect(resolveNominationFormConfig(null).custom_questions).toEqual([]);
    expect(resolveNominationFormConfig({}).custom_questions).toEqual([]);
    expect(resolveNominationFormConfig({ custom_questions: 'bad' }).custom_questions).toEqual([]);
  });
});
