"""独立验算「开奖记录 / 走势网格 / 历史统计」三张表的数值。

数据直接读仓库原始 JSON，不复用页面代码——两边对上了才算数。
verify_logic.js 第 7 节把这些数字硬编码成断言，页面每次构建都会对撞一次。

口径（与页面一致）：
    遗漏 = 截至该期开奖前，这个数字已经连续多少期没出现
    0 = 上一期刚出过；从未出现过 = 已经过了 i 期
    （有些站点把"上一期刚出过"记作 1，本工具记 0）
"""

import json
from itertools import combinations
from math import comb
from pathlib import Path

def find_dataset():
    """仓库里是 scripts/../data/...；本地开发目录再退一层找。"""
    here = Path(__file__).resolve().parent
    for p in [here.parent / "data" / "all" / "history_official_all_features.json",
              here / "data" / "all" / "history_official_all_features.json",
              Path(r"D:\fucai3d-research\data\all\history_official_all_features.json")]:
        if p.exists():
            return p
    raise SystemExit("找不到 history_official_all_features.json")


SRC = find_dataset()
print(f"数据集：{SRC}")
D = json.loads(SRC.read_text(encoding="utf-8"))
N = len(D)
DIGITS = [list(map(int, str(r["number"]).zfill(3))) for r in D]
TYPES = [r["repeat_type"] for r in D]


def gap_series(keys_of, from_i=0):
    """逐期遗漏快照：第 i 期的 {键: 上次出现的期序}"""
    last = {}
    for i in range(from_i):
        for k in keys_of(i):
            last[k] = i
    out = []
    for i in range(from_i, N):
        out.append(dict(last))
        for k in keys_of(i):
            last[k] = i
    return out


def gap(rec, key, i):
    """该键在第 i 期之前已经多少期没出现（0 = 上一期刚出过）"""
    return i - rec[key] - 1 if key in rec else i


def window_stats(pos, d, frm, ser):
    win = DIGITS[frm:]
    hits = [w[pos] == d for w in win]
    count = sum(hits)
    max_gap = max([gap(ser[frm + j], d, frm + j) for j in range(len(win))] or [0])
    best = cur = 0
    for h in hits:
        cur = cur + 1 if h else 0
        best = max(best, cur)
    return {"count": count, "avg": (len(win) / count if count else None),
            "max": max_gap, "streak": best}


def current_gap(pos, d):
    for i in range(N - 1, -1, -1):
        if DIGITS[i][pos] == d:
            return N - 1 - i
    return N


def show(label, values):
    print(f"  {label}: " + ",".join(str(v) for v in values))


print(f"数据：{N} 期（{D[0]['issue']} ~ {D[-1]['issue']}）")
print()
print("=== 走势网格：最近 30 期的遗漏序列 ===")
p0 = gap_series(lambda i: [DIGITS[i][0]], N - 30)
anyp = gap_series(lambda i: DIGITS[i], N - 30)
show("百位   第一行", [gap(p0[0], d, N - 30) for d in range(10)])
show("百位   最后一行", [gap(p0[29], d, N - 1) for d in range(10)])
show("不分位 最后一行", [gap(anyp[29], d, N - 1) for d in range(10)])

print()
print("=== 开奖记录：组态遗漏 ===")
ts = gap_series(lambda i: [TYPES[i]])
print(f"  最后一期 {D[-1]['issue']} 开出 {TYPES[-1]}: " +
      ", ".join(f"{t}={gap(ts[-1], t, N - 1)}" for t in ["组三", "组六", "豹子"]))
print(f"  {D[N - 30]['issue']} 那期的豹子遗漏 = {gap(ts[N - 30], '豹子', N - 30)}")

print()
print("=== 历史统计：近 30 期 vs 全历史（百位）===")
ser0 = gap_series(lambda i: [DIGITS[i][0]])
rows = {}


def fmt(s):
    avg = "—" if s["avg"] is None else f"{s['avg']:.1f}"
    return f"{s['count']}/{avg}/{s['max']}/{s['streak']}"


print("  球号  当前遗漏   近30期(出现/平均遗漏/最大遗漏/最大连出)   全历史(同)")
for d in range(10):
    near = window_stats(0, d, N - 30, ser0)
    alls = window_stats(0, d, 0, ser0)
    rows[d] = {"cur": current_gap(0, d), "near": near, "all": alls}
    print(f"   {d}     {rows[d]['cur']:>4}     {fmt(near):<30} {fmt(alls)}")

print()
print("对撞用的关键值（verify_logic.js 第 7 节）：")
for d in (1, 5):
    r = rows[d]
    print(f"  百位数字{d}: 当前遗漏={r['cur']} 近30={r['near']} 全历史={r['all']}")

# ---------------- 不分位：数字出现在任意位置就算命中 ----------------
print()
print("=== 不分位统计（不看位置）===")
SETS = [set(g) for g in DIGITS]
ser_any = gap_series(lambda i: list(SETS[i]))
any_rows = {}
for d in range(10):
    hits = [d in s for s in SETS]
    cur = next((N - 1 - i for i in range(N - 1, -1, -1) if d in SETS[i]), N)

    def stat(frm):
        win = hits[frm:]
        c = sum(win)
        mx = max([gap(ser_any[frm + j], d, frm + j) for j in range(len(win))] or [0])
        best = run = 0
        for h in win:
            run = run + 1 if h else 0
            best = max(best, run)
        return {"count": c, "avg": (len(win) / c if c else None), "max": mx, "streak": best}

    any_rows[d] = {"cur": cur, "near": stat(N - 30), "all": stat(0)}
    a = any_rows[d]
    print(f"   数字{d} 当前遗漏={a['cur']:>3}  近30(出现{a['near']['count']:>2}/最大{a['near']['max']:>2}/连出{a['near']['streak']})"
          f"  全历史(出现{a['all']['count']}/均{a['all']['avg']:.1f}/最大{a['all']['max']}/连出{a['all']['streak']})")

# ---------------- 连出：相邻两期重复了几个数字 ----------------
print()
print("=== 连出统计（不分位）===")
from collections import Counter
cnt = Counter(len(SETS[i] & SETS[i - 1]) for i in range(1, N))
pairs = N - 1
print("  实测: " + " / ".join(f"{j}个 {cnt[j]}期 {cnt[j] / pairs * 100:.2f}%" for j in range(4)))
print(f"  实测平均重复 {sum(j * c for j, c in cnt.items()) / pairs:.4f} 个/期")
theo = Counter()
for a in range(1000):
    sa = set(map(int, str(a).zfill(3)))
    for b in range(1000):
        theo[len(sa & set(map(int, str(b).zfill(3))))] += 1
tot = 1000 * 1000
print("  理论: " + " / ".join(f"{j}个 {theo[j]}对 {theo[j] / tot * 100:.2f}%" for j in range(4)))
print(f"  理论平均重复 {sum(j * c for j, c in theo.items()) / tot:.4f} 个/期"
      f"；至少一个连出的概率 {100 - theo[0] / tot * 100:.2f}%")
print()
print("对撞用的关键值（verify_logic.js 第 8 节）：")
print("  不分位数字1:", any_rows[1])
print("  不分位数字5:", any_rows[5])

# ---------------- 任意 N 期窗口：会不会出现重号 ----------------
# 理论：马尔可夫链精确算（状态只需"本期有几个不同数字"）
def g(m, j):
    """m 个数字里取 3 位、恰好 j 个不同数字的组合数"""
    if j == 1:
        return m
    if j == 2:
        return comb(m, 2) * 6
    return comb(m, 3) * 6


def no_repeat_window(n):
    w = {1: g(10, 1) / 1000, 2: g(10, 2) / 1000, 3: g(10, 3) / 1000}
    for _ in range(n - 1):
        nw = {1: 0.0, 2: 0.0, 3: 0.0}
        for k, p in w.items():
            for j in (1, 2, 3):
                nw[j] += p * g(10 - k, j) / 1000
        w = nw
    return sum(w.values())


print()
print("=== 任意 N 期窗口（有重号的概率）===")
print("  窗口   无重号(理论)     无重号(实测窗口)         有重号(实测)")
for n in (5, 10, 20, 30):
    tot = clean = 0
    for i in range(N - n + 1):
        tot += 1
        if all(not (SETS[i + j] & SETS[i + j - 1]) for j in range(1, n)):
            clean += 1
    theo = no_repeat_window(n)
    print(f"  {n:>3} 期   {theo * 100:8.4f}%     {clean:>4} / {tot:<5} ({clean / tot * 100:6.4f}%)   "
          f"{(1 - clean / tot) * 100:6.2f}%")
print("对撞用的关键值（verify_logic.js 第 8 节）：")
print("  2 期无重号 =", f"{no_repeat_window(2) * 100:.4f}%",
      " 5 期 =", f"{no_repeat_window(5) * 100:.4f}%",
      " 10 期 =", f"{no_repeat_window(10) * 100:.4f}%")

# ---------------- 指定 k 个数字：一起出现 / 连着两期都出现 ----------------
def all_in(k):
    """指定 k 个数字"某一期里全都出现"的精确概率（容斥）"""
    return sum((-1) ** j * comb(k, j) * (10 - j) ** 3 for j in range(k + 1)) / 1000


print()
print("=== 指定几个数字（不分位）===")
print("  指定      单期都出现     连着两期都出现    平均多少期遇到一次")
for k in (1, 2, 3):
    p = all_in(k)
    print(f"  {k} 个   {p * 100:9.4f}%   {p * p * 100:12.6f}%   {1 / (p * p):>12,.0f} 期")
print("  实测（所有组合取平均）:")
for k in (1, 2, 3):
    combos = list(combinations(range(10), k))
    hit = both = 0
    for c in combos:
        for i in range(N):
            if all(d in SETS[i] for d in c):
                hit += 1
                if i > 0 and all(d in SETS[i - 1] for d in c):
                    both += 1
    print(f"   {k} 个: 单期 {hit / len(combos):.1f} 期（{hit / len(combos) / N * 100:.2f}%），"
          f"相邻两期 {both / len(combos):.2f} 次（理论 {N * all_in(k) ** 2:.2f}）")
print("  用户举的例子 7 和 2:")
h72 = sum(1 for s in SETS if 7 in s and 2 in s)
b72 = sum(1 for i in range(1, N) if 7 in SETS[i] and 2 in SETS[i] and 7 in SETS[i - 1] and 2 in SETS[i - 1])
print(f"   单期都出现 {h72} 期（{h72 / N * 100:.2f}%，理论 {all_in(2) * 100:.2f}%）；"
      f"相邻两期都出现 {b72} 次（理论 {N * all_in(2) ** 2:.1f} 次）")
