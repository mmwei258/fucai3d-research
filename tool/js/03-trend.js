/* ================= 走势图 ================= */
(function () {
  'use strict';
  const C = window.CORE;
  const NS = 'http://www.w3.org/2000/svg';
  const CELL_W = 26;
  const ROW_H = 17;
  const AXIS_W = 34;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 20;
  const POS_NAME = ['第一位', '第二位', '第三位'];
  const POS_COLOR = ['#2f6fd0', '#2f855a', '#b7791f'];

  function s(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function text(x, y, str, opts) {
    const o = opts || {};
    const node = s('text', {
      x: x, y: y, 'font-size': o.size || 11,
      fill: o.fill || '#8b98a8', 'text-anchor': o.anchor || 'middle',
      'font-family': 'inherit'
    });
    node.textContent = str;          // ← 曾经漏掉这里，导致图上所有文字为空
    return node;
  }

  // ---- 单个位置的走势图 ----
  function positionChart(rows, pos) {
    const n = rows.length;
    const w = AXIS_W + n * CELL_W + 8;
    const h = PAD_TOP + 10 * ROW_H + PAD_BOTTOM;
    const svg = s('svg', { class: 'chart', width: w, height: h });

    // 横向分隔线 + 左侧数字轴
    for (let d = 0; d <= 9; d++) {
      const y = PAD_TOP + d * ROW_H + ROW_H / 2;
      svg.appendChild(s('line', {
        x1: AXIS_W, y1: y, x2: AXIS_W + n * CELL_W, y2: y,
        stroke: '#f0f2f6', 'stroke-width': 1
      }));
      svg.appendChild(text(AXIS_W - 10, y + 4, String(d), { size: 11 }));
    }

    // 期号（每 5 列标一次，末列必标）
    rows.forEach(function (r, i) {
      if (i % 5 !== 0 && i !== n - 1) return;
      svg.appendChild(text(AXIS_W + i * CELL_W + CELL_W / 2, h - 6,
        r.issue.slice(-3), { size: 10 }));
    });

    const showLine = C.$('#tr-line').checked;
    let prev = null;

    rows.forEach(function (r, i) {
      const dg = r.d[pos];
      const cx = AXIS_W + i * CELL_W + CELL_W / 2;
      const cy = PAD_TOP + dg * ROW_H + ROW_H / 2;

      svg.appendChild(s('circle', {
        cx: cx, cy: cy, r: 8.5, fill: POS_COLOR[pos], opacity: 0.10
      }));
      svg.appendChild(s('circle', {
        cx: cx, cy: cy, r: 4.2, fill: POS_COLOR[pos]
      }));
      svg.appendChild(text(cx, cy + 3.6, String(dg), {
        size: 10, fill: '#fff'
      }));

      if (prev && showLine) {
        svg.appendChild(s('line', {
          x1: prev[0], y1: prev[1], x2: cx, y2: cy,
          stroke: POS_COLOR[pos], 'stroke-width': 1.4, opacity: 0.5
        }));
      }
      prev = [cx, cy];
    });

    return svg;
  }

  // ---- 通用折线图（和值 / 跨度）----
  function lineChart(rows, get, min, max, color, label) {
    const n = rows.length;
    const w = AXIS_W + n * CELL_W + 8;
    const H = 150;
    const plotH = H - PAD_TOP - PAD_BOTTOM;
    const yOf = function (v) {
      return PAD_TOP + plotH - ((v - min) / (max - min)) * plotH;
    };
    const svg = s('svg', { class: 'chart', width: w, height: H });

    // 网格线
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = min + (max - min) * i / ticks;
      const y = yOf(v);
      svg.appendChild(s('line', {
        x1: AXIS_W, y1: y, x2: AXIS_W + n * CELL_W, y2: y,
        stroke: '#f0f2f6', 'stroke-width': 1
      }));
      svg.appendChild(text(AXIS_W - 10, y + 4, String(Math.round(v)), { size: 10 }));
    }
    svg.appendChild(text(6, PAD_TOP + 2, label, { size: 11, anchor: 'start', fill: '#5a6879' }));

    const pts = rows.map(function (r, i) {
      return [AXIS_W + i * CELL_W + CELL_W / 2, yOf(get(r))];
    });
    svg.appendChild(s('polyline', {
      points: pts.map(function (p) { return p.join(','); }).join(' '),
      fill: 'none', stroke: color, 'stroke-width': 1.8, opacity: 0.85
    }));
    pts.forEach(function (p, i) {
      svg.appendChild(s('circle', { cx: p[0], cy: p[1], r: 2.6, fill: color }));
      if (i % 5 === 0 || i === n - 1) {
        svg.appendChild(text(p[0], H - 6, rows[i].issue.slice(-3), { size: 10 }));
      }
    });

    // 理论均值参考线
    return svg;
  }

  function render() {
    const wrap = C.$('#tr-chart');
    if (wrap.childElementCount) return;      // 只渲染一次

    const n = +C.$('#tr-n').value;
    const rows = C.DRAWS.slice(-n);

    C.clear(wrap);
    for (let p = 0; p < 3; p++) {
      const box = C.el('div', { style: 'padding:8px 8px 0' });
      box.appendChild(C.el('div', {
        style: 'font-size:12.5px;color:' + POS_COLOR[p] + ';margin:2px 0 4px 6px;font-weight:600',
        text: POS_NAME[p]
      }));
      box.appendChild(positionChart(rows, p));
      wrap.appendChild(box);
    }

    C.clear(C.$('#tr-legend'));
    C.$('#tr-legend').appendChild(C.el('div', {
      html: '横轴为连续期号（自左向右为由早到晚），纵轴为 0~9 各位数字。' +
            '圆点标出每期在该位置实际开出的数字，连线仅表示前后相邻关系。'
    }));

    const sw = C.$('#tr-sum');
    C.clear(sw);
    sw.appendChild(C.el('div', {
      style: 'font-size:12.5px;color:#5a6879;padding:8px 8px 0 6px',
      text: '和值（三个数字之和，理论范围 0~27，峰值在 13/14）'
    }));
    sw.appendChild(lineChart(rows, function (r) { return r.sum; }, 0, 27, '#2f6fd0', '和值'));

    const pw = C.$('#tr-span');
    C.clear(pw);
    pw.appendChild(C.el('div', {
      style: 'font-size:12.5px;color:#5a6879;padding:8px 8px 0 6px',
      text: '跨度（最大数字 − 最小数字，理论范围 0~9）'
    }));
    pw.appendChild(lineChart(rows, function (r) { return r.span; }, 0, 9, '#b7791f', '跨度'));
  }

  window.TREND = { render: render };

  document.addEventListener('DOMContentLoaded', function () {
    const sel = document.getElementById('tr-n');
    const chk = document.getElementById('tr-line');
    if (sel) sel.addEventListener('change', function () {
      C.clear(document.getElementById('tr-chart'));
      C.clear(document.getElementById('tr-sum'));
      C.clear(document.getElementById('tr-span'));
      render();
    });
    if (chk) chk.addEventListener('change', function () {
      C.clear(document.getElementById('tr-chart'));
      render();
    });
  });
})();
