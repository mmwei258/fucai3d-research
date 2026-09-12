/* ================= 核心：数据解析 / 理论基线 / 通用工具 ================= */
(function () {
  'use strict';

  // ---------- 原始数据 -> 结构化 ----------
  const DRAWS = FUCAI3D_DATA.map(function (r) {
    const issue = r[0], date = r[1], number = r[2], salesWan = r[3];
    const d1 = +number[0], d2 = +number[1], d3 = +number[2];
    const max = Math.max(d1, d2, d3), min = Math.min(d1, d2, d3);
    const uniq = new Set([d1, d2, d3]).size;
    return {
      issue: issue, date: date, number: number, salesWan: salesWan,
      d: [d1, d2, d3],
      sum: d1 + d2 + d3,
      span: max - min,
      type: uniq === 1 ? '豹子' : (uniq === 2 ? '组三' : '组六'),
      sorted: [d1, d2, d3].slice().sort().join('')
    };
  });

  // ---------- 全组合理论分布（000~999 等概率精确计算）----------
  const THEORY = (function () {
    const sum = new Array(28).fill(0);
    const span = new Array(10).fill(0);
    const type = { '豹子': 0, '组三': 0, '组六': 0 };
    const posDigit = [new Array(10).fill(0), new Array(10).fill(0), new Array(10).fill(0)];
    for (let n = 0; n < 1000; n++) {
      const a = Math.floor(n / 100), b = Math.floor(n / 10) % 10, c = n % 10;
      sum[a + b + c]++;
      span[Math.max(a, b, c) - Math.min(a, b, c)]++;
      const u = new Set([a, b, c]).size;
      type[u === 1 ? '豹子' : (u === 2 ? '组三' : '组六')]++;
      posDigit[0][a]++; posDigit[1][b]++; posDigit[2][c]++;
    }
    const top3 = function (arr) {
      return arr.map(function (v, i) { return [i, v]; })
        .sort(function (x, y) { return y[1] - x[1]; })
        .slice(0, 3).map(function (x) { return x[0]; });
    };
    const sumTop3 = top3(sum), spanTop3 = top3(span);
    return {
      sum: sum, span: span, type: type, posDigit: posDigit,
      sumTop3: sumTop3, spanTop3: spanTop3,
      // 常用基线
      topN: function (n) { return n / 1000; },
      sumTop3Rate: sumTop3.reduce(function (s, i) { return s + sum[i]; }, 0) / 1000,
      spanTop3Rate: spanTop3.reduce(function (s, i) { return s + span[i]; }, 0) / 1000,
      typeTop1Rate: Math.max(type['豹子'], type['组三'], type['组六']) / 1000,
      groupTop20Rate: 20 / 220
    };
  })();

  // ---------- DOM 工具 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* 把表格放进可横向滚动的容器：手机上列多也不会撑破页面 */
  function tableScroll(table) {
    return el('div', { class: 'table-scroll' }, [table]);
  }

  // ---------- 数值格式 ----------
  function pct(x, digits) {
    return (x * 100).toFixed(digits === undefined ? 2 : digits) + '%';
  }

  function fixed(x, digits) {
    return Number(x).toFixed(digits === undefined ? 2 : digits);
  }

  function comma(x) {
    return Number(x).toLocaleString('zh-CN');
  }

  // ---------- 统计工具 ----------
  function sliceWindow(rows, n) {
    return n > 0 ? rows.slice(Math.max(0, rows.length - n)) : rows;
  }

  // 每个位置各数字出现次数
  function posCounts(rows) {
    const c = [new Array(10).fill(0), new Array(10).fill(0), new Array(10).fill(0)];
    rows.forEach(function (r) {
      c[0][r.d[0]]++; c[1][r.d[1]]++; c[2][r.d[2]]++;
    });
    return c;
  }

  // ---------- 标签页 ----------
  const TABS = [
    { id: 'overview', label: '概览', panel: 'p-overview', render: function () { window.OV.render(); } },
    { id: 'trend', label: '走势图', panel: 'p-trend', render: function () { window.TREND.render(); } },
    { id: 'omission', label: '遗漏统计', panel: 'p-omission', render: function () { window.OMISSION.render(); } },
    { id: 'freq', label: '频率分布', panel: 'p-freq', render: function () { window.FREQ.render(); } },
    { id: 'picker', label: '选号器', panel: 'p-picker', render: function () { window.PICKER.render(); } },
    { id: 'backtest', label: '策略回测', panel: 'p-backtest', render: function () { window.BACKTEST.render(); } }
  ];

  let current = null;

  function show(id) {
    if (current === id) return;
    current = id;
    TABS.forEach(function (t) {
      const panel = document.getElementById(t.panel);
      if (t.id === id) panel.classList.remove('hidden');
      else panel.classList.add('hidden');
      const btn = document.querySelector('#tabs button[data-id="' + t.id + '"]');
      if (btn) btn.classList.toggle('on', t.id === id);
    });
    const tab = TABS.find(function (t) { return t.id === id; });
    if (tab && tab.render) tab.render();
  }

  function buildTabs() {
    const nav = $('#tabs');
    clear(nav);
    TABS.forEach(function (t) {
      nav.appendChild(el('button', {
        'data-id': t.id,
        text: t.label,
        onclick: function () { show(t.id); }
      }));
    });
    show('overview');
  }

  // ---------- 导出到全局 ----------
  window.CORE = {
    DRAWS: DRAWS,
    THEORY: THEORY,
    $: $, el: el, clear: clear,
    tableScroll: tableScroll,
    pct: pct, fixed: fixed, comma: comma,
    sliceWindow: sliceWindow,
    posCounts: posCounts,
    buildTabs: buildTabs,
    show: show
  };
})();
