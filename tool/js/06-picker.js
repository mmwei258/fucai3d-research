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
  /* 胆码规则：
     'all' —— 号码必须同时包含选中的每一个数字（传统"胆码"的口径）
     'any' —— 号码至少包含选中数字中的任意一个
     三位号码最多只能容纳 3 个不同数字，所以选到第 4 个时 'all' 必然 0 注。
     届时代码会自动切到 'any' 并说明原因，绝不静默给出 0 注。 */
  let danMode = 'all';
  let danAutoSwitched = false;
  const f = {
    sumMin: '', sumMax: '', spanMin: '', spanMax: '', gapMin: '', gapMax: '',
    bs: new Set(), oe: new Set()
  };
  let wired = false;

  /* 六个筛选输入框的取值范围。规则：
     - 只能输整数，非数字字符在输入时直接挡掉；
     - 越界的值【不参与筛选】（宁可不筛，也不能悄悄算出 0 注），输入框标红并写明范围；
     - 离开输入框时把越界值收进最近的合法值。
     和值上限 27、跨度上限 9 都是三位数的数学极值；遗漏上限 9999 只是防呆。 */
  const FIELD = {
    sumMin:  { group: 'sum',  min: 0, max: 27,   ph: '最小' },
    sumMax:  { group: 'sum',  min: 0, max: 27,   ph: '最大' },
    spanMin: { group: 'span', min: 0, max: 9,    ph: '最小' },
    spanMax: { group: 'span', min: 0, max: 9,    ph: '最大' },
    gapMin:  { group: 'gap',  min: 0, max: 9999, ph: '最小' },
    gapMax:  { group: 'gap',  min: 0, max: 9999, ph: '最大' }
  };
  const GROUP = {
    sum:  { name: '和值',     range: '0~27',   maxLen: 2 },
    span: { name: '跨度',     range: '0~9',    maxLen: 2 },
    gap:  { name: '号码遗漏', range: '0~9999', maxLen: 4 }
  };

  // 当前生效的区间：null = 这条筛选不生效（空着或填了非法值）。每次 calc() 前重算。
  const LIM = { sumMin: null, sumMax: null, spanMin: null, spanMax: null,
                gapMin: null, gapMax: null };
  function computeLimits() {
    Object.keys(FIELD).forEach(function (k) { LIM[k] = fieldVal(k); });
  }

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
    return LIM.sumMin !== null || LIM.sumMax !== null
        || LIM.spanMin !== null || LIM.spanMax !== null
        || LIM.gapMin !== null || LIM.gapMax !== null
        || f.bs.size > 0 || f.oe.size > 0 || danSel.size > 0;
  }

  // ---------- 筛选输入框的取值范围校验 ----------
  function fieldNum(key) {
    const s = String(f[key] === null || f[key] === undefined ? '' : f[key]).trim();
    if (s === '') return null;              // 空 = 不用这条筛选
    if (!/^\d+$/.test(s)) return NaN;       // 兜底：理论上输入阶段已挡掉
    return +s;
  }

  function fieldOut(key) {                  // 越界（或是非整数）
    const v = fieldNum(key);
    if (v === null) return false;
    return isNaN(v) || v < FIELD[key].min || v > FIELD[key].max;
  }

  function fieldVal(key) {                  // 只有合法值才参与筛选
    return fieldOut(key) ? null : fieldNum(key);
  }

  function groupKeys(group) {
    return Object.keys(FIELD).filter(function (k) { return FIELD[k].group === group; });
  }

  function groupInverted(group) {           // 最小值 > 最大值：区间为空
    const ks = groupKeys(group);
    const a = fieldVal(ks[0]), b = fieldVal(ks[1]);
    return a !== null && b !== null && a > b;
  }

  function groupMsg(group) {                // 该行要显示的问题（红=不参与筛选，橙=区间为空）
    const ks = groupKeys(group).filter(fieldOut);
    if (ks.length) {
      return { level: 'bad',
        text: GROUP[group].name + '只接受 ' + GROUP[group].range + ' 的整数（当前 ' +
              ks.map(function (k) { return f[k]; }).join(' / ') + ' 无效，已忽略）' };
    }
    if (groupInverted(group)) {
      return { level: 'amber',
        text: GROUP[group].name + '的「最小」大于「最大」，这个区间里没有任何数字' };
    }
    return null;
  }

  // 所有不合法的输入，用来在结果区交代"为什么这个值没生效"
  function badInputs() {
    return Object.keys(FIELD).filter(fieldOut).map(function (k) {
      const g = GROUP[FIELD[k].group];
      return g.name + '「' + f[k] + '」（只接受 ' + g.range + '）';
    });
  }

  function invertedInputs() {
    return Object.keys(GROUP).filter(groupInverted).map(function (gr) {
      return GROUP[gr].name;
    });
  }

  function markField(key, el) {
    if (el) el.className = fieldOut(key) ? 'bad' : '';
    const msg = C.$('#pk-err-' + FIELD[key].group);
    if (!msg) return;
    const m = groupMsg(FIELD[key].group);
    msg.className = 'bad-msg' + (m ? (m.level === 'amber' ? ' amber' : '') : ' hidden');
    msg.textContent = m ? m.text : '';
  }

  // 选中的胆码个数已经超过三位号码能容纳的不同数字上限
  function danOverflow() { return danMode === 'all' && danSel.size > 3; }

  function includeDigit(num, d) { return num.indexOf(String(d)) >= 0; }

  function passes(num) {
    if (LIM.sumMin !== null && sumOf(num) < LIM.sumMin) return false;
    if (LIM.sumMax !== null && sumOf(num) > LIM.sumMax) return false;
    if (LIM.spanMin !== null && spanOf(num) < LIM.spanMin) return false;
    if (LIM.spanMax !== null && spanOf(num) > LIM.spanMax) return false;
    if (f.bs.size && !f.bs.has(bigSmallRatio(num))) return false;
    if (f.oe.size && !f.oe.has(oddEvenRatio(num))) return false;
    if (danSel.size) {
      const ds = Array.from(danSel);
      let hit = 0;
      for (let i = 0; i < ds.length; i++) {
        if (includeDigit(num, ds[i])) hit++;
      }
      if (danMode === 'all' ? hit < ds.length : hit === 0) return false;
    }
    if (LIM.gapMin !== null && GAP[+num] < LIM.gapMin) return false;
    if (LIM.gapMax !== null && GAP[+num] > LIM.gapMax) return false;
    return true;
  }

  // ---------- 选号 ----------
  // 排除窗口：0 = 不排除，其余 = 排除最近 N 期开出过的号码（去重后可能少于 N）
  const EXCL_OPTIONS = [0, 30, 50, 100, 150, 200];
  function exclWindow() {
    const el = C.$('#pk-exclude-window');
    const v = el ? +el.value : 30;
    return EXCL_OPTIONS.indexOf(v) >= 0 ? v : 30;
  }

  function recentNumbers(n) {
    const s = new Set();
    if (!n) return s;
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

  /* 只收整数：type=text + inputmode=numeric —— 既能用数字键盘，
     又能在输入阶段就把非数字字符挡掉（type=number 做不到这件事） */
  function numInput(key) {
    const spec = FIELD[key], g = GROUP[spec.group];
    return C.el('input', {
      type: 'text', inputmode: 'numeric', autocomplete: 'off',
      id: 'pk-f-' + key, value: f[key], placeholder: spec.ph,
      maxlength: String(g.maxLen),
      title: g.name + '只能是 ' + g.range + ' 的整数',
      class: fieldOut(key) ? 'bad' : '',
      oninput: function (e) {
        const digits = String(e.target.value).replace(/[^\d]/g, '');
        if (digits !== e.target.value) e.target.value = digits;
        f[key] = digits;
        /* 只更新结果，绝不重建筛选区：
           曾经这里调 refresh() → buildFilters() 把输入框整个换掉，
           用户敲下第一个字符就失焦。 */
        markField(key, e.target);
        updateResetBtn();
        calc();
      },
      onblur: function (e) {
        const v = fieldNum(key);
        if (v === null || isNaN(v)) {
          f[key] = '';
        } else {
          // 越界就收进最近的合法值；顺便把前导 0 去掉
          f[key] = String(Math.min(Math.max(v, spec.min), spec.max));
        }
        e.target.value = f[key];
        markField(key, e.target);
        updateResetBtn();
        calc();
      }
    });
  }

  /* 胆码开关：选到第 4 个时"必须全含"数学上不可能，自动切到"至少含一个"并说明 */
  function danToggle() {
    if (danMode === 'all' && danSel.size > 3) {
      danMode = 'any';
      danAutoSwitched = true;
    }
    refresh();
  }

  function setDanMode(mode) {
    danMode = mode;
    danAutoSwitched = false;
    refresh();
  }

  function danModeSwitch() {
    const seg = C.el('div', { class: 'seg' });
    [['all', '必须全含'], ['any', '至少含一个']].forEach(function (m) {
      seg.appendChild(C.el('button', {
        class: 'chip-btn' + (danMode === m[0] ? ' on' : ''),
        text: m[1],
        title: m[0] === 'all'
          ? '号码必须同时包含选中的每一个数字'
          : '号码至少包含选中数字中的任意一个',
        onclick: function () { setDanMode(m[0]); }
      }));
    });
    return seg;
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

    // 一行两个输入框 + 允许范围 + 出错提示（提示常驻 DOM，只切换显隐，避免重建）
    function rangeRow(group) {
      const g = GROUP[group], ks = groupKeys(group);
      const item = C.el('div', { class: 'filter-item' }, [
        C.el('span', { class: 'fl', text: g.name }),
        numInput(ks[0]),
        C.el('span', { class: 'sep', text: '~' }),
        numInput(ks[1]),
        C.el('span', { class: 'sep', text: g.range + (group === 'gap' ? ' 期' : '') })
      ]);
      const m = groupMsg(group);
      item.appendChild(C.el('span', {
        id: 'pk-err-' + group,
        class: 'bad-msg' + (m ? (m.level === 'amber' ? ' amber' : '') : ' hidden'),
        text: m ? m.text : ''
      }));
      return item;
    }

    grid.appendChild(rangeRow('sum'));
    grid.appendChild(rangeRow('span'));
    grid.appendChild(rangeRow('gap'));

    grid.appendChild(C.el('div', { class: 'filter-item' }, [
      C.el('span', { class: 'fl', text: '大小比' }),
      ratioRow(['3:0', '2:1', '1:2', '0:3'], f.bs)
    ]));

    grid.appendChild(C.el('div', { class: 'filter-item' }, [
      C.el('span', { class: 'fl', text: '奇偶比' }),
      ratioRow(['3:0', '2:1', '1:2', '0:3'], f.oe)
    ]));

    box.appendChild(grid);

    // 胆码也是"选数字"的分组，同样给一个一键清空；
    // 规则必须摆在明面上——否则"选了 4 个胆码却出 0 注"看起来像坏了
    grid.appendChild(C.el('div', { class: 'filter-item' }, [
      C.el('span', { class: 'fl', text: '胆码' }),
      danModeSwitch()
    ]));

    box.appendChild(C.el('div', {
      class: 'hint',
      style: 'margin:14px 0 6px',
      text: '胆码规则：' + (danMode === 'all'
        ? '号码必须同时包含选中的每一个数字。'
        : '号码至少包含选中数字中的任意一个。')
    }));
    box.appendChild(digitPad(danSel, danToggle, 'chip-btn', danSel));

    if (danOverflow()) {
      box.appendChild(C.el('div', { class: 'note warn', style: 'margin-top:10px' }, [
        C.el('div', {
          html: '<b>已选 ' + danSel.size + ' 个胆码，「必须全含」不可能成立：</b>' +
                '三位号码最多只能包含 3 个不同数字，所以当前必然是 0 注。' +
                '把规则切成「至少含一个」就能出号。'
        })
      ]));
    } else if (danAutoSwitched && danSel.size > 3) {
      box.appendChild(C.el('div', { class: 'note', style: 'margin-top:10px' }, [
        C.el('div', {
          html: '选到第 4 个胆码时已自动切换为「至少含一个」——三位号码最多容纳 ' +
                '3 个不同数字，「必须全含」必然是 0 注。可随时切回。'
        })
      ]));
    }

    // 重置按钮常驻 DOM、只切换显隐：否则"第一次输入筛选值"也要重建筛选区
    box.appendChild(C.el('div', {
      id: 'pk-reset-wrap',
      class: hasAnyFilter() ? '' : 'hidden',
      style: 'margin-top:10px'
    }, [
      C.el('button', {
        class: 'btn ghost', text: '重置筛选',
        onclick: function () {
          f.sumMin = f.sumMax = f.spanMin = f.spanMax = f.gapMin = f.gapMax = '';
          f.bs.clear(); f.oe.clear(); danSel.clear();
          danMode = 'all'; danAutoSwitched = false;
          refresh();
        }
      })
    ]));
  }

  function updateResetBtn() {
    const w = C.$('#pk-reset-wrap');
    if (w) w.className = hasAnyFilter() ? '' : 'hidden';
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
    computeLimits();          // 重建前先让区间生效状态与输入框一致
    buildPads();
    buildFilters();
    calc();
  }

  // ---------- 计算与结果 ----------
  function calc() {
    computeLimits();          // 先把输入框里的值过一遍范围校验，越界的一律不参与筛选
    const pool = baseDirect();
    const exclN = exclWindow();
    const recent = recentNumbers(exclN);
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
      const badNow = badInputs();
      if (badNow.length) {
        lines.push('筛选条件里有不合法的数值：' + badNow.join('、') +
                   '——这些值已被忽略，没有参与筛选。');
      }
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
                     ' 全部落在「最近 ' + exclWindow() + ' 期已开出」范围内，' +
                     '已被排除规则过滤掉。把上面的排除窗口改小、或选「不排除」即可包含它们。');
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
      notes.push('「排除最近 ' + exclN + ' 期已开出」剔除了 ' +
                 (pool.length - poolNoRecent.length) + ' 个号码' +
                 '（这 ' + exclN + ' 期共开出 ' + recent.size + ' 个不同的号码，' +
                 '占全部 1000 个直选组合的 ' + C.pct(recent.size / 1000, 1) + '）。' +
                 '被排掉的号码下期再出的概率和其它号码一样，' +
                 '所以这只是主动少覆盖这些组合，不会让剩下的号码更容易中。');
    }
    if (hasAnyFilter() && poolNoRecent.length !== nDirect) {
      notes.push('筛选条件从 ' + poolNoRecent.length + ' 个直选号码中保留了 ' +
                 nDirect + ' 个，剔除 ' + (poolNoRecent.length - nDirect) + ' 个。');
    }
    if (danOverflow()) {
      notes.push('胆码选了 ' + danSel.size + ' 个、规则为「必须全含」：三位号码最多含 3 个' +
                 '不同数字，因此 0 注是规则本身的必然结果，不是程序出错。' +
                 '把胆码规则切成「至少含一个」即可出号。');
    }
    const badNow = badInputs();
    if (badNow.length) {
      notes.push('筛选条件里有不合法的数值：' + badNow.join('、') +
                 '——这些值已被忽略，没有参与筛选。');
    }
    const invNow = invertedInputs();
    if (invNow.length) {
      notes.push(invNow.join('、') + ' 的「最小」大于「最大」，这个区间里没有任何数字，' +
                 '所以 0 注来自区间本身是空的——把两个值对调即可。');
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
    if (cost === 0) {
      // 0 注时上面显示的是 0 元 / 0.0%，此时再说"期望回报率恒为 52%"就自相矛盾了
      box.appendChild(C.el('div', { class: 'note warn' }, [
        C.el('div', {
          html: '<b>当前是 0 注：没有任何号码落在你设定的条件里，所以不产生投注，' +
                '也没有可谈的中奖概率。</b>这不是"省钱"，只是这组条件圈不出号码。' +
                '条件放宽后，注数、花费、中奖概率会一起变大——' +
                '而回报率仍由彩票规则决定（直选 52%），与选多选少无关。'
        })
      ]));
      return;
    }
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
        danMode = 'all'; danAutoSwitched = false;
        f.sumMin = f.sumMax = f.spanMin = f.spanMax = f.gapMin = f.gapMax = '';
        f.bs.clear(); f.oe.clear();
        refresh();
      });
      C.$('#pk-exclude-window').addEventListener('change', calc);
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
