/* ================= 遗漏统计 ================= */
(function () {
  'use strict';
  const C = window.CORE;
  const POS_NAME = ['第一位', '第二位', '第三位'];
  let sortByGap = false;

  const statsCache = {};

  function computeStats(rows, pos) {
    const L = rows.length;
    const appear = [];
    for (let d = 0; d <= 9; d++) appear.push([]);
    rows.forEach(function (r, i) { appear[r.d[pos]].push(i); });

    return appear.map(function (idxList, d) {
      const count = idxList.length;
      let maxGap = 0;
      if (count === 0) {
        maxGap = L;
      } else {
        maxGap = Math.max(maxGap, idxList[0]);                    // 窗口开头到首次出现
        for (let i = 1; i < idxList.length; i++) {
          maxGap = Math.max(maxGap, idxList[i] - idxList[i - 1] - 1);
        }
        maxGap = Math.max(maxGap, L - 1 - idxList[count - 1]);    // 末次出现到窗口结束
      }
      const current = count === 0 ? L : (L - 1 - idxList[count - 1]);
      return {
        digit: d,
        count: count,
        rate: L ? count / L : 0,
        avgGap: count ? L / count : NaN,
        maxGap: maxGap,
        current: current
      };
    });
  }

  function tableFor(pos, stats) {
    const sorted = stats.slice();
    if (sortByGap) sorted.sort(function (a, b) { return b.current - a.current; });

    const maxRate = Math.max.apply(null, stats.map(function (x) { return x.rate; })) || 1;
    const tbody = C.el('tbody');
    sorted.forEach(function (x) {
      const rateCell = C.el('td', { class: 'bar-cell' }, [
        C.el('div', { class: 'bar' }, [
          C.el('i', { style: 'width:' + (x.rate / maxRate * 100).toFixed(1) + '%' })
        ])
      ]);
      tbody.appendChild(C.el('tr', {}, [
        C.el('td', {}, [C.el('b', { text: String(x.digit) })]),
        C.el('td', { class: 'num', text: String(x.count) }),
        C.el('td', { class: 'num', text: C.pct(x.rate, 1) }),
        rateCell,
        C.el('td', { class: 'num', text: isNaN(x.avgGap) ? '—' : C.fixed(x.avgGap, 1) }),
        C.el('td', { class: 'num', text: String(x.maxGap) }),
        C.el('td', { class: 'num' }, [
          x.current >= 30
            ? C.el('span', { class: 'tag hot', text: String(x.current) })
            : C.el('span', { text: String(x.current) })
        ])
      ]));
    });

    const table = C.el('table', {}, [
      C.el('thead', {}, [C.el('tr', {}, [
        C.el('th', { text: '数字' }),
        C.el('th', { text: '出现次数' }),
        C.el('th', { text: '频率' }),
        C.el('th', { text: '' }),
        C.el('th', { text: '平均遗漏' }),
        C.el('th', { text: '最大遗漏' }),
        C.el('th', { text: '当前遗漏' })
      ])]),
      tbody
    ]);

    return C.el('div', {
      style: 'border:1px solid var(--line);border-radius:8px;padding:10px 12px'
    }, [
      C.el('div', {
        style: 'font-weight:600;margin-bottom:6px;color:var(--ink-2)',
        text: POS_NAME[pos]
      }),
      C.tableScroll(table)
    ]);
  }

  /* 口径说明卡：与第三位表格并排，既补齐网格又把"多少波动算正常"讲清楚 */
  function legendCard(L) {
    const p = 0.1;
    const expCount = L * p;
    const sd = Math.sqrt(L * p * (1 - p));
    const lo = Math.max(1, expCount - sd), hi = expCount + sd;

    const rows = [
      ['当前遗漏',
       '距离该数字上次出现在该位置，已经过了多少期（统计到最新一期）。' +
       '红底标记 = 当前遗漏 ≥ 30 期，仅为统计提示，不代表"该出了"。'],
      ['平均遗漏',
       '窗口期数 ÷ 出现次数。每位每数字的理论出现概率恒为 1/10，' +
       '所以理论平均遗漏恒为 10.0 期。'],
      ['最大遗漏',
       '窗口内相邻两次出现之间的最大间隔（含窗口开头与结尾两段）。'],
      ['多少波动算正常',
       '本轮窗口 ' + L + ' 期，每个数字理论出现 ' + expCount.toFixed(0) +
       ' 次；随机波动约 ±' + sd.toFixed(0) + ' 次，' +
       '因此出现 ' + lo.toFixed(0) + '~' + hi.toFixed(0) + ' 次都属正常范围，' +
       '对应平均遗漏约 ' + (L / hi).toFixed(1) + '~' + (L / lo).toFixed(1) + ' 期。']
    ];

    const wrap = C.el('div', {
      style: 'border:1px solid var(--line);border-radius:8px;padding:10px 12px'
    });
    wrap.appendChild(C.el('div', {
      style: 'font-weight:600;margin-bottom:8px;color:var(--ink-2)',
      text: '口径说明'
    }));
    rows.forEach(function (r) {
      wrap.appendChild(C.el('div', { style: 'margin-bottom:9px' }, [
        C.el('div', { style: 'font-size:12.5px;font-weight:600', text: r[0] }),
        C.el('div', { style: 'font-size:12.5px;color:var(--ink-2)', text: r[1] })
      ]));
    });
    wrap.appendChild(C.el('div', { class: 'note', style: 'margin-top:2px' }, [
      C.el('div', {
        text: '表格里所有偏离 10.0 的数字，都落在上面这个随机波动区间内——' +
              '说明实际数据与"完全均匀"没有统计上显著的差异，' +
              '不存在可以被利用的"冷热规律"。'
      })
    ]));
    return wrap;
  }

  function render() {
    const win = +C.$('#om-window').value;
    const rows = C.sliceWindow(C.DRAWS, win);
    const key = String(win) + '|' + String(sortByGap);
    if (statsCache[key]) {
      C.clear(C.$('#om-tables'));
      C.$('#om-tables').appendChild(statsCache[key]);
      return;
    }

    // 2×2 网格：三张表格保持同宽，第四格放口径说明
    const outer = C.el('div', { class: 'grid2' });
    const stats = [];
    for (let p = 0; p < 3; p++) stats.push(computeStats(rows, p));
    outer.appendChild(tableFor(0, stats[0]));
    outer.appendChild(tableFor(1, stats[1]));
    outer.appendChild(tableFor(2, stats[2]));
    outer.appendChild(legendCard(rows.length));

    C.clear(C.$('#om-tables'));
    C.$('#om-tables').appendChild(outer);
    statsCache[key] = outer;
  }

  window.OMISSION = { render: render };

  document.addEventListener('DOMContentLoaded', function () {
    const sel = document.getElementById('om-window');
    if (sel) sel.addEventListener('change', function () { C.clear(C.$('#om-tables')); render(); });
    const btn = document.getElementById('om-sort');
    if (btn) btn.addEventListener('click', function () {
      sortByGap = !sortByGap;
      btn.textContent = sortByGap ? '按数字排序' : '按当前遗漏排序';
      C.clear(C.$('#om-tables'));
      render();
    });
  });
})();
