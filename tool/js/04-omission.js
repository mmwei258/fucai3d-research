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
      renderHistory();
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
    renderHistory();
  }

  /* ---------------- 历史统计：近 30 期 vs 全历史 ---------------- */
  // 当前遗漏：与「遗漏统计」页同一口径（0 = 上一期刚出过）
  function currentGap(pos, d) {
    const D = C.DRAWS;
    for (let i = D.length - 1; i >= 0; i--) {
      if (D[i].d[pos] === d) return D.length - 1 - i;
    }
    return D.length;
  }

  // 某窗口内、某位某数字的四项统计。serAll 是整段历史的遗漏序列（每位只算一次，10 个数字复用）
  function windowStats(pos, d, from, serAll) {
    const win = C.DRAWS.slice(from);
    const hits = win.map(function (r) { return r.d[pos] === d; });
    const count = hits.filter(Boolean).length;
    let maxGap = 0;
    win.forEach(function (r, i) { maxGap = Math.max(maxGap, C.gapOf(serAll[from + i], d)); });
    return {
      count: count,
      avgGap: count ? win.length / count : NaN,
      maxGap: maxGap,
      streak: C.maxStreak(win, hits)
    };
  }

  function histRows(pos) {
    const D = C.DRAWS;
    const from30 = Math.max(0, D.length - 30);
    const serAll = C.gapSeries(D, C.keyOfPos(pos), 0);
    const rows = [];
    for (let d = 0; d <= 9; d++) {
      rows.push({
        d: d,
        cur: currentGap(pos, d),
        near: windowStats(pos, d, from30, serAll),
        all: windowStats(pos, d, 0, serAll)
      });
    }
    return rows;
  }

  function curCell(x) {
    return C.el('td', { class: 'num' }, [
      x.cur >= 30
        ? C.el('span', { class: 'tag hot', text: String(x.cur) })
        : C.el('span', { text: String(x.cur) })
    ]);
  }

  // 电脑版：10 列表格（球号 / 当前遗漏 / 近30期4项 / 全历史4项）
  function historyTableWide(rows) {
    const tbody = C.el('tbody');
    rows.forEach(function (x) {
      tbody.appendChild(C.el('tr', {}, [
        C.el('td', {}, [C.el('span', { class: 'ball-badge', text: String(x.d) })]),
        curCell(x),
        C.el('td', { class: 'num', text: String(x.near.count) }),
        C.el('td', { class: 'num', text: isNaN(x.near.avgGap) ? '—' : C.fixed(x.near.avgGap, 1) }),
        C.el('td', { class: 'num', text: String(x.near.maxGap) }),
        C.el('td', { class: 'num', text: String(x.near.streak) }),
        C.el('td', { class: 'num', text: String(x.all.count) }),
        C.el('td', { class: 'num', text: isNaN(x.all.avgGap) ? '—' : C.fixed(x.all.avgGap, 1) }),
        C.el('td', { class: 'num', text: String(x.all.maxGap) }),
        C.el('td', { class: 'num', text: String(x.all.streak) })
      ]));
    });

    const table = C.el('table', {}, [
      C.el('thead', {}, [
        C.el('tr', {}, [
          C.el('th', { rowspan: '2', text: '球号' }),
          C.el('th', { rowspan: '2', text: '当前遗漏' }),
          C.el('th', { colspan: '4', text: '近 30 期' }),
          C.el('th', { colspan: '4', text: '全历史（' + C.comma(C.DRAWS.length) + ' 期）' })
        ]),
        C.el('tr', {}, [
          C.el('th', { text: '出现' }),
          C.el('th', { text: '平均遗漏' }),
          C.el('th', { text: '最大遗漏' }),
          C.el('th', { text: '最大连出' }),
          C.el('th', { text: '出现' }),
          C.el('th', { text: '平均遗漏' }),
          C.el('th', { text: '最大遗漏' }),
          C.el('th', { text: '最大连出' })
        ])
      ]),
      tbody
    ]);
    return table;
  }

  /* 手机版：把 10 列拆成两张窄表，少列多行——不用横向滑动，
     第一列（球号）也不会被滑出视野。 */
  function historyTableNarrow(rows) {
    function smallTable(caption, cols) {
      const tbody = C.el('tbody');
      rows.forEach(function (x) {
        const tds = [];
        cols.forEach(function (c) { tds.push(c.cell(x)); });
        tbody.appendChild(C.el('tr', {}, tds));
      });
      return C.el('div', { style: 'margin-bottom:10px' }, [
        C.el('div', {
          style: 'font-size:12px;color:var(--ink-3);margin:0 0 4px 2px',
          text: caption
        }),
        C.el('table', {}, [
          C.el('thead', {}, [C.el('tr', {}, cols.map(function (c) {
            return C.el('th', { text: c.name });
          }))]),
          tbody
        ])
      ]);
    }
    const ball = { name: '球号', cell: function (x) {
      return C.el('td', {}, [C.el('span', { class: 'ball-badge', text: String(x.d) })]);
    } };
    const nearTable = smallTable('当前 / 近 30 期', [
      ball,
      { name: '当前遗漏', cell: curCell },
      { name: '近30出现', cell: function (x) {
        return C.el('td', { class: 'num', text: String(x.near.count) });
      } },
      { name: '近30最大遗漏', cell: function (x) {
        return C.el('td', { class: 'num', text: String(x.near.maxGap) });
      } }
    ]);
    const allTable = smallTable('全历史（' + C.comma(C.DRAWS.length) + ' 期）', [
      ball,
      { name: '出现', cell: function (x) {
        return C.el('td', { class: 'num', text: String(x.all.count) });
      } },
      { name: '平均遗漏', cell: function (x) {
        return C.el('td', { class: 'num',
          text: isNaN(x.all.avgGap) ? '—' : C.fixed(x.all.avgGap, 1) });
      } },
      { name: '最大遗漏', cell: function (x) {
        return C.el('td', { class: 'num', text: String(x.all.maxGap) });
      } },
      { name: '最大连出', cell: function (x) {
        return C.el('td', { class: 'num', text: String(x.all.streak) });
      } }
    ]);
    return C.el('div', {}, [nearTable, allTable, C.el('div', {
      class: 'hint', style: 'margin:0 0 2px 2px',
      text: '手机版把电脑版的 10 列总表拆成两张窄表，省得左右滑动。'
    })]);
  }

  function historyBlock(pos, rows) {
    const isNarrow = C.narrow();
    return C.el('div', {
      class: 'hist-block',
      style: 'border:1px solid var(--line);border-radius:8px;padding:10px 12px'
    }, [
      C.el('div', {
        style: 'font-weight:600;margin-bottom:6px;color:var(--ink-2)',
        text: POS_NAME[pos] + '历史数据'
      }),
      isNarrow ? historyTableNarrow(rows) : C.tableScroll(historyTableWide(rows))
    ]);
  }

  let hsNarrow = null;
  function renderHistory() {
    const box = C.$('#hs-tables');
    if (!box) return;
    const isNarrow = C.narrow();
    if (hsNarrow === isNarrow && box.childElementCount) return;
    hsNarrow = isNarrow;
    C.clear(box);
    const outer = C.el('div', { class: 'grid2' });
    for (let p = 0; p < 3; p++) outer.appendChild(historyBlock(p, histRows(p)));
    outer.appendChild(C.el('div', {
      style: 'border:1px solid var(--line);border-radius:8px;padding:10px 12px'
    }, [
      C.el('div', {
        style: 'font-weight:600;margin-bottom:8px;color:var(--ink-2)',
        text: '怎么读这张表'
      }),
      C.el('div', { style: 'font-size:12.5px;color:var(--ink-2)' }, [
        C.el('div', { text: '· 平均遗漏：理论值恒为 10.0 期（每位每数字出现概率都是 1/10）。' }),
        C.el('div', { style: 'margin-top:6px',
          text: '· 最大遗漏：这个数字在该位置"最长一次连续多少期没出现"。全历史里出现 50~80 期都属正常。' }),
        C.el('div', { style: 'margin-top:6px',
          text: '· 最大连出：连续多少期都出现（理论上连出 2 期的概率 1%，3 期 0.1%）。' }),
        C.el('div', { style: 'margin-top:6px',
          text: '· 近 30 期出现 0~6 次都是随机正常范围；短窗口里"偏热偏冷"是必然现象，不是信号。' })
      ])
    ]));
    box.appendChild(outer);
  }

  window.OMISSION = {
    render: render,
    _windowStats: function (pos, d, from) {
      return windowStats(pos, d, from, C.gapSeries(C.DRAWS, C.keyOfPos(pos), 0));
    },
    _currentGap: currentGap
  };

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
    // 手机 ↔ 电脑时历史统计换排版（10 列总表 ↔ 两张窄表）
    C.onNarrowChange(function () { renderHistory(); });
  });
})();
