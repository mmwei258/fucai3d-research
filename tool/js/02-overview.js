/* ================= 概览 ================= */
(function () {
  'use strict';
  const C = window.CORE;
  const D = C.DRAWS, T = C.THEORY;
  let done = false;

  function stat(k, v, sub) {
    return C.el('div', { class: 'stat' }, [
      C.el('div', { class: 'k', text: k }),
      C.el('div', { class: 'v' }, [
        String(v),
        sub ? C.el('small', { text: ' ' + sub }) : null
      ])
    ]);
  }

  function render() {
    if (done) return;
    done = true;

    const first = D[0], last = D[D.length - 1];
    C.$('#ov-range').textContent =
      '共 ' + C.comma(D.length) + ' 期，' + first.date + ' ~ ' + last.date +
      '（第 ' + first.issue + ' ~ ' + last.issue + ' 期）';

    // 时间跨度（天）
    const days = Math.round((new Date(last.date) - new Date(first.date)) / 86400000) + 1;

    C.clear(C.$('#ov-stats'));
    const wrap = C.$('#ov-stats');
    wrap.appendChild(stat('历史记录数', C.comma(D.length), '期'));
    wrap.appendChild(stat('时间跨度', C.comma(days), '天'));
    wrap.appendChild(stat('最新一期', last.issue));
    wrap.appendChild(stat('最新开奖', last.number + '（' + last.date + '）'));

    C.$('#ov-note').innerHTML =
      '数据来自中国福彩网官方接口，本页所有统计均可由原始数据复算核验。' +
      '记录数少于时间跨度天数，是因为每年春节、国庆休市以及 2020 年疫情期间停售。';

    // 最近 10 期
    const tbody = C.$('#ov-latest');
    C.clear(tbody);
    D.slice(-10).reverse().forEach(function (r) {
      tbody.appendChild(C.el('tr', {}, [
        C.el('td', { text: r.issue }),
        C.el('td', { text: r.date }),
        C.el('td', { class: 'num', text: r.d.join(' ') }),
        C.el('td', { class: 'num', text: String(r.sum) }),
        C.el('td', { class: 'num', text: String(r.span) }),
        C.el('td', { text: r.type })
      ]));
    });

    // 结构分布：实际 vs 理论
    const total = D.length;
    const typeCount = { '豹子': 0, '组三': 0, '组六': 0 };
    const sumTop3Hit = {}, spanTop3Hit = {};
    T.sumTop3.forEach(function (s) { sumTop3Hit[s] = 0; });
    T.spanTop3.forEach(function (s) { spanTop3Hit[s] = 0; });
    D.forEach(function (r) {
      typeCount[r.type]++;
      if (sumTop3Hit[r.sum] !== undefined) sumTop3Hit[r.sum]++;
      if (spanTop3Hit[r.span] !== undefined) spanTop3Hit[r.span]++;
    });
    const sumTop3 = Object.keys(sumTop3Hit).reduce(function (s, k) { return s + sumTop3Hit[k]; }, 0);
    const spanTop3 = Object.keys(spanTop3Hit).reduce(function (s, k) { return s + spanTop3Hit[k]; }, 0);
    const typeTop = Math.max(typeCount['豹子'], typeCount['组三'], typeCount['组六']);
    const typeTopName = typeCount['组六'] >= typeCount['组三'] && typeCount['组六'] >= typeCount['豹子']
      ? '组六' : (typeCount['组三'] >= typeCount['豹子'] ? '组三' : '豹子');

    const rows = [
      ['组六 出现占比', typeCount['组六'] / total, T.type['组六'] / 1000],
      ['组三 出现占比', typeCount['组三'] / total, T.type['组三'] / 1000],
      ['豹子 出现占比', typeCount['豹子'] / total, T.type['豹子'] / 1000],
      ['和值 Top3(' + T.sumTop3.join('/') + ') 命中', sumTop3 / total, T.sumTop3Rate],
      ['跨度 Top3(' + T.spanTop3.join('/') + ') 命中', spanTop3 / total, T.spanTop3Rate],
      ['最常见组态(' + typeTopName + ') 命中', typeTop / total, T.typeTop1Rate]
    ];

    const st = C.$('#ov-struct');
    C.clear(st);
    rows.forEach(function (r) {
      st.appendChild(C.el('tr', {}, [
        C.el('td', { text: r[0] }),
        C.el('td', { class: 'num', text: C.pct(r[1]) }),
        C.el('td', { class: 'num', text: C.pct(r[2]) })
      ]));
    });
  }

  window.OV = { render: render };
})();
