/* ================= 遗漏网格（走势表） + 开奖记录 =================
   两张表的共同点：都把"已经多少期没出现"（遗漏）直接写进格子里，
   命中的那一格用色块/圆圈标出来。口径与「遗漏统计」页一致：
   0 = 上一期刚出过；从未出现过 = 已经过了这么多期。 */
(function () {
  'use strict';
  const C = window.CORE;
  const NS = 'http://www.w3.org/2000/svg';
  const D = C.DRAWS;

  const POS_NAME = ['百位（第一位）', '十位（第二位）', '个位（第三位）', '不分位'];
  const GRID_COLOR = ['#2f6fd0', '#2f6fd0', '#2f6fd0', '#d64545'];
  const TYPE_COLOR = { '组三': '#2f6fd0', '组六': '#5a9e2f', '豹子': '#d64545' };
  const TYPE_ORDER = ['组三', '组六', '豹子'];

  function s(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function svgText(x, y, str, opts) {
    const o = opts || {};
    const node = s('text', {
      x: x, y: y, 'font-size': o.size || 11,
      fill: o.fill || '#8b98a8', 'text-anchor': o.anchor || 'middle',
      'font-family': 'inherit'
    });
    node.textContent = str;
    return node;
  }

  /* ---------------- 走势网格 ---------------- */
  const GW_WIDE = 26, RH_WIDE = 22;
  // 手机上把行高加大、字形放大（看得清），列宽只加到刚好放得下——
  // 390px 屏的可用宽度约 340px，56 + 10×28 = 336 正好不触发横向滚动
  const GW_NARROW = 28, RH_NARROW = 25;
  const HEAD = 20, ISSUE_W = 56;

  function gridChart(rows, from, posIdx, showLine, isNarrow) {
    const GW = isNarrow ? GW_NARROW : GW_WIDE;
    const RH = isNarrow ? RH_NARROW : RH_WIDE;
    const isAny = posIdx === 3;
    const keysOf = isAny ? C.digitKeys : C.keyOfPos(posIdx);
    const series = C.gapSeries(D, keysOf, from);
    const color = GRID_COLOR[posIdx];
    const n = rows.length;
    const w = ISSUE_W + 10 * GW;
    const h = HEAD + n * RH + 6;
    const svg = s('svg', { class: 'chart', width: w, height: h });
    const cx = function (d) { return ISSUE_W + d * GW + GW / 2; };
    const cy = function (i) { return HEAD + i * RH + RH / 2; };

    // 表头
    svg.appendChild(svgText(ISSUE_W / 2, HEAD - 6, '期次', { size: 10 }));
    for (let d = 0; d <= 9; d++) {
      svg.appendChild(svgText(cx(d), HEAD - 6, String(d), { size: 11, fill: '#5a6879' }));
    }
    svg.appendChild(s('line', {
      x1: 0, y1: HEAD - 1, x2: w, y2: HEAD - 1, stroke: '#e3e8f0', 'stroke-width': 1
    }));

    // 每 10 期一条分隔线（方便数期数）
    for (let i = 1; i < n; i++) {
      if (i % 10 === 0) {
        svg.appendChild(s('line', {
          x1: 0, y1: cy(i) - RH / 2, x2: w, y2: cy(i) - RH / 2,
          stroke: '#f0b27a', 'stroke-width': 1, opacity: 0.85
        }));
      }
    }

    const hits = [];                       // 每期命中的数字（不分位时有多个）
    rows.forEach(function (r, i) {
      svg.appendChild(svgText(ISSUE_W / 2, cy(i) + 3.5, r.issue, { size: 9.5, fill: '#6b7686' }));
      const hit = keysOf(r);
      hits.push(hit);
      for (let d = 0; d <= 9; d++) {
        const on = hit.indexOf(d) >= 0;
        if (!on) {
          svg.appendChild(svgText(cx(d), cy(i) + 3.5, String(C.gapOf(series[i], d)), { size: 10 }));
        }
      }
    });

    // 连线：按位 = 逐期串成一条折线；不分位 = 同一个数字的相邻两次出现相连
    if (showLine) {
      if (!isAny) {
        const pts = rows.map(function (r, i) { return [cx(r.d[posIdx]), cy(i)]; });
        svg.appendChild(s('polyline', {
          points: pts.map(function (p) { return p.join(','); }).join(' '),
          fill: 'none', stroke: color, 'stroke-width': 1.4, opacity: 0.45
        }));
      } else {
        for (let d = 0; d <= 9; d++) {
          let prev = null;
          rows.forEach(function (r, i) {
            if (r.d.indexOf(d) < 0) return;
            if (prev !== null) {
              svg.appendChild(s('line', {
                x1: cx(d), y1: cy(prev), x2: cx(d), y2: cy(i),
                stroke: color, 'stroke-width': 1.4, opacity: 0.45
              }));
            }
            prev = i;
          });
        }
      }
    }

    // 圆圈画在线之上
    rows.forEach(function (r, i) {
      hits[i].forEach(function (d) {
        svg.appendChild(s('circle', {
          cx: cx(d), cy: cy(i), r: 9, fill: color
        }));
        svg.appendChild(svgText(cx(d), cy(i) + 3.5, String(d), { size: 10, fill: '#fff' }));
      });
    });

    return svg;
  }

  function renderGrid() {
    const box = C.$('#tg-chart');
    C.clear(box);
    const posIdx = +C.$('#tg-pos').value;
    const n = +C.$('#tg-n').value;
    const showLine = C.$('#tg-line').checked;
    const isNarrow = C.narrow();
    const from = Math.max(0, D.length - n);
    const rows = D.slice(from);

    const head = C.el('div', {
      style: 'font-size:12.5px;color:' + GRID_COLOR[posIdx] +
             ';margin:2px 0 6px 6px;font-weight:600',
      text: POS_NAME[posIdx] + '　最近 ' + rows.length + ' 期' + (isNarrow ? '（手机版格子加大）' : '')
    });
    box.appendChild(head);
    box.appendChild(gridChart(rows, from, posIdx, showLine, isNarrow));

    C.clear(C.$('#tg-legend'));
    C.$('#tg-legend').appendChild(C.el('div', {
      html: '格子里的数字是<b>遗漏值</b>：截至该期开奖前，这个数字在这个位置上已经连续多少期没出现' +
            '（0 = 上一期刚出过；有些站点把这种情况记作 1）。' +
            (posIdx === 3
              ? '「不分位」的连线表示<b>同一个数字</b>的相邻两次出现。'
              : '连线表示每期开出数字的先后顺序。') +
            '遗漏值大 ≠ 该出了：每期都是独立事件。'
    }));
  }

  /* ---------------- 开奖记录 ---------------- */
  function typeBlock(t) {
    return C.el('span', { class: 'type-block', style: 'background:' + TYPE_COLOR[t], text: t });
  }

  // 电脑版：三栏分开（组三 / 组六 / 豹子），命中那栏是色块
  function drawLogWide(rows, series, showGap) {
    const tbody = C.el('tbody');
    rows.forEach(function (r, i) {
      const cells = [];
      TYPE_ORDER.forEach(function (t) {
        if (r.type === t) {
          cells.push(C.el('td', {}, [typeBlock(t)]));
        } else {
          cells.push(C.el('td', {
            class: 'num',
            text: showGap ? String(C.gapOf(series[i], t)) : ''
          }));
        }
      });
      tbody.appendChild(C.el('tr', {}, [
        C.el('td', { class: 'num', text: r.issue }),
        C.el('td', { class: 'num draw-num', text: r.number }),
        cells[0], cells[1], cells[2]
      ]));
    });
    return C.el('table', {}, [
      C.el('thead', {}, [C.el('tr', {}, [
        C.el('th', { text: '期次' }),
        C.el('th', { text: '开奖号' }),
        C.el('th', { text: '组三' }),
        C.el('th', { text: '组六' }),
        C.el('th', { text: '豹子' })
      ])]),
      tbody
    ]);
  }

  /* 手机版：三栏并成一栏——色块后面跟一行小字写另外两种组态各遗漏多少期，
     这样一行放得下，不用左右滑，也不用为了对齐把数字挤成两行。 */
  function drawLogNarrow(rows, series, showGap) {
    const tbody = C.el('tbody');
    rows.forEach(function (r, i) {
      const others = TYPE_ORDER.filter(function (t) { return t !== r.type; })
        .map(function (t) { return t + ' ' + C.gapOf(series[i], t); }).join(' · ');
      tbody.appendChild(C.el('tr', {}, [
        C.el('td', { class: 'num', text: r.issue }),
        C.el('td', { class: 'num draw-num', text: r.number }),
        C.el('td', {}, [
          typeBlock(r.type),
          showGap
            ? C.el('span', { class: 'gap-mini', text: others })
            : null
        ])
      ]));
    });
    return C.el('table', {}, [
      C.el('thead', {}, [C.el('tr', {}, [
        C.el('th', { text: '期次' }),
        C.el('th', { text: '开奖号' }),
        C.el('th', { text: '组态（另两种的遗漏）' })
      ])]),
      tbody
    ]);
  }

  function renderDrawLog() {
    const box = C.$('#dl-table');
    C.clear(box);
    const n = +C.$('#dl-n').value;
    const showGap = C.$('#dl-gap').checked;
    const from = Math.max(0, D.length - n);
    const rows = D.slice(from);
    const series = C.gapSeries(D, C.keyOfType, from);

    const isNarrow = C.narrow();
    box.appendChild(C.tableScroll(isNarrow
      ? drawLogNarrow(rows, series, showGap)
      : drawLogWide(rows, series, showGap)));
    box.appendChild(C.el('div', {
      class: 'note',
      text: '色块 = 当期开出的组态；' + (isNarrow
              ? '后面小字是另外两种组态"距上次出现过了多少期"。'
              : '同一行其余两栏是"距上次出现过了多少期"。') +
            '豹子（三个数字相同）理论上约 1% 才会出现一次，' +
            '所以那一栏常年是三位数，这是正常的，不代表"快出了"。'
    }));

    C.clear(C.$('#dl-legend'));
    C.$('#dl-legend').appendChild(C.el('div', {
      html: '数据源：中国福彩网官方接口，共 ' + D.length + ' 期（' +
            D[0].issue + ' ~ ' + D[D.length - 1].issue + '）。' +
            (isNarrow ? '手机版三栏并成一栏，电脑版是三栏分开的表格。' : '')
    }));
  }

  window.GRID = { render: renderGrid };
  window.DRAWLOG = { render: renderDrawLog };

  document.addEventListener('DOMContentLoaded', function () {
    ['#tg-pos', '#tg-n', '#tg-line'].forEach(function (sel) {
      const el = document.querySelector(sel);
      if (el) el.addEventListener('change', renderGrid);
    });
    ['#dl-n', '#dl-gap'].forEach(function (sel) {
      const el = document.querySelector(sel);
      if (el) el.addEventListener('change', renderDrawLog);
    });
    // 手机 ↔ 电脑（旋转屏幕 / 拖窗口）时换一套排版
    C.onNarrowChange(function () {
      renderGrid();
      renderDrawLog();
    });
  });
})();
