/* ================= 选号器（含筛选条件） ================= */
(function () {
  'use strict';
  const C = window.CORE;
  const D = C.DRAWS;
  const POS_NAME = ['第一位', '第二位', '第三位'];

  // 福彩3D 直选固定奖金 1040 元 / 注，每注 2 元
  const BET = 2, PRIZE_DIRECT = 1040, PRIZE_G6 = 173, PRIZE_G3 = 346;

  const posSel = [new Set(), new Set(), new Set()];
  const grpSel = new Set();
  const danSel = new Set();
  const f = {
    sumMin: '', sumMax: '', spanMin: '', spanMax: '', gapMin: '', gapMax: '',
    bs: new Set(), oe: new Set()
  };
  let wired = false;

  // 每个号码（000~999）的"当前遗漏"：距离它上次开出过了多少期
  const GAP = (function () {
    const last = new Array(1000).fill(-1);
    D.forEach(function (r, i) { last[+r.number] = i; });
    const n = D.length;
    return last.map(function (i) { return i < 0 ? n : n - 1 - i; });
  })();

  // ---------- 筛选逻辑 ----------
  const NUM = [];
  for (let i = 0; i < 1000; i++) NUM.push(('00' + i).slice(-3));

  function bigSmallRatio(num) {
    const big = (num[0] >= '5' ? 1 : 0) + (num[1] >= '5' ? 1 : 0) + (num[2] >= '5' ? 1 : 0);
    return big + ':' + (3 - big);
  }

  function oddEvenRatio(num) {
    const odd = (+num[0] % 2) + (+num[1] % 2) + (+num[2] % 2);
    return odd + ':' + (3 - odd);
  }

  function sumOf(num) { return +num[0] + +num[1] + +num[2]; }

  function spanOf(num) {
    const a = +num[0], b = +num[1], c = +num[2];
    return Math.max(a, b, c) - Math.min(a, b, c);
  }

  function hasAnyFilter() {
    return f.sumMin !== '' || f.sumMax !== '' || f.spanMin !== '' || f.spanMax !== ''
        || f.gapMin !== '' || f.gapMax !== ''
        || f.bs.size > 0 || f.oe.size > 0 || danSel.size > 0;
  }

  function passes(num) {
    if (f.sumMin !== '' && sumOf(num) < +f.sumMin) return false;
    if (f.sumMax !== '' && sumOf(num) > +f.sumMax) return false;
    if (f.spanMin !== '' && spanOf(num) < +f.spanMin) return false;
    if (f.spanMax !== '' && spanOf(num) > +f.spanMax) return false;
    if (f.bs.size && !f.bs.has(bigSmallRatio(num))) return false;
    if (f.oe.size && !f.oe.has(oddEvenRatio(num))) return false;
    if (danSel.size) {
      const ds = Array.from(danSel);
      for (let i = 0; i < ds.length; i++) {
        if (num.indexOf(String(ds[i])) < 0) return false;
      }
    }
    if (f.gapMin !== '' && GAP[+num] < +f.gapMin) return false;
    if (f.gapMax !== '' && GAP[+num] > +f.gapMax) return false;
    return true;
  }

  // ---------- 选号 ----------
  function recentNumbers() {
    const n = C.$('#pk-exclude-recent').checked ? 30 : 0;
    const s = new Set();
    C.sliceWindow(D, n).forEach(function (r) { s.add(r.number); });
    return s;
  }

  function posDigitsSelected() {
    return posSel[0].size + posSel[1].size + posSel[2].size;
  }

  // 直选基础池：按位选号的笛卡尔积；若未选数字但有筛选条件，则取全部 1000 种
  function baseDirect() {
    const digitsChosen = posDigitsSelected() > 0;
    if (!digitsChosen) {
      if (hasAnyFilter()) return NUM.slice();
      return [];
    }
    const out = [];
    posSel[0].forEach(function (a) {
      posSel[1].forEach(function (b) {
        posSel[2].forEach(function (c) { out.push('' + a + b + c); });
      });
    });
    return out;
  }

  function groupLists() {
    const ds = Array.from(grpSel).sort(function (a, b) { return a - b; });
    const g6 = [], g3 = [];
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        for (let k = j + 1; k < ds.length; k++) g6.push('' + ds[i] + ds[j] + ds[k]);
      }
    }
    for (let i = 0; i < ds.length; i++) {
      for (let j = 0; j < ds.length; j++) {
        if (i !== j) g3.push('' + ds[i] + ds[i] + ds[j]);
      }
    }
    return { g6: g6, g3: g3 };
  }

  function money(x) { return C.comma(Math.round(x)) + ' 元'; }

  // ---------- 界面构建 ----------
  // clearSet 传进来时，清空按钮会作为最后一个元素排在数字之后
  function digitPad(selected, onToggle, cls, clearSet) {
    const wrap = C.el('div', {
      style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:stretch'
    });
    for (let d = 0; d <= 9; d++) {
      const on = selected.has(d);
      wrap.appendChild(C.el('button', {
        class: (cls || 'digit-btn') + (on ? ' on' : ''),
        text: String(d),
        onclick: (function (digit) {
          return function () {
            if (selected.has(digit)) selected.delete(digit); else selected.add(digit);
            onToggle();
          };
        })(d)
      }));
    }
    if (clearSet) wrap.appendChild(clearButton(clearSet, clearSet.size));
    return wrap;
  }

  function numInput(key, ph, min, max) {
    return C.el('input', {
      type: 'number', value: f[key], placeholder: ph || '',
      min: String(min), max: String(max),
      oninput: function (e) {
        f[key] = e.target.value;
        refresh();
      }
    });
  }

  /* 一组的"一键清空"：比数字键大约一倍，暖橙色，空组时置灰 */
  function clearButton(set, count) {
    return C.el('button', {
      class: 'clear-btn',
      text: '✕ 清空',
      disabled: count === 0,
      onclick: function () {
        set.clear();
        refresh();
      }
    });
  }

  function ratioRow(values, set) {
    const row = C.el('div', { class: 'chip-row' });
    values.forEach(function (v) {
      row.appendChild(C.el('button', {
        class: 'chip-btn' + (set.has(v) ? ' on' : ''),
        text: v,
        onclick: function () {
          if (set.has(v)) set.delete(v); else set.add(v);
          refresh();
        }
      }));
    });
    return row;
  }

  function buildFilters() {
    const box = C.$('#pk-filters');
    C.clear(box);
    const grid = C.el('div', { class: 'filter-grid' });

    grid.appendChild(C.el('div', { class: 'filter-item' }, [
      C.el('span', { class: 'fl', text: '和值' }),
      numInput('sumMin', '最小', 0, 27),
      C.el('span', { class: 'sep', text: '~' }),
      numInput('sumMax', '最大', 0, 27)
    ]));

    grid.appendChild(C.el('div', { class: 'filter-item' }, [
      C.el('span', { class: 'fl', text: '跨度' }),
      numInput('spanMin', '最小', 0, 9),
      C.el('span', { class: 'sep', text: '~' }),
      numInput('spanMax', '最大', 0, 9)
    ]));

    grid.appendChild(C.el('div', { class: 'filter-item' }, [
      C.el('span', { class: 'fl', text: '号码遗漏' }),
      numInput('gapMin', '最小', 0, 9999),
      C.el('span', { class: 'sep', text: '~' }),
      numInput('gapMax', '最大', 0, 9999),
      C.el('span', { class: 'sep', text: '期' })
    ]));

    grid.appendChild(C.el('div', { class: 'filter-item' }, [
      C.el('span', { class: 'fl', text: '大小比' }),
      ratioRow(['3:0', '2:1', '1:2', '0:3'], f.bs)
    ]));

    grid.appendChild(C.el('div', { class: 'filter-item' }, [
      C.el('span', { class: 'fl', text: '奇偶比' }),
      ratioRow(['3:0', '2:1', '1:2', '0:3'], f.oe)
    ]));

    box.appendChild(grid);

    // 胆码也是"选数字"的分组，同样给一个一键清空
    box.appendChild(C.el('div', { class: 'filter-item', style: 'margin-top:14px' }, [
      C.el('span', { class: 'fl', text: '胆码' }),
      C.el('span', {
        style: 'color:var(--ink-3);font-size:12px',
        text: '（号码必须包含选中的每一个数字）'
      })
    ]));
    box.appendChild(digitPad(danSel, refresh, 'chip-btn', danSel));

    if (hasAnyFilter()) {
      box.appendChild(C.el('div', { style: 'margin-top:10px' }, [
        C.el('button', {
          class: 'btn ghost', text: '重置筛选',
          onclick: function () {
            f.sumMin = f.sumMax = f.spanMin = f.spanMax = f.gapMin = f.gapMax = '';
            f.bs.clear(); f.oe.clear(); danSel.clear();
            refresh();
          }
        })
      ]));
    }
  }

  function buildPads() {
    const posBox = C.$('#pk-pos');
    C.clear(posBox);
    for (let p = 0; p < 3; p++) {
      posBox.appendChild(C.el('div', { style: 'margin:10px 0' }, [
        C.el('div', {
          style: 'font-size:12.5px;color:var(--ink-2);margin-bottom:5px',
          text: POS_NAME[p] + '（已选 ' + posSel[p].size + ' 个）'
        }),
        digitPad(posSel[p], refresh, null, posSel[p])
      ]));
    }

    const grpBox = C.$('#pk-group');
    C.clear(grpBox);
    grpBox.appendChild(C.el('div', {
      style: 'font-size:12.5px;color:var(--ink-3);margin-bottom:5px',
      text: '选中若干数字（已选 ' + grpSel.size + ' 个），自动展开为组选六 / 组选三组合'
    }));
    grpBox.appendChild(digitPad(grpSel, refresh, null, grpSel));
  }

  function refresh() {
    buildPads();
    buildFilters();
    calc();
  }

  // ---------- 计算与结果 ----------
  function calc() {
    const pool = baseDirect();
    const recent = recentNumbers();
    const poolNoRecent = pool.filter(function (n) { return !recent.has(n); });
    const direct = poolNoRecent.filter(passes);

    const grp = groupLists();
    const g6 = grp.g6.filter(passes);
    const g3 = grp.g3.filter(passes);

    const nDirect = direct.length, n6 = g6.length, n3 = g3.length;
    const totalBets = nDirect + n6 + n3;
    const cost = totalBets * BET;
    const evDirect = nDirect * (1 / 1000) * PRIZE_DIRECT;
    const ev6 = n6 * (6 / 1000) * PRIZE_G6;
    const ev3 = n3 * (3 / 1000) * PRIZE_G3;
    const evTotal = evDirect + ev6 + ev3;

    const box = C.$('#pk-result');
    C.clear(box);

    // ---- 什么都没选：给出可执行引导 ----
    if (totalBets === 0 && !hasAnyFilter()) {
      const missing = [];
      for (let p = 0; p < 3; p++) if (posSel[p].size === 0) missing.push(POS_NAME[p]);
      const lines = [];
      if (missing.length === 3 && grpSel.size === 0) {
        lines.push('还没有选号。点上面的数字按钮开始选择。');
        lines.push('玩法一：直选需要在「第一位 / 第二位 / 第三位」各选至少 1 个数字。');
        lines.push('玩法二：组选只需在下方选出数字，自动展开为组选六 / 组选三。');
        lines.push('玩法三：不选数字，直接用「筛选条件」圈定范围（如和值 13~14）。');
      } else {
        if (missing.length) {
          lines.push('直选还缺：' + missing.join('、') +
                     '（三个位置各选至少 1 个数字才能组成号码）。');
        } else if (nDirect === 0) {
          const unfiltered = [];
          posSel[0].forEach(function (a) {
            posSel[1].forEach(function (b) {
              posSel[2].forEach(function (c) { unfiltered.push('' + a + b + c); });
            });
          });
          const names = unfiltered.slice(0, 20).join('、') +
                        (unfiltered.length > 20 ? ' …' : '');
          lines.push('所选号码 ' + names +
                     ' 全部落在「最近 30 期已开出」范围内，已被排除规则过滤掉。' +
                     '取消勾选即可包含它们。');
        }
        if (grpSel.size === 1) {
          lines.push('组选目前只选了 1 个数字，至少需要 2 个才能组合出号码。');
        }
      }
      const info = C.el('div', { class: 'note' });
      lines.forEach(function (t, i) {
        info.appendChild(C.el('div', { style: i ? 'margin-top:6px' : '', text: t }));
      });
      box.appendChild(info);
      return;
    }

    // ---- 结果统计 ----
    const stats = C.el('div', { class: 'stats' });
    function stat(k, v, sub) {
      stats.appendChild(C.el('div', { class: 'stat' }, [
        C.el('div', { class: 'k', text: k }),
        C.el('div', { class: 'v' }, [String(v), sub ? C.el('small', { text: ' ' + sub }) : null])
      ]));
    }
    stat('总注数', C.comma(totalBets), '注');
    stat('投注金额', money(cost));
    stat('直选覆盖概率', C.pct(nDirect / 1000, 3));
    stat('期望回收', money(evTotal));
    stat('期望回报率', C.pct(cost ? evTotal / cost : 0, 1));
    stat('长期期望净亏', money(evTotal - cost));
    box.appendChild(stats);

    // ---- 筛选了多少，必须自己交代清楚 ----
    const notes = [];
    if (poolNoRecent.length !== pool.length) {
      notes.push('「排除最近 30 期已开出」剔除了 ' + (pool.length - poolNoRecent.length) + ' 个号码。');
    }
    if (hasAnyFilter() && poolNoRecent.length !== nDirect) {
      notes.push('筛选条件从 ' + poolNoRecent.length + ' 个直选号码中保留了 ' +
                 nDirect + ' 个，剔除 ' + (poolNoRecent.length - nDirect) + ' 个。');
    }
    if (posDigitsSelected() === 0 && pool.length === 1000) {
      notes.push('未指定具体数字，基数是全部 1000 种组合，因此注数较大——' +
                 '请用筛选条件继续收窄。');
    }
    if (notes.length) {
      const nb = C.el('div', { class: 'note' });
      notes.forEach(function (t, i) {
        nb.appendChild(C.el('div', { style: i ? 'margin-top:5px' : '', text: t }));
      });
      box.appendChild(nb);
    }

    const detail = C.el('table', { style: 'margin-top:14px' });
    detail.appendChild(C.el('thead', {}, [C.el('tr', {}, [
      C.el('th', { text: '玩法' }),
      C.el('th', { text: '注数' }),
      C.el('th', { text: '金额' }),
      C.el('th', { text: '命中概率' }),
      C.el('th', { text: '单注奖金' }),
      C.el('th', { text: '期望回收' })
    ])]));
    const tb = C.el('tbody');
    [
      ['直选复式', nDirect, nDirect / 1000, PRIZE_DIRECT, evDirect],
      ['组选六（3 个不同数字）', n6, n6 * 6 / 1000, PRIZE_G6, ev6],
      ['组选三（2 个相同数字）', n3, n3 * 3 / 1000, PRIZE_G3, ev3]
    ].forEach(function (r) {
      tb.appendChild(C.el('tr', {}, [
        C.el('td', { text: r[0] }),
        C.el('td', { class: 'num', text: C.comma(r[1]) }),
        C.el('td', { class: 'num', text: money(r[1] * BET) }),
        C.el('td', { class: 'num', text: C.pct(r[2], 3) }),
        C.el('td', { class: 'num', text: money(r[3]) }),
        C.el('td', { class: 'num', text: money(r[4]) })
      ]));
    });
    detail.appendChild(tb);
    box.appendChild(C.tableScroll(detail));

    // ---- 覆盖号码：全部列出（上限 200，超过则标注剩余数量）----
    const CAP = 200;
    const all = direct.concat(g6, g3);
    box.appendChild(C.el('h3', {
      text: '覆盖号码（共 ' + all.length + ' 个' +
            (all.length > CAP ? '，下列前 ' + CAP + ' 个' : '') + '）'
    }));
    const list = C.el('div', { class: 'num-list' });
    all.slice(0, CAP).forEach(function (x) {
      list.appendChild(C.el('span', { class: 'num-chip', text: x }));
    });
    if (all.length > CAP) {
      list.appendChild(C.el('span', {
        class: 'num-chip more', text: '还有 ' + (all.length - CAP) + ' 个'
      }));
    }
    box.appendChild(list);

    // ---- 核心：把"过滤不等于省钱"讲明白 ----
    // 只有真的剔除了号码才说"缩小范围"，否则会出现"从 18 注缩到 18 注"这种废话
    const narrowed = poolNoRecent.length > nDirect;
    const removedByFilter = poolNoRecent.length - nDirect;
    box.appendChild(C.el('div', { class: 'note warn' }, [
      C.el('div', {
        html: '<b>筛选不会提高回报率，也不会让你"省钱"。</b>' +
              (narrowed
                ? '筛选只是把投注范围从 ' + poolNoRecent.length + ' 注缩到 ' + nDirect +
                  ' 注（剔除 ' + removedByFilter + ' 注）：花费按比例减少，' +
                  '<b>中奖概率也按同样的比例减少</b>，两者相抵。'
                : '当前筛选条件没有剔除任何号码。无论范围多大，' +
                  '花费与中奖概率都按同比例变化，两者相抵。')
      }),
      C.el('div', {
        style: 'margin-top:6px',
        html: '直选奖金 1040 元 ÷（2 元 × 1000 种组合）= <b>52%</b>，' +
              '这是彩票规则决定的，与你选多少注、怎么筛都无关。' +
              '上面「期望回报率」恒为 52%，「长期期望净亏」恒为负——' +
              '少买只是少亏，不是不亏。'
      })
    ]));
  }

  function render() {
    if (!wired) {
      wired = true;
      C.$('#pk-clear').addEventListener('click', function () {
        posSel.forEach(function (s) { s.clear(); });
        grpSel.clear();
        danSel.clear();
        f.sumMin = f.sumMax = f.spanMin = f.spanMax = f.gapMin = f.gapMax = '';
        f.bs.clear(); f.oe.clear();
        refresh();
      });
      C.$('#pk-exclude-recent').addEventListener('change', calc);
      C.$('#pk-calc').addEventListener('click', calc);
    }
    refresh();
  }

  window.PICKER = {
    render: render,
    _state: { posSel: posSel, grpSel: grpSel, danSel: danSel, filters: f },
    _passes: passes
  };
})();
