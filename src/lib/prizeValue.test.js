import { describe, expect, it } from 'vitest';
import { buildOfficialRules } from './officialRules';
import { getPrizeValueSummary } from './prizeValue';

const inKindPrizes = [
  { title: 'Tropical getaway', value: 3000 },
  { title: 'Brand-deal consultation', value: 500 },
];

describe('cash and in-kind prize values', () => {
  it('keeps cash, in-kind ARV, and combined value distinct', () => {
    expect(
      getPrizeValueSummary({ cash_prize_amount: 6000 }, inKindPrizes),
    ).toEqual({ cash: 6000, inKind: 3500, combined: 9500 });
  });

  it('states all three values distinctly in official rules', () => {
    const { sections } = buildOfficialRules(
      { name: 'Chicago Creator of the Year', cash_prize_amount: 6000 },
      { prizes: inKindPrizes },
    );
    const prizeText = JSON.stringify(sections.find((section) => section.id === 'prizes'));

    expect(prizeText).toContain('$6,000 cash');
    expect(prizeText).toContain('$3,500');
    expect(prizeText).toContain('$9,500');
  });
});
