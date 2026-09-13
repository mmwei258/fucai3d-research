"""排除最近 N 期已开出号码：回测验证。

问题：选号器的「排除最近 30 期已开出」能不能扩展到 100 / 150 期？扩展了会怎样？

做法与站点 js/07-backtest.js 完全同口径：
  - 5 种策略（纯随机 / 热号 / 冷号 / 遗漏值 / 马尔可夫）各自对 000~999 打一个分
  - 样本外 500 期逐期走（walk-forward，只用当期之前的数据）
  - 对照组：直接取 Top-K；实验组：先从排名里剔除最近 N 期开出过的号码，再取 Top-K
  - 同时统计"被排除的集合自己有多大概率开出下期号码"，也就是排除窗口的真实代价

数值全部由本脚本算出，可复算：
    python exclude_window_backtest.py
"""

import json
import math
import os
import random
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))

TEST_PERIODS = 500
FREQ_WINDOW = 360
KS = [1, 5, 10, 20, 50]
EXCL = [0, 30, 50, 100, 150, 200, 300]
RANDOM_TRIALS = 30


# ---------- 载入数据 ----------
def find_dataset():
    """仓库内的官方数据集优先；本地开发目录里的 data.js 也能用。"""
    candidates = [
        os.path.join(HERE, '..', 'data', 'all', 'history_official_all_features.json'),
        os.path.join(HERE, 'scripts', '..', 'data', 'all', 'history_official_all_features.json'),
        os.path.join(HERE, 'mvp', 'data.js'),
        os.path.join(HERE, '..', '..', 'work', 'mvp', 'data.js'),
    ]
    for p in candidates:
        if os.path.exists(p):
            return os.path.abspath(p)
    raise SystemExit('找不到数据集（data/all/history_official_all_features.json 或 mvp/data.js）')


def load_draws():
    path = find_dataset()
    if path.endswith('.js'):
        src = open(path, encoding='utf-8').read()
        arr = json.loads(src[src.index('['):src.rindex(']') + 1])
        out = [{'issue': r[0], 'date': r[1], 'number': r[2],
                'd': [int(c) for c in r[2]]} for r in arr]
    else:
        rows = json.load(open(path, encoding='utf-8'))
        out = [{'issue': r['issue'], 'date': r['date'], 'number': str(r['number']),
                'd': list(r['digits'])} for r in rows]
    print(f'数据集：{path}')
    return out


def mulberry32(a):
    """与站点 js/07-backtest.js 相同的确定性伪随机，保证同一期可复现。"""
    state = a & 0xFFFFFFFF

    def rnd():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rnd


def tie_keys(idx):
    rnd = mulberry32((idx * 104729 + 7) & 0xFFFFFFFF)
    return [rnd() for _ in range(1000)]


def top_by_score(scores, idx, n=1000):
    keys = tie_keys(idx)
    order = sorted(range(1000), key=lambda i: (-scores[i], keys[i]))
    return order[:n]


# ---------- 五种策略：返回 000~999 的完整排名 ----------
def rank_random(idx, trial=0):
    rnd = random.Random(idx * 7919 + trial * 104729 + 13)
    out = list(range(1000))
    rnd.shuffle(out)
    return out


def rank_frequency(draws, idx, mode):
    start = max(0, idx - FREQ_WINDOW)
    freq = [[0] * 10 for _ in range(3)]
    for j in range(start, idx):
        d = draws[j]['d']
        for p in range(3):
            freq[p][d[p]] += 1
    lg = [[0.0] * 10 for _ in range(3)]
    for p in range(3):
        for d in range(10):
            v = math.log(freq[p][d] + 1)
            lg[p][d] = v if mode == 'hot' else -v
    scores = [0.0] * 1000
    for i in range(1000):
        a, b, c = i // 100, i // 10 % 10, i % 10
        scores[i] = lg[0][a] + lg[1][b] + lg[2][c]
    return top_by_score(scores, idx)


def rank_gap(draws, idx):
    last = [[-1] * 10 for _ in range(3)]
    for j in range(idx):
        d = draws[j]['d']
        for p in range(3):
            last[p][d[p]] = j
    g = [[0.0] * 10 for _ in range(3)]
    for p in range(3):
        for d in range(10):
            g[p][d] = idx + 1 if last[p][d] < 0 else idx - last[p][d]
    scores = [0.0] * 1000
    for i in range(1000):
        a, b, c = i // 100, i // 10 % 10, i % 10
        scores[i] = g[0][a] + g[1][b] + g[2][c]
    return top_by_score(scores, idx)


def rank_markov(draws, idx):
    tr = [[[1.0] * 10 for _ in range(10)] for _ in range(3)]
    for j in range(1, idx):
        a, b = draws[j - 1]['d'], draws[j]['d']
        for p in range(3):
            tr[p][a[p]][b[p]] += 1.0
    prev = draws[idx - 1]['d']
    lg = [[0.0] * 10 for _ in range(3)]
    for p in range(3):
        row = tr[p][prev[p]]
        tot = sum(row)
        for d in range(10):
            lg[p][d] = math.log(row[d] / tot)
    scores = [0.0] * 1000
    for i in range(1000):
        a, b, c = i // 100, i // 10 % 10, i % 10
        scores[i] = lg[0][a] + lg[1][b] + lg[2][c]
    return top_by_score(scores, idx)


STRATEGIES = ['纯随机', '热号优先', '冷号优先', '遗漏值法', '马尔可夫链']


def rank_for(name, draws, idx, trial=0):
    if name == '纯随机':
        return rank_random(idx, trial)
    if name == '热号优先':
        return rank_frequency(draws, idx, 'hot')
    if name == '冷号优先':
        return rank_frequency(draws, idx, 'cold')
    if name == '遗漏值法':
        return rank_gap(draws, idx)
    if name == '马尔可夫链':
        return rank_markov(draws, idx)
    raise ValueError(name)


# ---------- 排除窗口 ----------
def excluded_set(draws, idx, n):
    """当期之前最近 n 期开出过的号码（去重）。"""
    s = set()
    for j in range(max(0, idx - n), idx):
        s.add(int(draws[j]['number']))
    return s


def main():
    draws = load_draws()
    total = len(draws)
    start = total - TEST_PERIODS
    print(f'数据 {total} 期（{draws[0]["date"]} ~ {draws[-1]["date"]}），'
          f'样本外测试 {start} ~ {total - 1} 共 {TEST_PERIODS} 期')
    print()

    # ---- 1. 排除窗口到底排掉多少个号码（去重）----
    print('=== 1. 最近 N 期开出过的号码：去重个数 ===')
    print('   N      末期窗口去重数   500 期平均   占 1000 个直选组合')
    window_stats = {}
    for n in EXCL:
        if n == 0:
            continue
        last_m = len(excluded_set(draws, total, n))
        ms = [len(excluded_set(draws, idx, n)) for idx in range(start, total)]
        avg = statistics.fmean(ms)
        window_stats[n] = {'last': last_m, 'avg': avg}
        print(f'  {n:<5}  {last_m:<14}  {avg:<11.1f}  {avg / 1000 * 100:.1f}%')
    print()

    # ---- 2. 被排除的集合自己有多大概率开出下期号码（排除的真实代价）----
    print('=== 2. 「排除」的真实代价：被排掉的号码自己命中下期的频率 ===')
    print('   N      实测命中率   理论 N/1000（去重后）   差异')
    cost = {}
    for n in EXCL:
        if n == 0:
            continue
        hit = 0
        exp = 0.0
        for idx in range(start, total):
            ex = excluded_set(draws, idx, n)
            exp += len(ex) / 1000
            if int(draws[idx]['number']) in ex:
                hit += 1
        rate = hit / TEST_PERIODS
        e = exp / TEST_PERIODS
        cost[n] = {'rate': rate, 'expect': e}
        print(f'  {n:<5}  {rate * 100:>9.2f}%  {e * 100:>18.2f}%  '
              f'{(rate - e) * 100:+7.2f}pt')
    print('  （"差异"在 ±2pt 内就说明排除集合和别的号码一样随机，'
          '排除它既不提高也不降低单注概率）')
    print()

    # ---- 3. 各策略 × 各排除窗口的 Top-K 命中率 ----
    print('=== 3. 排除窗口对 Top-K 命中率的影响（500 期样本外）===')
    rows = []
    for name in STRATEGIES:
        trials = RANDOM_TRIALS if name == '纯随机' else 1
        # 预生成每期排名（随机策略多试几次取平均）
        per_period = {}
        for idx in range(start, total):
            per_period[idx] = [rank_for(name, draws, idx, t) for t in range(trials)]
        for n in EXCL:
            hits = {k: 0.0 for k in KS}
            per_period_rate = []                   # 逐期命中率，用于配对检验（K=20）
            for idx in range(start, total):
                actual = int(draws[idx]['number'])
                ex = excluded_set(draws, idx, n) if n else set()
                hit20 = 0.0
                for trial_i, ranked in enumerate(per_period[idx]):
                    pool = [x for x in ranked if x not in ex]
                    for k in KS:
                        if actual in pool[:k]:
                            hits[k] += 1.0 / trials
                    if actual in pool[:20]:
                        hit20 += 1.0 / trials
                per_period_rate.append(hit20)
            rows.append({'strategy': name, 'n': n,
                         **{f'top{k}': hits[k] / TEST_PERIODS for k in KS},
                         'rate20': per_period_rate})

    for name in STRATEGIES:
        sub = [r for r in rows if r['strategy'] == name]
        base = sub[0]
        print(f'  {name}')
        print('    N      Top1      Top5      Top10     Top20     Top50     '
              'Top20 相对不排除')
        for r in sub:
            d = (r['top20'] - base['top20']) * 100
            print(f'    {r["n"]:<6} {r["top1"] * 100:>6.2f}%   {r["top5"] * 100:>6.2f}%   '
                  f'{r["top10"] * 100:>6.2f}%   {r["top20"] * 100:>6.2f}%   '
                  f'{r["top50"] * 100:>6.2f}%   {d:+6.2f}pt')
    print('  理论基线      1.00%     5.00%    10.00%    20.00%    50.00%')
    print()

    # ---- 4. 配对检验：逐期命中率之差（同策略、同期、同随机种子）----
    print('=== 4. 配对检验：排除 N 期 vs 不排除（Top20，逐期配对）===')
    print('   策略         N     命中率差(pt)   标准误(pt)     t 值     p 值')
    tests = []
    for name in STRATEGIES:
        sub = {r['n']: r for r in rows if r['strategy'] == name}
        base = sub[0]['rate20']
        for n in EXCL:
            if n == 0:
                continue
            diffs = [(a - b) * 100 for a, b in zip(sub[n]['rate20'], base)]
            mean = statistics.fmean(diffs)
            sd = statistics.stdev(diffs) if len(set(diffs)) > 1 else 0.0
            se = sd / math.sqrt(len(diffs)) if sd else 0.0
            t = mean / se if se else 0.0
            p = 1.0 if not se else min(1.0, 2 * (1 - normal_cdf(abs(t))))
            tests.append({'strategy': name, 'n': n, 'diff_pt': mean, 'se_pt': se,
                          't': t, 'p': p})
            flag = '  ← 有差异' if p < 0.05 else ''
            print(f'   {name:<10} {n:<5} {mean:>+12.3f} {se:>14.3f} {t:>9.2f} {p:>8.3f}{flag}')
    sig = [t for t in tests if t['p'] < 0.05]
    print(f'   -> {len(tests)} 组配对比较中，{len(sig)} 组在 5% 水平上显著'
          f'（纯噪声下期望约 {len(tests) * 0.05:.1f} 组）；'
          f'最大绝对差异 {max(abs(t["diff_pt"]) for t in tests):.2f}pt')
    print()

    out = {
        'meta': {'total': total, 'test_periods': TEST_PERIODS,
                 'start': start, 'end': total - 1,
                 'first': draws[0]['issue'], 'last': draws[-1]['issue']},
        'window_stats': {str(k): v for k, v in window_stats.items()},
        'cost': {str(k): v for k, v in cost.items()},
        'rows': [{k: v for k, v in r.items() if k != 'hit20_periods'} for r in rows],
        'tests': tests,
    }
    # 仓库里写进 reports/，本地开发目录就写在脚本旁边
    out_dir = os.path.join(HERE, '..', 'reports')
    if not os.path.isdir(out_dir):
        out_dir = HERE
    path = os.path.abspath(os.path.join(out_dir, 'exclude_window_result.json'))
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f'明细已写入 {path}')


def normal_cdf(x):
    """标准正态分布函数（够精确，避免引入 scipy 依赖）。"""
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


if __name__ == '__main__':
    main()
