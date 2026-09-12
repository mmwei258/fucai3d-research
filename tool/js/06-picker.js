/* ================= 选号器 ================= */
(function () {
  'use strict';
  const C = window.CORE;
  const POS_NAME = ['第一位', '第二位', '第三位'];

  // 福彩3D 直选固定奖金 1040 元 / 注，每注 2 元
  const BET = 2, PRIZE_DIRECT = 1040, PRIZE_G6 = 173, PRIZE_G3 = 346;

  const posSel = [new Set(), new Set(), new Set()];
  const grpSel = new Set();
  let wired = false;

  function digitPad(selected, onToggle) {
    const wrap = C.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
    for (let d = 0; d <= 9; d++) {
      const on = selected.has(d);
      wrap.appendChild(C.el('button', {
        class: 'digit-btn' + (on ? ' on' : ''),
        text: String(d),
        onclick: (function (digit) {
          return function () {
            if (selected.has(digit)) selected.delete(digit); else selected.add(digit);
            onToggle();
          };
        })(d)
      }));
    }
    return wrap;
  }

  function recentNumbers() {
    const n = C.$('#pk-exclude-recent').checked ? 30 : 0;
    const s = new Set();
    C.sliceWindow(C.DRAWS, n).forEach(function (r) { s.add(r.number); });
    return s;
  }

  function directList() {
    const recent = recentNumbers();
    const out = [];
    posSel[0].forEach(function (a) {
      posSel[1].forEach(function (b) {
        posSel[2].forEach(function (c) {
          const num = '' + a + b + c;
          if (!recent.has(num)) out.push(num);
        });
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

  // 重建按钮区，保证点击后立即看到选中态
  function buildPads() {
    const posBox = C.$('#pk-pos');
    C.clear(posBox);
    for (let p = 0; p < 3; p++) {
      posBox.appendChild(C.el('div', { style: 'margin:8px 0' }, [
        C.el('div', {
          style: 'font-size:12.5px;color:var(--ink-2);margin-bottom:5px',
          text: POS_NAME[p] + '（已选 ' + posSel[p].size + ' 个）'
        }),
        digitPad(posSel[p], refresh)
      ]));
    }

    const grpBox = C.$('#pk-group');
    C.clear(grpBox);
    grpBox.appendChild(C.el('div', {
      style: 'font-size:12.5px;color:var(--ink-3);margin-bottom:5px',
      text: '选中若干数字（已选 ' + grpSel.size + ' 个），自动展开为组选六 / 组选三组合'
    }));
    grpBox.appendChild(digitPad(grpSel, refresh));
  }

  function refresh() {
    buildPads();
    calc();
  }

  function calc() {
    const direct = directList();
    const grp = groupLists();
    const nDirect = direct.length;
    const n6 = grp.g6.length, n3 = grp.g3.length;
    const totalBets = nDirect + n6 + n3;
    const cost = totalBets * BET;

    const evDirect = nDirect * (1 / 1000) * PRIZE_DIRECT;
    const ev6 = n6 * (6 / 1000) * PRIZE_G6;
    const ev3 = n3 * (3 / 1000) * PRIZE_G3;
    const evTotal = evDirect + ev6 + ev3;

    const box = C.$('#pk-result');
    C.clear(box);

    // ---- 未产生任何有效注数：给出可执行的引导，而不是一片空白 ----
    if (totalBets === 0) {
      const missing = [];
      for (let p = 0; p < 3; p++) if (posSel[p].size === 0) missing.push(POS_NAME[p]);
      const lines = [];
      if (missing.length === 3 && grpSel.size === 0) {
        lines.push('还没有选号。点上面的数字按钮开始选择。');
        lines.push('玩法一：直选需要在「第一位 / 第二位 / 第三位」各选至少 1 个数字。');
        lines.push('玩法二：组选只需在下方选出数字，自动展开为组选六 / 组选三。');
      } else {
        if (missing.length) {
          lines.push('直选还缺：' + missing.join('、') +
                     '（三个位置各选至少 1 个数字才能组成号码）。');
        } else if (nDirect === 0) {
          // 点名被过滤掉的具体号码，避免用户对着空白猜原因
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
        info.appendChild(C.el('div', {
          style: i ? 'margin-top:6px' : '',
          text: t
        }));
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

    // ---- 排除规则的实际影响必须明示，否则用户不知道为什么少了几注 ----
    const fullProduct = posSel[0].size * posSel[1].size * posSel[2].size;
    const excluded = fullProduct - nDirect;
    if (posSel[0].size && posSel[1].size && posSel[2].size && excluded > 0) {
      const recent = recentNumbers();
      const dropped = [];
      posSel[0].forEach(function (a) {
        posSel[1].forEach(function (b) {
          posSel[2].forEach(function (c) {
            const num = '' + a + b + c;
            if (recent.has(num)) dropped.push(num);
          });
        });
      });
      box.appendChild(C.el('div', { class: 'note' }, [
        C.el('div', {
          html: '直选理论组合 <b>' + fullProduct + '</b> 注，按「排除最近 30 期已开出」规则' +
                '剔除 <b>' + excluded + '</b> 注，实际 <b>' + nDirect + '</b> 注。'
        }),
        C.el('div', {
          style: 'margin-top:5px',
          text: '被剔除：' + dropped.slice(0, 20).join('、') +
                (dropped.length > 20 ? ' …' : '') +
                '（取消勾选即可包含它们）'
        })
      ]));
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

    const all = direct.concat(grp.g6, grp.g3);
    box.appendChild(C.el('h3', { text: '覆盖号码（前 60 个，共 ' + all.length + ' 个）' }));
    const preview = C.el('div', {
      style: 'display:flex;flex-wrap:wrap;gap:6px'
    });
    all.slice(0, 60).forEach(function (x) {
      preview.appendChild(C.el('span', { class: 'tag gray', text: x }));
    });
    if (all.length > 60) preview.appendChild(C.el('span', { text: '…' }));
    box.appendChild(preview);

    box.appendChild(C.el('div', { class: 'note warn' }, [
      C.el('div', {
        html: '<b>请注意这个数字：无论你买 1 注还是 1000 注，期望回报率恒为 52%。</b>' +
              '因为直选奖金 1040 元 ÷（2 元 × 1000 种组合）= 52%。' +
              '覆盖面越广，中奖概率越高，但投入同比例上升——期望值不变。' +
              '上面的「长期期望净亏」为负，是规则决定的，与选号方式无关。'
      })
    ]));
  }

  function render() {
    if (!wired) {
      wired = true;
      C.$('#pk-clear').addEventListener('click', function () {
        posSel.forEach(function (s) { s.clear(); });
        grpSel.clear();
        refresh();
      });
      C.$('#pk-exclude-recent').addEventListener('change', calc);
      C.$('#pk-calc').addEventListener('click', calc);
    }
    refresh();
  }

  window.PICKER = { render: render, _state: { posSel: posSel, grpSel: grpSel } };
})();
