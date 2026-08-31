function positiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function getPrizeValueSummary(competition, prizes = []) {
  const cash = positiveAmount(
    competition?.cash_prize_amount ?? competition?.cashPrizeAmount,
  );
  const inKind = prizes.reduce((total, prize) => total + positiveAmount(prize?.value), 0);

  return { cash, inKind, combined: cash + inKind };
}

export default getPrizeValueSummary;
