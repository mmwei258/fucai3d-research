/* ================= 策略回测实验室 ================= */
(function () {
  'use strict';
  const C = window.CORE;
  const D = C.DRAWS, T = C.THEORY;
  const WINDOW = 360;
  const KS = [1, 5, 10, 20, 50];
  let built = false;

  // 确定性伪随机（保证同一期结果可复现）
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // 随机排序的前 n 名 == 从 0..999 无放回抽 n 个，直接抽样更快且等价
  function rankRandom(idx, trial, limit) {
    const n = limit || 50;
    const rnd = mulberry32(idx * 7919 + (trial || 0) * 104729 + 13);
    const seen = new Set();
    const out = [];
    while (out.length < n) {
      const v = Math.floor(rnd() * 1000);
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out;
  }

  function rankFrequency(idx, mode, limit) {
    const s = Math.max(0, idx - WINDOW);
    const f = [new Int32Array(10), new Int32Array(10), new Int32Array(10)];
    for (let j = s; j < idx; j++) {
      const r = D[j];
      f[0][r.d[0]]++; f[1][r.d[1]]++; f[2][r.d[2]]++;
    }
    const lg = [new Float64Array(10), new Float64Array(10), new Float64Array(10)];
    for (let p = 0; p < 3; p++) {
      for (let d = 0; d < 10; d++) {
        const v = Math.log(f[p][d] + 1);
        lg[p][d] = mode === 'hot' ? v : -v;
      }
    }
    return top50ByScore(function (a, b, c) {
      return lg[0][a] + lg[1][b] + lg[2][c];
    }, idx, limit);
  }

  function rankGap(idx, limit) {
    const last = [new Int32Array(10).fill(-1), new Int32Array(10).fill(-1), new Int32Array(10).fill(-1)];
    for (let j = 0; j < idx; j++) {
      const r = D[j];
      last[0][r.d[0]] = j; last[1][r.d[1]] = j; last[2][r.d[2]] = j;
    }
    const g = [new Float64Array(10), new Float64Array(10), new Float64Array(10)];
    for (let p = 0; p < 3; p++) {
      for (let d = 0; d < 10; d++) {
        g[p][d] = last[p][d] < 0 ? idx + 1 : idx - last[p][d];
      }
    }
    return top50ByScore(function (a, b, c) {
      return g[0][a] + g[1][b] + g[2][c];
    }, idx, limit);
  }

  function rankMarkov(idx, limit) {
    const tr = [];
    for (let p = 0; p < 3; p++) {
      const m = [];
      for (let i = 0; i < 10; i++) m.push(new Float64Array(10).fill(1));
      tr.push(m);
    }
    for (let j = 1; j < idx; j++) {
      const a = D[j - 1], b = D[j];
      for (let p = 0; p < 3; p++) tr[p][a.d[p]][b.d[p]]++;
    }
    const prev = D[idx - 1];
    const lg = [new Float64Array(10), new Float64Array(10), new Float64Array(10)];
    for (let p = 0; p < 3; p++) {
      const row = tr[p][prev.d[p]];
      let tot = 0;
      for (let d = 0; d < 10; d++) tot += row[d];
      for (let d = 0; d < 10; d++) lg[p][d] = Math.log(row[d] / tot);
    }
    return top50ByScore(function (a, b, c) {
      return lg[0][a] + lg[1][b] + lg[2][c];
    }, idx, limit);
  }

  function top50ByScore(fn, idx, limit) {
    const rnd = mulberry32(idx * 104729 + 7);
    const keys = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) keys[i] = rnd();
    const arr = [];
    for (let a = 0; a < 10; a++) {
      for (let b = 0; b < 10; b++) {
        for (let c = 0; c < 10; c++) {
          arr.push([fn(a, b, c), keys[a * 100 + b * 10 + c], a * 100 + b * 10 + c]);
        }
      }
    }
    arr.sort(function (x, y) { return (y[0] - x[0]) || (x[1] - y[1]); });
    return arr.slice(0, limit || 50).map(function (x) { return x[2]; });
  }

  function numOf(i) {
    return (Math.floor(i / 100) + '') + (Math.floor(i / 10) % 10) + (i % 10);
  }

  // 每种策略：fn(idx, trial, limit) -> 前 limit 个候选号码（limit 默认 50）
  const STRATEGIES = {
    random: { name: '纯随机', fn: function (i, t, lim) { return rankRandom(i, t, lim); } },
    hot: { name: '热号优先', fn: function (i, t, lim) { return rankFrequency(i, 'hot', lim); } },
    cold: { name: '冷号优先', fn: function (i, t, lim) { return rankFrequency(i, 'cold', lim); } },
    gap: { name: '遗漏值法', fn: function (i, t, lim) { return rankGap(i, lim); } },
    markov: { name: '马尔可夫链', fn: function (i, t, lim) { return rankMarkov(i, lim); } }
  };

  function runBacktest(key, periods) {
    const st = STRATEGIES[key];
    const total = D.length;
    const start = total - periods;
    const hits = {}; KS.forEach(function (k) { hits[k] = 0; });
    const groupHits = { 20: 0 };
    const trials = key === 'random' ? 30 : 1;

    for (let idx = start; idx < total; idx++) {
      const actual = D[idx].number;
      const actualSorted = D[idx].sorted;
      for (let t = 0; t < trials; t++) {
        const ranked = st.fn(idx, t);
        const numbers = ranked.map(numOf);
        KS.forEach(function (k) {
          if (numbers.slice(0, k).indexOf(actual) >= 0) hits[k] += 1 / trials;
        });
        const seen = {}, groups = [];
        for (let i = 0; i < numbers.length; i++) {
          const n = numbers[i];
          const s = n.split('').sort().join('');
          if (!seen[s]) { seen[s] = 1; groups.push(s); }
        }
        if (groups.slice(0, 20).indexOf(actualSorted) >= 0) groupHits[20] += 1 / trials;
      }
    }
    return { hits: hits, group20: groupHits[20], periods: periods };
  }

  function renderResult(key, r) {
    const box = C.$('#bt-result');
    C.clear(box);
    const n = r.periods;
    const name = STRATEGIES[key].name;

    const best = Math.max.apply(null, KS.map(function (k) { return r.hits[k] / n - T.topN(k); }));

    const table = C.el('table');
    table.appendChild(C.el('thead', {}, [C.el('tr', {}, [
      C.el('th', { text: '指标' }),
      C.el('th', { text: '命中次数' }),
      C.el('th', { text: '命中率' }),
      C.el('th', { text: '随机基线' }),
      C.el('th', { text: '差异' })
    ])]));
    const tb = C.el('tbody');
    KS.forEach(function (k) {
      const rate = r.hits[k] / n, base = T.topN(k), d = rate - base;
      tb.appendChild(C.el('tr', {}, [
        C.el('td', { text: 'Top' + k }),
        C.el('td', { class: 'num', text: C.fixed(r.hits[k], 1) + ' / ' + n }),
        C.el('td', { class: 'num', text: C.pct(rate) }),
        C.el('td', { class: 'num', text: C.pct(base) }),
        C.el('td', { class: 'num' }, [
          C.el('span', {
            class: Math.abs(d) < 1e-9 ? 'tag gray' : (d > 0 ? 'tag hot' : 'tag cold'),
            text: (d >= 0 ? '+' : '') + (d * 100).toFixed(2) + 'pt'
          })
        ])
      ]));
    });
    const gRate = r.group20 / n, gBase = T.groupTop20Rate;
    tb.appendChild(C.el('tr', {}, [
      C.el('td', { text: '组选 Top20' }),
      C.el('td', { class: 'num', text: C.fixed(r.group20, 1) + ' / ' + n }),
      C.el('td', { class: 'num', text: C.pct(gRate) }),
      C.el('td', { class: 'num', text: C.pct(gBase) }),
      C.el('td', { class: 'num' }, [
        C.el('span', {
          class: gRate > gBase ? 'tag hot' : 'tag cold',
          text: (gRate - gBase >= 0 ? '+' : '') + ((gRate - gBase) * 100).toFixed(2) + 'pt'
        })
      ])
    ]));
    table.appendChild(tb);

    box.appendChild(C.el('h3', { text: '【' + name + '】样本外回测结果（' + n + ' 期）' }));
    box.appendChild(C.tableScroll(table));

    const verdict = best > 0
      ? '该策略在最高一项上比基线高 ' + (best * 100).toFixed(2) +
        ' 个百分点。注意：单一指标的小幅领先在统计上通常不显著——' +
        '换一段历史数据重跑，结果往往会变。'
      : '该策略在全部指标上都没有超过随机基线。';
    box.appendChild(C.el('div', { class: 'note' + (best > 0 ? '' : ' warn'), text: verdict }));

    box.appendChild(C.el('div', {
      class: 'note',
      html: '<b>怎么解读：</b>TopN 的随机基线是精确值 N/1000。' +
            '如果某种策略真有优势，它应该在这一栏持续高出一截；' +
            '小幅波动属于噪声。想验证真假，把「回测期数」换成 200 / 500 / 1000 各跑一次，' +
            '看结论是否稳定——真正的优势不会因为换个时间段就消失。'
    }));
  }

  function renderBaseline() {
    const el = C.$('#bt-baseline');
    if (el.childElementCount) return;
    const table = C.el('table');
    table.appendChild(C.el('thead', {}, [C.el('tr', {}, [
      C.el('th', { text: '指标' }),
      C.el('th', { text: '理论基线（精确值）' }),
      C.el('th', { text: '计算方式' })
    ])]));
    const tb = C.el('tbody');
    [
      ['精确 Top1', 1 / 1000, '1 ÷ 1000'],
      ['精确 Top5', 5 / 1000, '5 ÷ 1000'],
      ['精确 Top10', 10 / 1000, '10 ÷ 1000'],
      ['精确 Top20', 20 / 1000, '20 ÷ 1000'],
      ['精确 Top50', 50 / 1000, '50 ÷ 1000'],
      ['组选 Top20', T.groupTop20Rate, '20 ÷ 220 种无序组合'],
      ['和值 Top3（' + T.sumTop3.join('/') + '）', T.sumTop3Rate, '这 3 个和值在 1000 种组合中的占比'],
      ['跨度 Top3（' + T.spanTop3.join('/') + '）', T.spanTop3Rate, '这 3 个跨度在 1000 种组合中的占比'],
      ['最常见组态（组六）', T.typeTop1Rate, '组六在 1000 种组合中的占比']
    ].forEach(function (r) {
      tb.appendChild(C.el('tr', {}, [
        C.el('td', { text: r[0] }),
        C.el('td', { class: 'num', text: C.pct(r[1]) }),
        C.el('td', { style: 'text-align:right;color:var(--ink-3);font-size:12px', text: r[2] })
      ]));
    });
    table.appendChild(tb);
    el.appendChild(C.tableScroll(table));
    el.appendChild(C.el('div', {
      class: 'note',
      text: '提示：和值、跨度、组态的"高命中率"来自取值种类少，不代表预测能力。' +
            '例如直接喊"我猜组六"，长期就有约 72% 命中——这是数学结构，不是本事。'
    }));
  }

  /* ================= 对照实验：排除最近 N 期已开出的号码，有用吗？ =================
     与选号器里那个"排除"开关是同一件事：
       对每一期，先按策略给 000~999 排序，再剔除"最近 N 期开出过"的号码，然后取 Top20。
     结论由数据说话——如果 N 变大命中率不升反降，那这个开关就只是"少买少覆盖"。 */
  const EXCL_WINDOWS = [0, 30, 50, 100, 150, 200];
  const EXCL_PERIODS = 500;
  const EXCL_RANDOM_TRIALS = 10;

  function runExclusion() {
    const total = D.length, start = total - EXCL_PERIODS;
    const out = [];
    Object.keys(STRATEGIES).forEach(function (key) {
      const st = STRATEGIES[key];
      const trials = key === 'random' ? EXCL_RANDOM_TRIALS : 1;
      const rows = {};
      EXCL_WINDOWS.forEach(function (w) {
        rows[w] = { excluded: 0, exHit: 0, hit20: 0 };
      });
      for (let idx = start; idx < total; idx++) {
        const actual = D[idx].number;
        const sets = {};
        EXCL_WINDOWS.forEach(function (w) {
          const s = new Set();
          for (let j = Math.max(0, idx - w); j < idx; j++) s.add(D[j].number);
          sets[w] = s;
          rows[w].excluded += s.size / EXCL_PERIODS;
          if (s.has(actual)) rows[w].exHit += 1 / EXCL_PERIODS;
        });
        for (let t = 0; t < trials; t++) {
          // 取 200 个候选：即使排掉 200 期开出的号码（约 180 个），也还有足够号码可排 Top20
          const ranked = st.fn(idx, t, 200).map(numOf);
          EXCL_WINDOWS.forEach(function (w) {
            const s = sets[w];
            const pool = s.size ? ranked.filter(function (n) { return !s.has(n); }) : ranked;
            if (pool.slice(0, 20).indexOf(actual) >= 0) {
              rows[w].hit20 += 1 / (EXCL_PERIODS * trials);
            }
          });
        }
      }
      out.push({ key: key, name: st.name, rows: rows });
    });
    return out;
  }

  function renderExclusion(btn) {
    const box = C.$('#bt-excl');
    C.clear(box);
    const status = C.$('#bt-excl-status');
    const t0 = Date.now();
    const res = runExclusion();
    const ms = Date.now() - t0;

    // ---- 表一：排除窗口到底排掉多少、代价是什么 ----
    const t1 = C.el('table');
    t1.appendChild(C.el('thead', {}, [C.el('tr', {}, [
      C.el('th', { text: '排除窗口 N' }),
      C.el('th', { text: '排掉的号码（去重）' }),
      C.el('th', { text: '占 1000 个组合' }),
      C.el('th', { text: '这批号码实测命中下期的频率' }),
      C.el('th', { text: '理论值（= 排掉个数 ÷ 1000）' })
    ])]));
    const tb1 = C.el('tbody');
    const base = res[0].rows;
    EXCL_WINDOWS.forEach(function (w) {
      const r = base[w];
      const theory = r.excluded / 1000;
      tb1.appendChild(C.el('tr', {}, [
        C.el('td', { text: w === 0 ? '不排除' : '最近 ' + w + ' 期' }),
        C.el('td', { class: 'num', text: C.fixed(r.excluded, 1) + ' 个' }),
        C.el('td', { class: 'num', text: C.pct(r.excluded / 1000, 1) }),
        C.el('td', { class: 'num', text: C.pct(r.exHit) }),
        C.el('td', { class: 'num', text: C.pct(theory) })
      ]));
    });
    t1.appendChild(tb1);

    box.appendChild(C.el('h3', { text: '一、排掉的是什么：这批号码自己命中下期的频率' }));
    box.appendChild(C.el('p', { class: 'hint', text: '手机上表格可左右滑动查看全部列。' }));
    box.appendChild(C.tableScroll(t1));
    box.appendChild(C.el('div', {
      class: 'note',
      text: '看第 4 列和第 5 列是否接近：越接近，说明被排掉的号码和其它号码一样随机。' +
            '排掉它们＝主动放弃这部分覆盖概率，换来的是下注注数变少（少买少亏），' +
            '而不是"剩下的号码更容易中"。'
    }));

    // ---- 表二：命中率对照（5 策略 × 6 个窗口，Top20）----
    const t2 = C.el('table');
    const head = [C.el('th', { text: '策略' })];
    EXCL_WINDOWS.forEach(function (w) {
      head.push(C.el('th', { text: w === 0 ? '不排除' : 'N=' + w }));
    });
    head.push(C.el('th', { text: '最大差异' }));
    t2.appendChild(C.el('thead', {}, [C.el('tr', {}, head)]));
    const tb2 = C.el('tbody');
    res.forEach(function (s) {
      const cells = [C.el('td', { text: s.name })];
      const b0 = s.rows[0].hit20;
      let worst = 0;
      EXCL_WINDOWS.forEach(function (w) {
        const v = s.rows[w].hit20;
        if (Math.abs(v - b0) > Math.abs(worst)) worst = v - b0;
        cells.push(C.el('td', { class: 'num' }, [
          C.el('span', {
            class: Math.abs(v - b0) < 1e-9 ? '' : (v > b0 ? 'tag hot' : 'tag cold'),
            text: C.pct(v)
          })
        ]));
      });
      cells.push(C.el('td', { class: 'num' }, [
        C.el('span', {
          class: Math.abs(worst) < 1e-9 ? 'tag gray' : (worst > 0 ? 'tag hot' : 'tag cold'),
          text: (worst >= 0 ? '+' : '') + (worst * 100).toFixed(2) + 'pt'
        })
      ]));
      tb2.appendChild(C.el('tr', {}, cells));
    });
    t2.appendChild(tb2);

    const maxDiff = (function () {
      let m = 0;
      res.forEach(function (s) {
        const b0 = s.rows[0].hit20;
        EXCL_WINDOWS.forEach(function (w) {
          const d = Math.abs(s.rows[w].hit20 - b0);
          if (d > m) m = d;
        });
      });
      return m;
    })();

    box.appendChild(C.el('h3', { text: '二、对 Top20 命中率的影响（' + EXCL_PERIODS + ' 期样本外）' }));
    box.appendChild(C.tableScroll(t2));
    // 单个数据点的随机波动：Top20 基线 20%，500 期的 1 个标准差 ≈ 1.8pt
    const noise = Math.sqrt(T.topN(20) * (1 - T.topN(20)) / EXCL_PERIODS);
    box.appendChild(C.el('div', { class: 'note warn' }, [
      C.el('div', {
        html: '<b>结论：把排除窗口从 30 期扩到 200 期，命中率不会变好。</b>' +
              '表里最大的差异是 ' + C.pct(maxDiff, 2) + '（' + EXCL_PERIODS + ' 期里相当于 ' +
              C.fixed(maxDiff * EXCL_PERIODS, 1) + ' 期），只有该指标随机波动（1 个标准差 = ' +
              C.pct(noise, 2) + '）的 ' + C.fixed(maxDiff / noise, 1) +
              ' 倍——达不到"稳定优势"的量级，同一张表里方向还有正有负。'
      }),
      C.el('div', {
        style: 'margin-top:6px',
        html: '原因在表一：被排掉的号码自己命中下期的频率和理论值几乎一样，' +
              '说明"刚出过的号码"并不比别的号码更容易或更不容易再出。' +
              '所以排除窗口越大，你能覆盖的组合越少，<b>中奖概率按同样比例变小</b>；' +
              '唯一的实际好处是下注金额也跟着少了——少买少亏，不是不亏。'
      })
    ]));

    if (status) status.textContent = '已算完（' + ms + 'ms）';
    if (btn) { btn.disabled = false; btn.textContent = '跑排除窗口对照'; }
  }

  function render() {
    renderBaseline();
    if (built) return;
    built = true;
    C.$('#bt-run').addEventListener('click', function () {
      const btn = C.$('#bt-run');
      btn.disabled = true;
      btn.textContent = '计算中…';
      const key = C.$('#bt-strategy').value;
      const periods = +C.$('#bt-n').value;
      setTimeout(function () {
        const r = runBacktest(key, periods);
        renderResult(key, r);
        btn.disabled = false;
        btn.textContent = '开始回测';
      }, 30);
    });
    C.$('#bt-result').appendChild(C.el('div', {
      class: 'empty', text: '选择策略与期数，点击「开始回测」。'
    }));
    C.$('#bt-excl-run').addEventListener('click', function () {
      const btn = C.$('#bt-excl-run');
      btn.disabled = true;
      btn.textContent = '计算中…';
      const status = C.$('#bt-excl-status');
      if (status) status.textContent = '正在按 5 种策略各跑 500 期，约几秒…';
      setTimeout(function () { renderExclusion(btn); }, 30);
    });
  }

  // _run / _strategies 供自动化测试调用，页面本身只使用 render
  window.BACKTEST = {
    render: render, _run: runBacktest, _strategies: STRATEGIES,
    _exclusion: runExclusion, _exclWindows: EXCL_WINDOWS
  };
})();
