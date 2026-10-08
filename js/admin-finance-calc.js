/**
 * LECHAIM — Summary calculator.
 * Builds a formula from amounts already shown on the summary. No eval, no field catalog.
 */
(function (global) {
  'use strict';

  var OPS = { '+': true, '−': true, '×': true, '÷': true };

  function toCents(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  function formatCents(cents, symbol) {
    var value = Number(cents);
    if (!Number.isFinite(value)) return '';
    var neg = value < 0;
    var abs = Math.abs(value);
    var whole = Math.floor(abs / 100);
    var frac = abs % 100;
    var text = whole.toLocaleString('en-US');
    if (frac) text += '.' + String(frac).padStart(2, '0');
    if (neg) text = '-' + text;
    return symbol ? symbol + text : text;
  }

  function parseDisplayedAmount(text) {
    var raw = String(text || '').replace(/\s+/g, '');
    var match = raw.match(/^([€$₪])(-?[\d,]+(?:\.\d+)?)$/);
    if (!match) return null;
    var amount = Number(match[2].replace(/,/g, ''));
    var cents = toCents(amount);
    if (cents == null) return null;
    return { amount: cents / 100, cents: cents, display: raw, symbol: match[1] };
  }

  function collectDisplayedAmounts(items) {
    var out = [];
    (items || []).forEach(function (item) {
      var parsed = parseDisplayedAmount(item && item.text);
      if (!parsed) return;
      var label = String((item && item.label) || '').trim();
      out.push({
        label: label || parsed.display,
        amount: parsed.amount,
        cents: parsed.cents,
        display: parsed.display,
        symbol: parsed.symbol,
      });
    });
    return out;
  }

  function createState() {
    return { open: false, tokens: [], message: '', items: [], period: '' };
  }

  function copyItems(items) {
    return (items || []).map(function (item) {
      return {
        label: item.label,
        amount: item.amount,
        cents: item.cents,
        display: item.display,
        symbol: item.symbol,
      };
    });
  }

  function beginSession(items, period) {
    return {
      open: true,
      tokens: [],
      message: '',
      items: collectDisplayedAmounts(items),
      period: String(period || ''),
    };
  }

  function closeSession(state) {
    var current = state || createState();
    return {
      open: false,
      tokens: current.tokens || [],
      message: current.message || '',
      items: copyItems(current.items),
      period: current.period || '',
    };
  }

  function syncSession(state, items, period) {
    var current = state || createState();
    var nextPeriod = String(period || '');
    var figures = collectDisplayedAmounts(items);
    if (!current.open) {
      return {
        open: false,
        tokens: current.tokens || [],
        message: current.message || '',
        items: figures,
        period: nextPeriod,
      };
    }
    if (nextPeriod !== String(current.period || '')) {
      return { open: true, tokens: [], message: '', items: figures, period: nextPeriod };
    }
    return {
      open: true,
      tokens: current.tokens || [],
      message: current.message || '',
      items: figures,
      period: nextPeriod,
    };
  }

  function withEntry(entry) {
    var cents = entry && entry.cents != null ? Number(entry.cents) : toCents(entry && entry.amount);
    if (cents == null || !Number.isFinite(cents)) return null;
    return {
      type: 'value',
      label: String((entry && (entry.label || entry.display)) || '').trim(),
      amount: cents / 100,
      cents: cents,
      display: String((entry && entry.display) || formatCents(cents, entry && entry.symbol) || ''),
      symbol: String((entry && entry.symbol) || ''),
    };
  }

  function pushValue(state, entry) {
    var current = state || createState();
    var tokens = (current.tokens || []).slice();
    var last = tokens[tokens.length - 1];
    if (last && last.type === 'value') {
      return Object.assign({}, current, { tokens: tokens, message: 'בחרו פעולה לפני הנתון הבא' });
    }
    var token = withEntry(entry);
    if (!token) {
      return Object.assign({}, current, { tokens: tokens, message: 'הנתון הזה עדיין לא מספר' });
    }
    tokens.push(token);
    return Object.assign({}, current, { tokens: tokens, message: '' });
  }

  function pushOp(state, op) {
    var current = state || createState();
    if (!OPS[op]) return Object.assign({}, current, { tokens: (current.tokens || []).slice() });
    var tokens = (current.tokens || []).slice();
    var last = tokens[tokens.length - 1];
    if (!last) return Object.assign({}, current, { tokens: tokens, message: 'בחרו נתון קודם' });
    if (last.type === 'op') {
      return Object.assign({}, current, { tokens: tokens, message: 'כבר נבחרה פעולה' });
    }
    tokens.push({ type: 'op', op: op });
    return Object.assign({}, current, { tokens: tokens, message: '' });
  }

  function backspace(state) {
    var current = state || createState();
    return Object.assign({}, current, { tokens: (current.tokens || []).slice(0, -1), message: '' });
  }

  function clearState(state) {
    var current = state || createState();
    return Object.assign({}, current, { tokens: [], message: '' });
  }

  function evaluateTokens(tokens) {
    var list = tokens || [];
    if (!list.length || list[0].type !== 'value' || list[list.length - 1].type !== 'value') {
      return { ok: false, error: 'הנוסחה לא הושלמה' };
    }
    var cents = list[0].cents;
    var symbol = list[0].symbol;
    var mixed = false;
    var i;
    for (i = 1; i < list.length; i += 2) {
      var op = list[i];
      var next = list[i + 1];
      if (!op || op.type !== 'op' || !next || next.type !== 'value') {
        return { ok: false, error: 'הנוסחה לא הושלמה' };
      }
      if (next.symbol !== symbol) mixed = true;
      if (op.op === '+') cents += next.cents;
      else if (op.op === '−') cents -= next.cents;
      else if (op.op === '×') cents = Math.round(cents * next.cents / 100);
      else if (op.op === '÷') {
        if (next.cents === 0) return { ok: false, error: 'לא ניתן לחלק באפס' };
        cents = Math.round(cents * 100 / next.cents);
      } else {
        return { ok: false, error: 'פעולה לא מוכרת' };
      }
    }
    return { ok: true, cents: cents, value: cents / 100, symbol: mixed ? '' : symbol };
  }

  function commitEquals(state) {
    var current = state || createState();
    var evaled = evaluateTokens(current.tokens);
    if (!evaled.ok) {
      return Object.assign({}, current, { message: evaled.error || 'הנוסחה לא הושלמה' });
    }
    return Object.assign({}, current, { message: '' });
  }

  function joinTokens(tokens, part) {
    return (tokens || []).map(function (token) {
      if (token.type === 'op') return token.op;
      if (part === 'amount') return '\u200E' + (token.display || formatCents(token.cents, token.symbol)) + '\u200E';
      return token.label || token.display || '';
    }).join(' ');
  }

  function present(state) {
    var current = state || createState();
    var tokens = current.tokens || [];
    var names = joinTokens(tokens, 'name');
    var amounts = joinTokens(tokens, 'amount');
    var resultText = '';
    var message = current.message || '';
    if (tokens.length && tokens[tokens.length - 1].type === 'value') {
      var evaled = evaluateTokens(tokens);
      if (evaled.ok) resultText = formatCents(evaled.cents, evaled.symbol);
      else if (evaled.error && evaled.error !== 'הנוסחה לא הושלמה') message = message || evaled.error;
    }
    return { names: names, amounts: amounts, resultText: resultText, message: message };
  }

  global.LechaimFinanceCalc = {
    parseDisplayedAmount: parseDisplayedAmount,
    collectDisplayedAmounts: collectDisplayedAmounts,
    createState: createState,
    beginSession: beginSession,
    closeSession: closeSession,
    syncSession: syncSession,
    pushValue: pushValue,
    pushOp: pushOp,
    backspace: backspace,
    clearState: clearState,
    commitEquals: commitEquals,
    evaluateTokens: evaluateTokens,
    present: present,
  };
})(typeof window !== 'undefined' ? window : globalThis);
