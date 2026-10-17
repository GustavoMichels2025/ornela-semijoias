function commissionSummary(sales) {
  const cents = (sales || []).reduce((sum, sale) => sum + Math.round(Number(sale.total || 0) * 100), 0);
  const rate = cents > 100000 ? 30 : 25;
  return { total: cents / 100, rate, amount: Math.round(cents * rate / 100) / 100, threshold: 1000 };
}
module.exports = { commissionSummary };
