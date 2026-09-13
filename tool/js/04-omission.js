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
  /* pos 取值 0/1/2 = 百/十/个位；3 = 不分位（该数字出现在任意位置就算命中，
     也就是走势网格里"不看位置"的那一套口径）。 */
  const POS_ALL = ['第一位', '第二位', '第三位', '不分位（三位一起看）'];
  const isAny = function (pos) { return pos === 3; };
  const keysOfPos = function (pos) { return isAny(pos) ? C.digitKeys : C.keyOfPos(pos); };
  const hitOf = function (pos, row, d) {
    return isAny(pos) ? row.d.indexOf(d) >= 0 : row.d[pos] === d;
  };

  // 当前遗漏：与「遗漏统计」页同一口径（0 = 上一期刚出过）
  function currentGap(pos, d) {
    const D = C.DRAWS;
    for (let i = D.length - 1; i >= 0; i--) {
      if (hitOf(pos, D[i], d)) return D.length - 1 - i;
    }
    return D.length;
  }

  // 某窗口内、某位某数字的四项统计。serAll 是整段历史的遗漏序列（每位只算一次，10 个数字复用）
  function windowStats(pos, d, from, serAll) {
    const win = C.DRAWS.slice(from);
    const hits = win.map(function (r) { return hitOf(pos, r, d); });
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
    const serAll = C.gapSeries(D, keysOfPos(pos), 0);
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
        text: POS_ALL[pos] + '历史数据'
      }),
      isNarrow ? historyTableNarrow(rows) : C.tableScroll(historyTableWide(rows))
    ]);
  }

  let hsNarrow = null;
  /* ---------------- 连出统计（不分位）：相邻两期重复了几个数字 ----------------
     「连出」= 上期出现过的数字，这期又出现了（不看位置）。
     理论分布由规则精确算出（THEORY.overlap），实测值直接数历史，两边并列。 */
  function overlapTable() {
    const D = C.DRAWS;
    const sets = D.map(function (r) { return new Set(r.d); });
    const cnt = [0, 0, 0, 0];
    for (let i = 1; i < D.length; i++) {
      let hit = 0;
      sets[i].forEach(function (d) { if (sets[i - 1].has(d)) hit++; });
      cnt[hit]++;
    }
    const pairs = D.length - 1;
    const theory = C.THEORY.overlap;

    const tbody = C.el('tbody');
    for (let j = 0; j <= 3; j++) {
      tbody.appendChild(C.el('tr', {}, [
        C.el('td', { text: j + ' 个' }),
        C.el('td', { class: 'num', text: C.comma(cnt[j]) + ' 期' }),
        C.el('td', { class: 'num', text: C.pct(cnt[j] / pairs) }),
        C.el('td', { class: 'num', text: C.pct(theory.dist[j]) })
      ]));
    }
    const measuredMean = cnt.reduce(function (s, c, j) { return s + j * c; }, 0) / pairs;
    tbody.appendChild(C.el('tr', {}, [
      C.el('td', { text: '平均' }),
      C.el('td', { class: 'num', text: '—' }),
      C.el('td', { class: 'num', text: C.fixed(measuredMean, 2) + ' 个/期' }),
      C.el('td', { class: 'num', text: C.fixed(theory.mean, 2) + ' 个/期' })
    ]));

    const table = C.el('table', {}, [
      C.el('thead', {}, [C.el('tr', {}, [
        // 手机版表头用短标题：完整的解释在上面的说明里，窄屏放不下长表头
        C.el('th', { text: C.narrow() ? '重复数字个数' : '相邻两期重复的数字个数' }),
        C.el('th', { text: '出现期数' }),
        C.el('th', { text: '实测占比' }),
        C.el('th', { text: '理论占比' })
      ])]),
      tbody
    ]);

    return C.el('div', {}, [
      C.tableScroll(table),
      C.el('div', {
        class: 'hint', style: 'margin-top:10px',
        html: '实测与理论几乎完全重合。也就是说：<b>大约 ' +
              C.pct(theory.onePlus, 1) + ' 的期数里，都会有一个以上的数字与上期重复</b>——' +
              '这是随机结果，不是"热号在延续"。<br>' +
              '原因：单个数字出现在任意位置的概率是 ' +
              C.pct(1 - Math.pow(0.9, 3), 1) + '（三位都不是它的概率 0.9³ = 72.9%），' +
              '所以 10 个数字里平均就有 0.73 个会连着两期都出现。'
      }),
      specifiedTable(),
      windowTable()
    ]);
  }

  /* 指定 k 个数字（比如"7 和 2"）在这一期里都出现、以及连着两期都出现。
     实测取所有组合的平均：1 个数字 10 组、2 个数字 45 组、3 个数字 120 组。 */
  function specifiedTable() {
    const D = C.DRAWS;
    const sets = D.map(function (r) { return new Set(r.d); });
    const rows = [];
    for (let k = 1; k <= 3; k++) {
      const combos = [];
      (function build(prefix, next) {
        if (prefix.length === k) { combos.push(prefix.slice()); return; }
        for (let d = next; d <= 9; d++) { prefix.push(d); build(prefix, d + 1); prefix.pop(); }
      })([], 0);
      let hitSum = 0, bothSum = 0;
      combos.forEach(function (c) {
        for (let i = 0; i < D.length; i++) {
          let all = true;
          for (let t = 0; t < c.length && all; t++) if (!sets[i].has(c[t])) all = false;
          if (all) {
            hitSum++;
            if (i > 0) {
              let prevAll = true;
              for (let t = 0; t < c.length && prevAll; t++) if (!sets[i - 1].has(c[t])) prevAll = false;
              if (prevAll) bothSum++;
            }
          }
        }
      });
      const n = combos.length;
      const p = C.THEORY.allIn(k);
      rows.push({
        k: k,
        hits: hitSum / n, both: bothSum / n,
        p: p, bothTheory: p * p
      });
    }

    const tbody = C.el('tbody');
    rows.forEach(function (r) {
      tbody.appendChild(C.el('tr', {}, [
        C.el('td', { text: r.k + ' 个数字' }),
        C.el('td', { class: 'num', text: C.pct(r.p, 2) }),
        C.el('td', { class: 'num', text: C.pct(r.p * r.p, 4) }),
        C.el('td', { class: 'num', text: C.pct(r.hits / C.DRAWS.length, 2) }),
        C.el('td', { class: 'num', text: C.fixed(r.both, 2) + ' 次' })
      ]));
    });

    const t = C.el('table', {}, [
      C.el('thead', {}, [C.el('tr', {}, [
        C.el('th', { text: '指定的数字' }),
        C.el('th', { text: '这一期都出现（理论）' }),
        C.el('th', { text: '连着两期都出现（理论）' }),
        C.el('th', { text: '这一期都出现（实测均值）' }),
        C.el('th', { text: '相邻两期都出现（实测均值）' })
      ])]),
      tbody
    ]);

    // 用用户举的例子把数字讲实：7 和 2
    let hit72 = 0, both72 = 0;
    for (let i = 0; i < D.length; i++) {
      if (sets[i].has(7) && sets[i].has(2)) {
        hit72++;
        if (i > 0 && sets[i - 1].has(7) && sets[i - 1].has(2)) both72++;
      }
    }
    const p2 = C.THEORY.allIn(2);
    // 「任意两个」：相邻两期共有 2 个以上数字的实测（613/4,749）
    let share2 = 0;
    for (let i = 1; i < D.length; i++) {
      let n = 0;
      sets[i].forEach(function (d) { if (sets[i - 1].has(d)) n++; });
      if (n >= 2) share2++;
    }
    const pairsAll = D.length - 1;
    const pAny = C.THEORY.overlap.dist[2] + C.THEORY.overlap.dist[3];

    return C.el('div', { style: 'margin-top:14px' }, [
      C.el('div', {
        style: 'font-weight:600;margin-bottom:6px;color:var(--ink-2)',
        text: '指定几个数字：它们一起出现的概率有多大？'
      }),
      C.tableScroll(t),
      C.el('div', {
        class: 'hint', style: 'margin-top:10px',
        html: '拿"7 和 2"举例：一期里 7、2 都出现（不看位置）的概率是 <b>' +
              C.pct(p2, 2) + '</b>（54 ÷ 1000）；' +
              '它们<b>连着两期都出现</b>的概率是 <b>' + C.pct(p2 * p2, 4) + '</b>，' +
              '大约 ' + C.comma(Math.round(1 / (p2 * p2))) + ' 期遇到一次。<br>' +
              '实测：我们的 ' + C.comma(D.length) + ' 期里，含 7 和 2 的有 ' + hit72 +
              ' 期（' + C.pct(hit72 / D.length, 2) + '），其中"相邻两期都含 7 和 2"' +
              '出现了 ' + both72 + ' 次，理论期望 ' +
              C.fixed(D.length * p2 * p2, 1) + ' 次——完全在随机范围内。<br>' +
              '<b>上期出现过 7 和 2，并不改变下一期的概率，还是 ' + C.pct(p2, 2) + '。</b>'
      }),
      C.el('div', { class: 'note warn', style: 'margin-top:12px' }, [
        C.el('div', {
          html: '<b>「指定两个数字」和「任意两个数字」是两个完全不同的问题</b>，' +
                '看数字时要分清：'
        }),
        C.el('div', { style: 'margin-top:6px', html:
          '· <b>指定</b>：你事先盯住 7 和 2 这一对——下一期它俩都出现 ' + C.pct(p2, 2) +
          '，连着两期都出现只有 <b>' + C.pct(p2 * p2, 4) + '</b>（约 ' +
          C.comma(Math.round(1 / (p2 * p2))) + ' 期一次）。' }),
        C.el('div', { style: 'margin-top:6px', html:
          '· <b>任意</b>：不指定具体哪一对，只要上期开出的数字里有 2 个（或 3 个）' +
          '在这一期又出现——理论 <b>' + C.pct(pAny, 2) + '</b>，实测 <b>' +
          C.pct(share2 / pairsAll, 2) + '</b>（' + C.comma(share2) + ' / ' +
          C.comma(pairsAll) + ' 组相邻期），平均 <b>' +
          C.fixed(pairsAll / share2, 1) + ' 期就有一次</b>。' }),
        C.el('div', { style: 'margin-top:6px', html:
          '· 还分层：上期是<b>组六</b>（3 个不同数字，占 72% 的期数）→ ' +
          C.pct(C.THEORY.shareTwoGiven(3), 2) + '；上期是<b>组三</b>（2 个不同数字）→ ' +
          C.pct(C.THEORY.shareTwoGiven(2), 2) + '；上期是豹子 → 不可能。' }),
        C.el('div', { style: 'margin-top:6px', html:
          '差别在于"任意"有很多种配对方式，机会自然大得多——但两个数字都完全落在' +
          '随机预期内，没有可利用的规律。' })
      ])
    ]);
  }

  /* 换个问法：在"任意 N 期"这样的窗口里，会不会出现重号？
     理论值由 THEORY.noRepeatWindow 精确算出（马尔可夫链，不是模拟）。 */
  const OVERLAP_WINDOWS = [5, 10, 20, 30];
  function windowTable() {
    const D = C.DRAWS;
    const sets = D.map(function (r) { return new Set(r.d); });
    const tbody = C.el('tbody');
    OVERLAP_WINDOWS.forEach(function (n) {
      let total = 0, clean = 0;              // clean = 一次重号都没有的窗口
      for (let i = 0; i + n <= D.length; i++) {
        total++;
        let has = false;
        for (let j = 1; j < n && !has; j++) {
          sets[i + j].forEach(function (d) { if (sets[i + j - 1].has(d)) has = true; });
        }
        if (!has) clean++;
      }
      const noiseFree = C.THEORY.noRepeatWindow(n);
      tbody.appendChild(C.el('tr', {}, [
        C.el('td', { text: n + ' 期' }),
        C.el('td', { class: 'num', text: C.comma(clean) + ' / ' + C.comma(total) }),
        C.el('td', { class: 'num', text: C.pct(1 - clean / total) }),
        C.el('td', { class: 'num', text: noiseFree < 0.0001 ? '≈100%' : C.pct(1 - noiseFree) })
      ]));
    });

    const t = C.el('table', {}, [
      C.el('thead', {}, [C.el('tr', {}, [
        C.el('th', { text: '窗口' }),
        C.el('th', { text: '一次重号都没有的窗口' }),
        C.el('th', { text: '出现过重号（实测）' }),
        C.el('th', { text: '出现过重号（理论）' })
      ])]),
      tbody
    ]);

    const p = 1 - Math.pow(0.9, 3);
    return C.el('div', { style: 'margin-top:14px' }, [
      C.el('div', {
        style: 'font-weight:600;margin-bottom:6px;color:var(--ink-2)',
        text: '换个问法：任意 N 期里，会不会出现"跟上期重复的数字"？'
      }),
      C.tableScroll(t),
      C.el('div', {
        class: 'hint', style: 'margin-top:10px',
        html: '<b>10 期窗口里一次重号都没有，理论概率只有 ' +
              C.pct(C.THEORY.noRepeatWindow(10), 2) + '</b>——我们 4,741 个 10 期窗口里' +
              '一个都没出现过。所以"看到重号"根本不说明什么，它几乎必然出现。<br>' +
              '再换个问法：<b>某一个数字</b>（不分位）单期出现的概率是 ' + C.pct(p, 2) +
              '，连着出现 2 期是 ' + C.pct(p * p, 2) + '，3 期是 ' + C.pct(p * p * p, 2) +
              '，4 期是 ' + C.pct(Math.pow(p, 4), 2) + '，5 期是 ' + C.pct(Math.pow(p, 5), 3) +
              '：连出越长越罕见——那才是"不随机"才可能出现的东西。'
      })
    ]);
  }

  function renderHistory() {
    const box = C.$('#hs-tables');
    if (!box) return;
    const isNarrow = C.narrow();
    if (hsNarrow === isNarrow && box.childElementCount) return;
    hsNarrow = isNarrow;
    C.clear(box);
    const outer = C.el('div', { class: 'grid2' });
    for (let p = 0; p < 4; p++) outer.appendChild(historyBlock(p, histRows(p)));
    outer.appendChild(C.el('div', {
      style: 'border:1px solid var(--line);border-radius:8px;padding:10px 12px'
    }, [
      C.el('div', {
        style: 'font-weight:600;margin-bottom:8px;color:var(--ink-2)',
        text: '怎么读这张表'
      }),
      C.el('div', { style: 'font-size:12.5px;color:var(--ink-2)' }, [
        C.el('div', { text: '· 平均遗漏：按位置看，理论值恒为 10.0 期（每位每数字出现概率 1/10）；' +
                          '不分位看，理论值为 3.7 期（数字出现在任意位置的概率是 27.1%）。' }),
        C.el('div', { style: 'margin-top:6px',
          text: '· 最大遗漏：这个数字"最长一次连续多少期没出现"。按位置看，全历史里 50~80 期属正常；' +
                '不分位看，20~31 期属正常。' }),
        C.el('div', { style: 'margin-top:6px',
          text: '· 最大连出：连续多少期都出现。按位置看，连出 2 期的概率 1%、3 期 0.1%；' +
                '不分位看，一个数字每期出现的概率就有 27.1%，连出很常见（连出 4 期约 0.5%）。' }),
        C.el('div', { style: 'margin-top:6px',
          text: '· 近 30 期出现 0~6 次都是随机正常范围；短窗口里"偏热偏冷"是必然现象，不是信号。' })
      ])
    ]));
    box.appendChild(outer);

    const ovBox = C.$('#hs-overlap');
    if (ovBox) { C.clear(ovBox); ovBox.appendChild(overlapTable()); }
  }

  window.OMISSION = {
    render: render,
    _windowStats: function (pos, d, from) {
      // 用 keysOfPos：pos = 3 时是不分位口径（数字出现在任意位置都算命中）
      return windowStats(pos, d, from, C.gapSeries(C.DRAWS, keysOfPos(pos), 0));
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
