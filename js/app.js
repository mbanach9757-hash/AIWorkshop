/* Interfejs kalkulatora budżetu marketingowego i ROI. */
(function () {
  'use strict';

  var C = window.BudgetCalc;
  var STORAGE_KEY = 'kalkulator-budzetu-roi:v1';
  var DASH = '–';
  var SERIES_SLOTS = 8; // liczba kolorów kategorii; nadmiar trafia do „Pozostałe”

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    budget: $('budget'),
    budgetError: $('budget-error'),
    currency: $('currency'),
    allocStatus: $('allocation-status'),
    allocText: $('allocation-text'),
    allocBar: $('allocation-bar'),
    allocFill: document.querySelector('.allocation-fill'),
    noBudgetHint: $('no-budget-hint'),
    tbody: $('categories-body'),
    table: $('categories-table'),
    emptyState: $('empty-state'),
    restoreDefaults: $('restore-defaults'),
    addToggle: $('add-toggle'),
    addForm: $('add-form'),
    addCancel: $('add-cancel'),
    newName: $('new-name'),
    newNameError: $('new-name-error'),
    totalPercent: $('total-percent'),
    totalAmount: $('total-amount'),
    totalRoiCell: $('total-roi-cell'),
    totalProfitCell: $('total-profit-cell'),
    totalReturnCell: $('total-return-cell'),
    totalProfit: $('total-profit'),
    totalReturn: $('total-return'),
    totalRoi: $('total-roi'),
    donutSegments: $('donut-segments'),
    donutCenter: $('donut-center'),
    chartDesc: $('chart-desc'),
    legend: $('chart-legend'),
    chartNote: $('chart-note'),
    tooltip: $('chart-tooltip'),
    clearPlan: $('clear-plan'),
    dialog: $('confirm-dialog'),
    dialogTitle: $('confirm-title'),
    dialogMessage: $('confirm-message'),
    dialogOk: $('confirm-ok')
  };

  /* ---------- Stan ---------- */

  var nextId = 1;
  var state = loadState() || defaultState();

  function makeCategory(name, percent, roi) {
    var cat = { id: nextId++, name: name, percent: percent || '', roi: roi || '' };
    var p = C.validatePercent(cat.percent);
    var r = C.validateRoi(cat.roi);
    cat.pValid = p.ok ? p.value : 0n;
    cat.rValid = r.ok ? r.value : 0n;
    return cat;
  }

  function defaultCategories() {
    return C.DEFAULT_CATEGORIES.map(function (n) { return makeCategory(n, '0', '0'); });
  }

  function defaultState() {
    return { budget: '', budgetValid: null, currency: 'PLN', categories: defaultCategories() };
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.categories)) return null;
      var b = C.validateBudget(data.budget || '');
      return {
        budget: String(data.budget || ''),
        budgetValid: b.ok ? b.value : null,
        currency: C.CURRENCIES[data.currency] ? data.currency : 'PLN',
        categories: data.categories
          .filter(function (c) { return c && typeof c.name === 'string'; })
          .map(function (c) { return makeCategory(c.name, String(c.percent || ''), String(c.roi || '')); })
      };
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        budget: state.budget,
        currency: state.currency,
        categories: state.categories.map(function (c) {
          return { name: c.name, percent: c.percent, roi: c.roi };
        })
      }));
    } catch (e) { /* tryb prywatny lub zablokowana pamięć – aplikacja działa dalej */ }
  }

  function findCat(id) {
    for (var i = 0; i < state.categories.length; i++) {
      if (state.categories[i].id === id) return state.categories[i];
    }
    return null;
  }

  /* ---------- Pomocnicze ---------- */

  function money(v) { return C.formatMoney(v, state.currency); }

  function setFieldError(input, errorEl, message, isWarning) {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      errorEl.classList.toggle('is-warning', !!isWarning);
      input.classList.toggle('is-invalid', !isWarning);
      input.classList.toggle('is-warning', !!isWarning);
      if (!isWarning) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
      input.classList.remove('is-invalid', 'is-warning');
      input.removeAttribute('aria-invalid');
    }
  }

  function confirmAction(title, message, okLabel) {
    return new Promise(function (resolve) {
      var d = els.dialog;
      els.dialogTitle.textContent = title;
      els.dialogMessage.textContent = message;
      els.dialogOk.textContent = okLabel;
      if (typeof d.showModal !== 'function') {
        resolve(window.confirm(title + '\n\n' + message));
        return;
      }
      var opener = document.activeElement;
      d.returnValue = 'cancel';
      d.addEventListener('close', function onClose() {
        d.removeEventListener('close', onClose);
        resolve(d.returnValue === 'ok');
        if (opener && document.contains(opener)) opener.focus();
      });
      d.showModal();
      $('confirm-cancel').focus();
    });
  }

  /* ---------- Renderowanie wierszy ---------- */

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') n.textContent = attrs[k];
        else if (k === 'className') n.className = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function buildRow(cat) {
    var id = cat.id;
    var nameInput = el('input', {
      type: 'text', className: 'input-name', id: 'name-' + id, value: cat.name,
      maxlength: String(C.NAME_MAX), 'data-field': 'name', 'aria-label': 'Nazwa kategorii',
      'aria-describedby': 'name-err-' + id, autocomplete: 'off'
    });
    var pctInput = el('input', {
      type: 'text', inputmode: 'decimal', className: 'input-num', id: 'pct-' + id, value: cat.percent,
      'data-field': 'percent', 'aria-label': '% budżetu – ' + cat.name,
      'aria-describedby': 'pct-err-' + id, autocomplete: 'off'
    });
    var roiInput = el('input', {
      type: 'text', inputmode: 'decimal', className: 'input-num', id: 'roi-' + id, value: cat.roi,
      'data-field': 'roi', 'aria-label': 'Oczekiwany ROI – ' + cat.name,
      'aria-describedby': 'roi-err-' + id + ' roi-hint-' + id, autocomplete: 'off'
    });

    var tr = el('tr', { 'data-id': String(id) }, [
      el('th', { scope: 'row', 'data-label': 'Kategoria' }, [
        nameInput,
        el('p', { className: 'field-error', id: 'name-err-' + id, role: 'alert', hidden: '' })
      ]),
      el('td', { className: 'num', 'data-label': '% budżetu' }, [
        el('div', { className: 'input-suffix' }, [pctInput, el('span', { text: '%', 'aria-hidden': 'true' })]),
        el('p', { className: 'field-error', id: 'pct-err-' + id, role: 'alert', hidden: '' })
      ]),
      el('td', { className: 'num out', 'data-label': 'Kwota', 'data-out': 'amount' }),
      el('td', { className: 'num', 'data-label': 'Oczekiwany ROI' }, [
        el('div', { className: 'input-suffix' }, [roiInput, el('span', { text: '%', 'aria-hidden': 'true' })]),
        el('span', { className: 'visually-hidden', id: 'roi-hint-' + id, text: 'Zysk netto w procentach wydanej kwoty, od −100%.' }),
        el('p', { className: 'field-error', id: 'roi-err-' + id, role: 'alert', hidden: '' })
      ]),
      el('td', { className: 'num out', 'data-label': 'Zysk netto', 'data-out': 'profit' }),
      el('td', { className: 'num out', 'data-label': 'Całkowity zwrot', 'data-out': 'return' }),
      el('td', { className: 'actions' }, [
        el('button', {
          type: 'button', className: 'btn-icon', 'data-action': 'delete',
          'aria-label': 'Usuń kategorię ' + cat.name, title: 'Usuń kategorię'
        }, [svgTrash()])
      ])
    ]);
    // Pokaż istniejące błędy/ostrzeżenia po odtworzeniu stanu.
    validatePercentField(cat, pctInput);
    validateRoiField(cat, roiInput);
    return tr;
  }

  function svgTrash() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M9 3h6m-9 3h12m-1 0-.7 12.2A2 2 0 0 1 14.3 20H9.7a2 2 0 0 1-2-1.8L7 6m3 4v6m4-6v6');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function renderRows() {
    els.tbody.textContent = '';
    state.categories.forEach(function (cat) { els.tbody.appendChild(buildRow(cat)); });
    var empty = state.categories.length === 0;
    els.emptyState.hidden = !empty;
    els.table.classList.toggle('is-empty', empty);
  }

  /* ---------- Walidacja pól ---------- */

  function validatePercentField(cat, input) {
    var r = C.validatePercent(cat.percent);
    if (r.ok) cat.pValid = r.value;
    setFieldError(input, input.closest('td').querySelector('.field-error'), r.ok ? null : r.message);
  }

  function validateRoiField(cat, input) {
    var r = C.validateRoi(cat.roi);
    if (r.ok) cat.rValid = r.value;
    var errEl = input.closest('td').querySelector('.field-error');
    if (!r.ok) setFieldError(input, errEl, r.message);
    else setFieldError(input, errEl, r.warning || null, !!r.warning);
  }

  function validateBudgetField() {
    var r = C.validateBudget(state.budget);
    if (r.ok) {
      state.budgetValid = r.value;
      setFieldError(els.budget, els.budgetError, null);
    } else if (r.empty) {
      state.budgetValid = null;
      setFieldError(els.budget, els.budgetError, null);
    } else {
      setFieldError(els.budget, els.budgetError, r.message);
    }
  }

  /* ---------- Przeliczenie i wyniki ---------- */

  function update() {
    var res = C.compute(state.budgetValid, state.categories.map(function (c) {
      return { percent: c.pValid, roi: c.rValid };
    }));
    var hasBudget = res.hasBudget;

    // Wiersze
    var rows = els.tbody.rows;
    for (var i = 0; i < rows.length; i++) {
      var r = res.rows[i];
      rows[i].querySelector('[data-out="amount"]').textContent = hasBudget ? money(r.amount) : DASH;
      rows[i].querySelector('[data-out="profit"]').textContent = hasBudget ? money(r.profit) : DASH;
      rows[i].querySelector('[data-out="return"]').textContent = hasBudget ? money(r.totalReturn) : DASH;
    }

    var roiText = hasBudget ? (C.formatRoi(res.totalRoi) || DASH) : DASH;
    els.totalPercent.textContent = C.formatPercentTenths(res.totalPercent);
    els.totalAmount.textContent = hasBudget ? money(res.totalAmount) : DASH;
    els.totalRoiCell.textContent = roiText;
    els.totalProfitCell.textContent = hasBudget ? money(res.totalProfit) : DASH;
    els.totalReturnCell.textContent = hasBudget ? money(res.totalReturn) : DASH;

    els.totalProfit.textContent = hasBudget ? money(res.totalProfit) : DASH;
    els.totalReturn.textContent = hasBudget ? money(res.totalReturn) : DASH;
    els.totalRoi.textContent = roiText;
    els.totalProfit.classList.toggle('is-negative', hasBudget && res.totalProfit < 0n);

    els.noBudgetHint.hidden = hasBudget;

    updateAllocation(res);
    updateChart(res);
  }

  function updateAllocation(res) {
    var tp = res.totalPercent; // dziesiąte części
    var pctText = C.formatPercentTenths(tp);
    var stateName, text;
    if (tp === 1000n) {
      stateName = 'full';
      text = 'Przydzielono ' + pctText + ' · Cały budżet rozdzielony';
    } else if (tp < 1000n) {
      stateName = 'under';
      var rest = C.formatPercentTenths(1000n - tp);
      text = 'Przydzielono ' + pctText + ' · Nieprzydzielone ' +
        (res.hasBudget ? money(res.unallocated) + ' (' + rest + ')' : rest);
    } else {
      stateName = 'over';
      var over = C.formatPercentTenths(tp - 1000n);
      text = 'Przydzielono ' + pctText + ' · Przekroczono budżet o ' +
        (res.hasBudget ? money(-res.unallocated) + ' (' + over + ')' : over);
    }
    els.allocStatus.dataset.state = stateName;
    els.allocBar.dataset.state = stateName;
    els.allocText.textContent = text;
    var shown = Math.min(100, C.toNumber(tp, 1));
    els.allocFill.style.width = shown + '%';
    els.allocBar.setAttribute('aria-valuenow', String(Math.round(shown)));
    els.allocBar.setAttribute('aria-valuetext', pctText);
  }

  /* ---------- Wykres kołowy (donut) ---------- */

  var R = 80;
  var CIRC = 2 * Math.PI * R;
  var GAP = 2; // odstęp między wycinkami (w jednostkach viewBox)

  function updateChart(res) {
    var ns = 'http://www.w3.org/2000/svg';
    var tp = res.totalPercent;
    var basis = tp > 1000n ? tp : 1000n; // przy przekroczeniu udziały względem sumy

    // Kategorie z > 0%: pierwsze 7 dostaje własny kolor, reszta trafia do „Pozostałe”.
    var nonZero = [];
    state.categories.forEach(function (c) {
      if (c.pValid > 0n) nonZero.push({ name: c.name, percent: c.pValid });
    });
    var slices = [];
    if (nonZero.length > SERIES_SLOTS) {
      slices = nonZero.slice(0, SERIES_SLOTS - 1);
      var rest = nonZero.slice(SERIES_SLOTS - 1);
      slices.push({
        name: 'Pozostałe (' + rest.length + ')',
        percent: rest.reduce(function (s, x) { return s + x.percent; }, 0n),
        detail: rest.map(function (x) { return x.name; }).join(', ')
      });
    } else {
      slices = nonZero.slice();
    }
    slices.forEach(function (s, i) { s.color = 'var(--series-' + (i + 1) + ')'; });
    if (tp < 1000n) {
      slices.push({ name: 'Nieprzydzielone', percent: 1000n - tp, color: 'var(--unallocated)', unallocated: true });
    }

    els.donutSegments.textContent = '';
    var offset = 0;
    var multi = slices.length > 1;
    slices.forEach(function (s) {
      var frac = Number(s.percent) / Number(basis);
      var len = frac * CIRC;
      var visible = Math.max(0, len - (multi ? GAP : 0));
      var circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', '100');
      circle.setAttribute('cy', '100');
      circle.setAttribute('r', String(R));
      circle.setAttribute('class', 'donut-seg' + (s.unallocated ? ' is-unallocated' : ''));
      circle.style.stroke = s.color;
      circle.setAttribute('stroke-dasharray', visible + ' ' + (CIRC - visible));
      circle.setAttribute('stroke-dashoffset', String(-offset));
      circle._slice = s;
      els.donutSegments.appendChild(circle);
      offset += len;
    });

    els.donutCenter.textContent = C.formatPercentTenths(tp);

    // Legenda (wartości tekstem – kolor nie jest jedynym nośnikiem informacji)
    els.legend.textContent = '';
    slices.forEach(function (s) {
      var li = el('li', { className: s.unallocated ? 'is-unallocated' : '' }, [
        el('span', { className: 'swatch', 'aria-hidden': 'true' }),
        el('span', { className: 'legend-name', text: s.name }),
        el('span', { className: 'legend-value', text: C.formatPercentTenths(s.percent) })
      ]);
      li.querySelector('.swatch').style.background = s.color;
      if (s.detail) li.title = s.detail;
      els.legend.appendChild(li);
    });

    els.chartDesc.textContent = slices.length
      ? 'Udziały w budżecie: ' + slices.map(function (s) {
          return s.name + ' ' + C.formatPercentTenths(s.percent);
        }).join(', ') + '.'
      : 'Brak przydzielonego budżetu.';

    if (tp > 1000n) {
      els.chartNote.textContent = 'Suma przekracza 100% – udziały na wykresie pokazano względem przydzielonej sumy (' +
        C.formatPercentTenths(tp) + ').';
      els.chartNote.hidden = false;
    } else {
      els.chartNote.hidden = true;
    }
  }

  function showTooltip(evt) {
    var s = evt.target._slice;
    if (!s) return hideTooltip();
    var wrap = els.tooltip.parentNode.getBoundingClientRect();
    var amount = '';
    if (state.budgetValid != null) {
      amount = money(state.budgetValid * s.percent * 10000n);
    }
    els.tooltip.textContent = '';
    els.tooltip.appendChild(el('strong', { text: s.name }));
    els.tooltip.appendChild(el('span', { text: C.formatPercentTenths(s.percent) + (amount ? ' · ' + amount : '') }));
    if (s.detail) els.tooltip.appendChild(el('span', { className: 'tt-detail', text: s.detail }));
    els.tooltip.hidden = false;
    var x = evt.clientX - wrap.left + 12;
    var y = evt.clientY - wrap.top + 12;
    var w = els.tooltip.offsetWidth;
    if (x + w > wrap.width) x = Math.max(0, evt.clientX - wrap.left - w - 12);
    els.tooltip.style.left = x + 'px';
    els.tooltip.style.top = y + 'px';
  }

  function hideTooltip() { els.tooltip.hidden = true; }

  /* ---------- Zdarzenia ---------- */

  els.budget.addEventListener('input', function () {
    state.budget = els.budget.value;
    validateBudgetField();
    update();
    saveState();
  });

  // Po opuszczeniu pola pokaż budżet w polskim formacie z separatorem tysięcy.
  els.budget.addEventListener('blur', function () {
    var r = C.validateBudget(els.budget.value);
    if (r.ok) {
      els.budget.value = C.formatScaled(r.value, 2, 2).replace(/ /g, ' ');
      state.budget = els.budget.value;
      saveState();
    }
  });

  els.currency.addEventListener('change', function () {
    state.currency = els.currency.value;
    update();
    saveState();
  });

  els.tbody.addEventListener('input', function (e) {
    var input = e.target;
    var field = input.dataset.field;
    if (!field) return;
    var cat = findCat(Number(input.closest('tr').dataset.id));
    if (!cat) return;

    if (field === 'percent') {
      cat.percent = input.value;
      validatePercentField(cat, input);
    } else if (field === 'roi') {
      cat.roi = input.value;
      validateRoiField(cat, input);
    } else if (field === 'name') {
      var errEl = $('name-err-' + cat.id);
      var v = C.validateName(input.value, state.categories.map(function (c) { return c.name; }), cat.name);
      setFieldError(input, errEl, v.ok ? null : v.message);
      if (v.ok) {
        cat.name = v.value;
        refreshRowLabels(input.closest('tr'), cat);
      }
    }
    update();
    saveState();
  });

  // Niepoprawna nazwa po opuszczeniu pola wraca do ostatniej poprawnej.
  els.tbody.addEventListener('focusout', function (e) {
    var input = e.target;
    if (input.dataset.field !== 'name') return;
    var cat = findCat(Number(input.closest('tr').dataset.id));
    if (!cat) return;
    if (input.value.trim() !== cat.name) {
      input.value = cat.name;
      setFieldError(input, $('name-err-' + cat.id), null);
    }
  });

  function refreshRowLabels(tr, cat) {
    tr.querySelector('[data-field="percent"]').setAttribute('aria-label', '% budżetu – ' + cat.name);
    tr.querySelector('[data-field="roi"]').setAttribute('aria-label', 'Oczekiwany ROI – ' + cat.name);
    tr.querySelector('[data-action="delete"]').setAttribute('aria-label', 'Usuń kategorię ' + cat.name);
  }

  els.tbody.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="delete"]');
    if (!btn) return;
    var tr = btn.closest('tr');
    var cat = findCat(Number(tr.dataset.id));
    if (!cat) return;
    var hasValues = cat.pValid !== 0n || cat.rValid !== 0n;
    var doDelete = function () {
      var idx = state.categories.indexOf(cat);
      state.categories.splice(idx, 1);
      renderRows();
      update();
      saveState();
      // Przenieś fokus na sąsiedni wiersz lub przycisk dodawania.
      var next = els.tbody.rows[Math.min(idx, els.tbody.rows.length - 1)];
      (next ? next.querySelector('[data-action="delete"]') : els.addToggle).focus();
    };
    if (!hasValues) return doDelete();
    confirmAction('Usunąć kategorię „' + cat.name + '”?',
      'Kategoria ma wpisane wartości (' + C.formatPercentTenths(cat.pValid) + ' budżetu, ROI ' +
      C.formatScaled(cat.rValid, 2, 2) + '%). Tej operacji nie można cofnąć.', 'Usuń')
      .then(function (ok) { if (ok) doDelete(); });
  });

  function openAddForm() {
    els.addForm.hidden = false;
    els.addToggle.hidden = true;
    els.addToggle.setAttribute('aria-expanded', 'true');
    els.newName.value = '';
    setFieldError(els.newName, els.newNameError, null);
    els.newName.focus();
  }

  function closeAddForm() {
    els.addForm.hidden = true;
    els.addToggle.hidden = false;
    els.addToggle.setAttribute('aria-expanded', 'false');
    els.addToggle.focus();
  }

  els.addToggle.addEventListener('click', openAddForm);
  els.addCancel.addEventListener('click', closeAddForm);
  els.addForm.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAddForm();
  });
  els.newName.addEventListener('input', function () {
    setFieldError(els.newName, els.newNameError, null);
  });
  els.addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = C.validateName(els.newName.value, state.categories.map(function (c) { return c.name; }));
    if (!v.ok) {
      setFieldError(els.newName, els.newNameError, v.message);
      els.newName.focus();
      return;
    }
    var cat = makeCategory(v.value, '0', '0');
    state.categories.push(cat);
    renderRows();
    update();
    saveState();
    els.addForm.hidden = true;
    els.addToggle.hidden = false;
    els.addToggle.setAttribute('aria-expanded', 'false');
    $('pct-' + cat.id).focus();
  });

  els.restoreDefaults.addEventListener('click', function () {
    state.categories = defaultCategories();
    renderRows();
    update();
    saveState();
    $('categories-title').focus();
  });

  els.clearPlan.addEventListener('click', function () {
    confirmAction('Wyczyścić plan?',
      'Budżet, waluta i wszystkie kategorie wrócą do ustawień początkowych. Tej operacji nie można cofnąć.',
      'Wyczyść plan')
      .then(function (ok) {
        if (!ok) return;
        state = defaultState();
        try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignoruj */ }
        init();
        els.budget.focus();
      });
  });

  els.donutSegments.addEventListener('mousemove', showTooltip);
  els.donutSegments.addEventListener('mouseleave', hideTooltip);

  /* ---------- Start ---------- */

  function init() {
    els.budget.value = state.budget;
    els.currency.value = state.currency;
    validateBudgetField();
    renderRows();
    update();
  }

  init();
})();
