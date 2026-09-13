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
        else if (k === 'disabled') node.disabled = !!attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] === null || attrs[k] === undefined) { /* 跳过空属性 */ }
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

  // ---------- 窄屏判定：手机版和电脑版用不同排版 ----------
  /* 手机上的表格如果照搬电脑版，10 列塞不下就得横向滑动、第一列还会滑出视野。
     所以窄屏时改成"少列多行"的卡片式排版，两种版式各自都用得顺手。 */
  function narrow() {
    try {
      // 断点与 app.css 的「手机适配」一致（max-width: 760px），
      // 否则 641~760px 这段会用到手机版 CSS 却排出电脑版表格
      return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
    } catch (e) {
      return false;
    }
  }

  // 只在"宽/窄"真的切换时才回调（旋转屏幕、拖窗口），避免 resize 抖动里反复重绘
  function onNarrowChange(fn) {
    if (!window.addEventListener) return;
    let last = narrow();
    window.addEventListener('resize', function () {
      const cur = narrow();
      if (cur !== last) { last = cur; fn(cur); }
    });
  }

  // ---------- 逐期遗漏序列（走势网格 / 开奖记录 / 历史统计共用）----------
  /* keysOf(row) 返回该期"命中的键"（可以是多个）。
     返回数组的第 i 项对应 rows[from + i] 这一期【开奖之前】的状态：
       { i: 绝对期序, last: { 键 -> 上次出现的期序 } }
     用 gapOf 取某个键当时已经连续多少期没出现。
     注意：last 会先用 from 之前的历史预热，所以窗口第一行的遗漏值也是真实值，
     而不是从 0 开始——否则跨窗口看同一张表会对不上。 */
  const digitKeys = function (row) { return row.d; };
  const keyOfPos = function (pos) {
    return function (row) { return [row.d[pos]]; };
  };
  const keyOfType = function (row) { return [row.type]; };

  function gapSeries(rows, keysOf, from) {
    const last = Object.create(null);
    const see = function (i) {
      keysOf(rows[i]).forEach(function (k) { last[k] = i; });
    };
    const start = from || 0;
    for (let i = 0; i < start; i++) see(i);
    const out = [];
    for (let i = start; i < rows.length; i++) {
      const snapshot = Object.create(null);
      Object.keys(last).forEach(function (k) { snapshot[k] = last[k]; });
      out.push({ i: i, last: snapshot });
      see(i);
    }
    return out;
  }

  // 某键在这期之前已经多少期没出现（0 = 上一期刚出过；从未出现 = 已经过了 i 期）
  function gapOf(rec, key) {
    const v = rec.last[key];
    return v === undefined ? rec.i : rec.i - v - 1;
  }

  // 某键的"最大连出"：连续多少期都有它（窗口内统计）
  function maxStreak(rows, hits) {
    let best = 0, cur = 0;
    for (let i = 0; i < rows.length; i++) {
      if (hits[i]) { cur++; if (cur > best) best = cur; }
      else cur = 0;
    }
    return best;
  }

  // ---------- 标签页 ----------
  const TABS = [
    { id: 'overview', label: '概览', panel: 'p-overview', render: function () { window.OV.render(); } },
    { id: 'drawlog', label: '开奖记录', panel: 'p-drawlog', render: function () { window.DRAWLOG.render(); } },
    { id: 'trend', label: '走势图', panel: 'p-trend',
      render: function () { window.TREND.render(); window.GRID.render(); } },
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
    show('picker');        // 打开页面直接进选号器
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
    gapSeries: gapSeries, gapOf: gapOf, maxStreak: maxStreak,
    digitKeys: digitKeys, keyOfPos: keyOfPos, keyOfType: keyOfType,
    narrow: narrow, onNarrowChange: onNarrowChange,
    buildTabs: buildTabs,
    show: show
  };
})();
