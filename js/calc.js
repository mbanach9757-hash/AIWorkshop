/*
 * Logika obliczeń kalkulatora budżetu marketingowego.
 *
 * Wszystkie wartości są przechowywane jako liczby całkowite BigInt w stałej skali,
 * dzięki czemu obliczenia są dokładne, a zaokrąglenie następuje wyłącznie
 * przy wyświetlaniu (PRD: „Dokładność”).
 *
 *   budżet  – grosze           (skala 10^2)
 *   procent – dziesiąte części (skala 10^1)
 *   ROI     – setne części     (skala 10^2)
 *
 * Kwoty i zyski trzymamy we wspólnej skali 10^9 jednostki waluty:
 *   kwotaS = B_gr * p_10 * 10^4     (= B * p / 100)
 *   zyskS  = B_gr * p_10 * ROI_100  (= kwota * ROI / 100)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BudgetCalc = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AMOUNT_SCALE_DIGITS = 9;

  var DEFAULT_CATEGORIES = [
    'Social media',
    'Strona WWW',
    'Radio',
    'Telewizja',
    'Reklama w wyszukiwarce',
    'Prasa',
    'Outdoor',
    'E-mail marketing',
    'Wydarzenia'
  ];

  var CURRENCIES = {
    PLN: { code: 'PLN', symbol: 'zł', label: 'PLN (zł)' },
    EUR: { code: 'EUR', symbol: '€', label: 'EUR (€)' },
    USD: { code: 'USD', symbol: '$', label: 'USD ($)' }
  };

  var NAME_MAX = 40;
  var ROI_WARNING_THRESHOLD = 100000n; // 1000% w setnych częściach

  function pow10(n) {
    return 10n ** BigInt(n);
  }

  /**
   * Parsuje tekst liczby wpisanej przez użytkownika (akceptuje przecinek i kropkę,
   * spacje jako separator tysięcy) do BigInt w zadanej skali.
   * Zwraca { ok: true, value } lub { ok: false, reason: 'format' | 'decimals' }.
   */
  function parseDecimal(text, maxDecimals, allowNegative) {
    var s = String(text == null ? '' : text)
      .replace(/[\s  ]/g, '')
      .replace(/^−/, '-');
    if (s === '') return { ok: false, reason: 'empty' };

    // Tylko jeden separator dziesiętny – przecinek lub kropka.
    var m = /^(-?)(\d*)(?:[.,](\d*))?$/.exec(s);
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) {
      return { ok: false, reason: 'format' };
    }
    if (m[1] === '-' && !allowNegative) return { ok: false, reason: 'negative' };
    var frac = m[3] || '';
    if (frac.length > maxDecimals) return { ok: false, reason: 'decimals' };

    var digits = (m[2] || '0') + frac.padEnd(maxDecimals, '0');
    var value = BigInt(digits);
    if (m[1] === '-') value = -value;
    return { ok: true, value: value };
  }

  /** Walidacja budżetu: > 0, maks. 2 miejsca po przecinku. Wartość w groszach. */
  function validateBudget(text) {
    var r = parseDecimal(text, 2, true);
    if (!r.ok) {
      if (r.reason === 'empty') return { ok: false, empty: true };
      if (r.reason === 'decimals') return { ok: false, message: 'Maksymalnie 2 miejsca po przecinku.' };
      return { ok: false, message: 'Wpisz poprawną liczbę, np. 500 000 lub 1200,50.' };
    }
    if (r.value <= 0n) return { ok: false, message: 'Budżet musi być większy od zera.' };
    return { ok: true, value: r.value };
  }

  /** Walidacja procentu: 0–100, maks. 1 miejsce po przecinku. Puste pole = 0. */
  function validatePercent(text) {
    var r = parseDecimal(text, 1, true);
    if (!r.ok) {
      if (r.reason === 'empty') return { ok: true, value: 0n };
      if (r.reason === 'decimals') return { ok: false, message: 'Maksymalnie 1 miejsce po przecinku.' };
      return { ok: false, message: 'Wpisz liczbę od 0 do 100.' };
    }
    if (r.value < 0n || r.value > 1000n) return { ok: false, message: 'Wartość musi być od 0 do 100%.' };
    return { ok: true, value: r.value };
  }

  /** Walidacja ROI: ≥ −100%, maks. 2 miejsca po przecinku, ostrzeżenie > 1000%. Puste = 0. */
  function validateRoi(text) {
    var r = parseDecimal(text, 2, true);
    if (!r.ok) {
      if (r.reason === 'empty') return { ok: true, value: 0n };
      if (r.reason === 'decimals') return { ok: false, message: 'Maksymalnie 2 miejsca po przecinku.' };
      return { ok: false, message: 'Wpisz liczbę, np. 150 lub −20.' };
    }
    if (r.value < -10000n) return { ok: false, message: 'ROI nie może być niższy niż −100% (strata całości).' };
    var res = { ok: true, value: r.value };
    if (r.value > ROI_WARNING_THRESHOLD) {
      res.warning = 'ROI powyżej 1000% – czy to realistyczne założenie?';
    }
    return res;
  }

  /** Walidacja nazwy kategorii: 1–40 znaków, unikalna (bez rozróżniania wielkości liter). */
  function validateName(name, existingNames, ownName) {
    var n = String(name || '').trim();
    if (n.length < 1) return { ok: false, message: 'Nazwa nie może być pusta.' };
    if (n.length > NAME_MAX) return { ok: false, message: 'Nazwa może mieć maksymalnie ' + NAME_MAX + ' znaków.' };
    var lower = n.toLocaleLowerCase('pl');
    var own = ownName == null ? null : String(ownName).trim().toLocaleLowerCase('pl');
    var clash = (existingNames || []).some(function (e) {
      var el = String(e).trim().toLocaleLowerCase('pl');
      return el === lower && el !== own;
    });
    if (clash) return { ok: false, message: 'Kategoria o tej nazwie już istnieje.' };
    return { ok: true, value: n };
  }

  /**
   * Główne obliczenie.
   * @param {bigint|null} budget  budżet w groszach (null = brak budżetu)
   * @param {{percent: bigint, roi: bigint}[]} items
   * Kwoty i zyski zwracane w skali 10^9 (AMOUNT_SCALE_DIGITS).
   */
  function compute(budget, items) {
    var B = budget == null ? 0n : budget;
    var totalPercent = 0n;
    var totalAmount = 0n;
    var totalProfit = 0n;

    var rows = items.map(function (it) {
      var amount = B * it.percent * 10000n;
      var profit = B * it.percent * it.roi;
      totalPercent += it.percent;
      totalAmount += amount;
      totalProfit += profit;
      return { amount: amount, profit: profit, totalReturn: amount + profit };
    });

    var budgetScaled = B * pow10(AMOUNT_SCALE_DIGITS - 2);
    var unallocated = budgetScaled - totalAmount; // ujemne = przekroczenie

    // Łączny ROI liczony od kwoty przydzielonej (średnia ważona), w skali 10^6 procenta.
    var roiScaled = null;
    if (totalAmount !== 0n) {
      roiScaled = divRound(totalProfit * 100n * pow10(6), totalAmount);
    }

    return {
      hasBudget: budget != null,
      rows: rows,
      totalPercent: totalPercent, // dziesiąte części procenta
      totalAmount: totalAmount,
      totalProfit: totalProfit,
      totalReturn: totalAmount + totalProfit,
      unallocated: unallocated,
      totalRoi: roiScaled // skala 10^6 lub null
    };
  }

  /** Dzielenie z zaokrągleniem połówkowym od zera. */
  function divRound(a, b) {
    if (b < 0n) { a = -a; b = -b; }
    var neg = a < 0n;
    var abs = neg ? -a : a;
    var q = abs / b;
    var r = abs % b;
    if (r * 2n >= b) q += 1n;
    return neg ? -q : q;
  }

  /** Zaokrągla wartość w skali 10^scaleDigits do `decimals` miejsc, zwraca BigInt w skali 10^decimals. */
  function roundTo(value, scaleDigits, decimals) {
    if (scaleDigits <= decimals) return value * pow10(decimals - scaleDigits);
    return divRound(value, pow10(scaleDigits - decimals));
  }

  /** Formatuje wg polskich zasad: spacja tysięcy (NBSP), przecinek dziesiętny. */
  function formatScaled(value, scaleDigits, decimals) {
    var v = roundTo(value, scaleDigits, decimals);
    var neg = v < 0n;
    if (neg) v = -v;
    var s = v.toString().padStart(decimals + 1, '0');
    var intPart = decimals > 0 ? s.slice(0, -decimals) : s;
    var fracPart = decimals > 0 ? s.slice(-decimals) : '';
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    var out = intPart + (decimals > 0 ? ',' + fracPart : '');
    if (neg && /[1-9]/.test(out)) out = '−' + out;
    return out;
  }

  function formatMoney(valueScaled, currencyCode) {
    var cur = CURRENCIES[currencyCode] || CURRENCIES.PLN;
    return formatScaled(valueScaled, AMOUNT_SCALE_DIGITS, 2) + ' ' + cur.code;
  }

  /** Procent w dziesiątych częściach -> "95" lub "95,5". */
  function formatPercentTenths(tenths) {
    var neg = tenths < 0n;
    var v = neg ? -tenths : tenths;
    var s = (v / 10n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (v % 10n !== 0n) s += ',' + (v % 10n).toString();
    return (neg ? '−' : '') + s + '%';
  }

  /** Łączny ROI (skala 10^6) -> "165,79%". */
  function formatRoi(roiScaled) {
    if (roiScaled == null) return null;
    return formatScaled(roiScaled, 6, 2) + '%';
  }

  /** Udział (0..1) jako liczba zmiennoprzecinkowa – wyłącznie do rysowania wykresu. */
  function toNumber(value, scaleDigits) {
    return Number(value) / Math.pow(10, scaleDigits);
  }

  return {
    AMOUNT_SCALE_DIGITS: AMOUNT_SCALE_DIGITS,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    CURRENCIES: CURRENCIES,
    NAME_MAX: NAME_MAX,
    parseDecimal: parseDecimal,
    validateBudget: validateBudget,
    validatePercent: validatePercent,
    validateRoi: validateRoi,
    validateName: validateName,
    compute: compute,
    formatScaled: formatScaled,
    formatMoney: formatMoney,
    formatPercentTenths: formatPercentTenths,
    formatRoi: formatRoi,
    toNumber: toNumber
  };
});
