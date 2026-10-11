'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

const NB = ' ';
const sp = (s) => s.replace(/ /g, NB);

test('przykład z PRD: budżet 500 000 PLN, przydzielono 95%', () => {
  const budget = C.validateBudget('500 000').value;
  const items = [
    ['40', '200'], ['25', '150'], ['20', '50'], ['10', '300']
  ].map(([p, r]) => ({ percent: C.validatePercent(p).value, roi: C.validateRoi(r).value }));
  const res = C.compute(budget, items);
  const m = (v) => C.formatMoney(v, 'PLN');

  assert.deepEqual(res.rows.map((r) => m(r.amount)),
    ['200 000,00 PLN', '125 000,00 PLN', '100 000,00 PLN', '50 000,00 PLN'].map(sp));
  assert.deepEqual(res.rows.map((r) => m(r.profit)),
    ['400 000,00 PLN', '187 500,00 PLN', '50 000,00 PLN', '150 000,00 PLN'].map(sp));
  assert.deepEqual(res.rows.map((r) => m(r.totalReturn)),
    ['600 000,00 PLN', '312 500,00 PLN', '150 000,00 PLN', '200 000,00 PLN'].map(sp));
  assert.equal(C.formatPercentTenths(res.totalPercent), '95%');
  assert.equal(m(res.totalAmount), sp('475 000,00 PLN'));
  assert.equal(m(res.totalProfit), sp('787 500,00 PLN'));
  assert.equal(m(res.totalReturn), sp('1 262 500,00 PLN'));
  assert.equal(C.formatRoi(res.totalRoi), '165,79%');
  assert.equal(m(res.unallocated), sp('25 000,00 PLN'));
});

test('ROI 150% przy wydatku 1 000 zł daje 1 500 zł zysku i 2 500 zł zwrotu', () => {
  const res = C.compute(100000n, [{ percent: 1000n, roi: 15000n }]);
  assert.equal(C.formatMoney(res.rows[0].profit, 'PLN'), sp('1 500,00 PLN'));
  assert.equal(C.formatMoney(res.rows[0].totalReturn, 'PLN'), sp('2 500,00 PLN'));
});

test('brak błędów zaokrągleń (0,1 + 0,2 itp.)', () => {
  const budget = C.validateBudget('0,03').value; // 3 grosze
  const res = C.compute(budget, [
    { percent: 333n, roi: 1n }, { percent: 333n, roi: 1n }, { percent: 334n, roi: 1n }
  ]);
  assert.equal(res.totalAmount, budget * 10n ** 7n);
  assert.equal(res.unallocated, 0n);
  assert.equal(C.formatRoi(res.totalRoi), '0,01%');
});

test('przekroczenie budżetu daje ujemną kwotę nieprzydzieloną', () => {
  const res = C.compute(100000n, [{ percent: 700n, roi: 0n }, { percent: 500n, roi: 0n }]);
  assert.equal(C.formatPercentTenths(res.totalPercent), '120%');
  assert.equal(C.formatMoney(-res.unallocated, 'EUR'), '200,00' + NB + 'EUR');
});

test('brak przydziału: łączny ROI = null', () => {
  const res = C.compute(100000n, [{ percent: 0n, roi: 5000n }]);
  assert.equal(res.totalRoi, null);
});

test('ROI ujemny', () => {
  const res = C.compute(100000n, [{ percent: 1000n, roi: -10000n }]);
  assert.equal(C.formatMoney(res.totalProfit, 'PLN'), '−1' + NB + '000,00' + NB + 'PLN');
  assert.equal(C.formatMoney(res.totalReturn, 'PLN'), '0,00' + NB + 'PLN');
});

test('parsowanie liczb: przecinek, kropka, spacje', () => {
  assert.equal(C.validateBudget('1 200 000,50').value, 120000050n);
  assert.equal(C.validateBudget('1200000.5').value, 120000050n);
  assert.equal(C.validateBudget(',5').value, 50n);
  assert.equal(C.validateBudget('').empty, true);
  assert.equal(C.validateBudget('0').ok, false);
  assert.equal(C.validateBudget('-5').ok, false);
  assert.equal(C.validateBudget('1,234').ok, false);
  assert.equal(C.validateBudget('abc').ok, false);
  assert.equal(C.validateBudget('1,2,3').ok, false);
});

test('walidacja procentu', () => {
  assert.equal(C.validatePercent('').value, 0n);
  assert.equal(C.validatePercent('12,5').value, 125n);
  assert.equal(C.validatePercent('100').ok, true);
  assert.equal(C.validatePercent('100,1').ok, false);
  assert.equal(C.validatePercent('-1').ok, false);
  assert.equal(C.validatePercent('1,25').ok, false);
});

test('walidacja ROI', () => {
  assert.equal(C.validateRoi('-100').ok, true);
  assert.equal(C.validateRoi('−100').ok, true);
  assert.equal(C.validateRoi('-100,01').ok, false);
  assert.equal(C.validateRoi('1000').warning, undefined);
  assert.ok(C.validateRoi('1000,01').warning);
  assert.equal(C.validateRoi('99999').ok, true);
});

test('walidacja nazwy kategorii', () => {
  const existing = ['Radio', 'Prasa'];
  assert.equal(C.validateName('  ', existing).ok, false);
  assert.equal(C.validateName('x'.repeat(41), existing).ok, false);
  assert.equal(C.validateName('x'.repeat(40), existing).ok, true);
  assert.equal(C.validateName('radio', existing).ok, false);
  assert.equal(C.validateName('Radio', existing, 'Radio').ok, true);
  assert.equal(C.validateName('Podcasty', existing).value, 'Podcasty');
});

test('wydajność: 50 kategorii poniżej 100 ms', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ percent: 20n, roi: BigInt(i * 100) }));
  const t = performance.now();
  for (let i = 0; i < 100; i++) C.compute(123456789n, items);
  assert.ok((performance.now() - t) / 100 < 100);
});
