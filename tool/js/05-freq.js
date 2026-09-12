/* ================= 频率分布 ================= */
(function () {
  'use strict';
  const C = window.CORE;
  const T = C.THEORY;
  const NS = 'http://www.w3.org/2000/svg';
  const POS_NAME = ['第一位', '第二位', '第三位'];
  let rendered = false;

  function s(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function barChart(labels, values, theory, color, unit) {
    const W = Math.max(560, labels.length * 34 + 46);
    const H = 190;
    const PAD_L = 46, PAD_B = 26, PAD_T = 12;
    const plotH = H - PAD_T - PAD_B;
    const maxV = Math.max.apply(null, values.concat(theory || [0])) || 1;
    const bw = (W - PAD_L - 8) / labels.length;
    const svg = s('svg', { class: 'chart', width: W, height: H });
    const yOf = function (v) { return PAD_T + plotH - (v / maxV) * plotH; };

    for (let i = 0; i <= 4; i++) {
      const v = maxV * i / 4;
      const y = yOf(v);
      svg.appendChild(s('line', {
        x1: PAD_L, y1: y, x2: W - 8, y2: y, stroke: '#f0f2f6'
      }));
      const t = s('text', { x: PAD_L - 8, y: y + 4, 'font-size': 10, fill: '#8b98a8', 'text-anchor': 'end' });
      t.textContent = unit === 'pct' ? (v * 100).toFixed(0) + '%' : String(Math.round(v));
      svg.appendChild(t);
    }

    labels.forEach(function (lb, i) {
      const x = PAD_L + i * bw;
      // 理论参考（浅色背景条）
      if (theory) {
        svg.appendChild(s('rect', {
          x: x + bw * 0.18, y: yOf(theory[i]), width: bw * 0.64,
          height: Math.max(0, PAD_T + plotH - yOf(theory[i])),
          fill: '#dbe4f0'
        }));
      }
      const h = Math.max(0, PAD_T + plotH - yOf(values[i]));
      svg.appendChild(s('rect', {
        x: x + bw * 0.30, y: yOf(values[i]), width: bw * 0.40, height: h, fill: color
      }));
      const t = s('text', {
        x: x + bw / 2, y: H - 9, 'font-size': 10,
        fill: '#5a6879', 'text-anchor': 'middle'
      });
      t.textContent = lb;
      svg.appendChild(t);
    });

    return svg;
  }

  function digitTable(rows) {
    const counts = C.posCounts(rows);
    const L = rows.length;
    const wrap = C.el('div');

    for (let p = 0; p < 3; p++) {
      const maxC = Math.max.apply(null, counts[p]);
      const tbody = C.el('tbody');
      for (let d = 0; d <= 9; d++) {
        const rate = L ? counts[p][d] / L : 0;
        const dev = rate - 0.1;
        tbody.appendChild(C.el('tr', {}, [
          C.el('td', {}, [C.el('b', { text: String(d) })]),
          C.el('td', { class: 'num', text: String(counts[p][d]) }),
          C.el('td', { class: 'num', text: C.pct(rate, 1) }),
          C.el('td', { class: 'bar-cell' }, [
            C.el('div', { class: 'bar' }, [
              C.el('i', { style: 'width:' + (counts[p][d] / maxC * 100).toFixed(1) + '%' })
            ])
          ]),
          C.el('td', { class: 'num' }, [
            C.el('span', {
              class: Math.abs(dev) < 0.01 ? 'tag gray' : (dev > 0 ? 'tag hot' : 'tag cold'),
              text: (dev >= 0 ? '+' : '') + (dev * 100).toFixed(1) + 'pt'
            })
          ])
        ]));
      }
      wrap.appendChild(C.el('div', {
        style: 'border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:14px'
      }, [
        C.el('div', {
          style: 'font-weight:600;margin-bottom:6px;color:var(--ink-2)',
          text: POS_NAME[p]
        }),
        C.tableScroll(C.el('table', {}, [
          C.el('thead', {}, [C.el('tr', {}, [
            C.el('th', { text: '数字' }),
            C.el('th', { text: '次数' }),
            C.el('th', { text: '频率' }),
            C.el('th', { text: '' }),
            C.el('th', { text: '相对理论值' })
          ])]),
          tbody
        ]))
      ]));
    }
    return wrap;
  }

  function render() {
    if (rendered) return;
    rendered = true;

    const win = +C.$('#fq-window').value;
    const rows = C.sliceWindow(C.DRAWS, win);
    const L = rows.length;

    // ---- 数字频率 ----
    C.clear(C.$('#fq-digits'));
    C.$('#fq-digits').appendChild(digitTable(rows));

    // ---- 和值 ----
    const sumV = new Array(28).fill(0);
    rows.forEach(function (r) { sumV[r.sum]++; });
    // 28 个和值 → SVG 宽约 998px，必须放进可横向滚动的容器，否则撑破整页
    C.clear(C.$('#fq-sum'));
    C.$('#fq-sum').appendChild(C.el('div', { class: 'chart-scroll' }, [barChart(
      sumV.map(function (_, i) { return String(i); }),
      sumV.map(function (v) { return v / L; }),
      T.sum.map(function (v) { return v / 1000; }),
      '#2f6fd0', 'pct')]));

    // ---- 跨度 ----
    const spanV = new Array(10).fill(0);
    rows.forEach(function (r) { spanV[r.span]++; });
    C.clear(C.$('#fq-span'));
    C.$('#fq-span').appendChild(C.el('div', { class: 'chart-scroll' }, [barChart(
      spanV.map(function (_, i) { return String(i); }),
      spanV.map(function (v) { return v / L; }),
      T.span.map(function (v) { return v / 1000; }),
      '#b7791f', 'pct')]));

    // ---- 组态 ----
    const typeV = { '豹子': 0, '组三': 0, '组六': 0 };
    rows.forEach(function (r) { typeV[r.type]++; });
    const names = ['豹子', '组三', '组六'];
    C.clear(C.$('#fq-repeat'));
    C.$('#fq-repeat').appendChild(C.el('div', { class: 'chart-scroll' }, [barChart(
      names, names.map(function (n) { return typeV[n] / L; }),
      names.map(function (n) { return T.type[n] / 1000; }),
      '#2f855a', 'pct')]));

    C.$('#fq-repeat').appendChild(C.el('div', { class: 'legend' }, [
      C.el('div', {}, [
        C.el('i', { style: 'background:#dbe4f0' }),
        '浅色条 = 理论均匀分布（000~999 等概率精确计算）'
      ]),
      C.el('div', {}, [
        C.el('i', { style: 'background:#2f855a' }),
        '实色条 = 所选窗口内的实际占比'
      ])
    ]));
  }

  window.FREQ = { render: render };

  // 监听器只注册一次，避免重复渲染
  document.addEventListener('DOMContentLoaded', function () {
    const sel = document.getElementById('fq-window');
    if (!sel) return;
    sel.addEventListener('change', function () {
      ['#fq-digits', '#fq-sum', '#fq-span', '#fq-repeat'].forEach(function (id) {
        C.clear(C.$(id));
      });
      rendered = false;
      render();
    });
  });
})();
