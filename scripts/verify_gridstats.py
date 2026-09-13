"""独立验算「开奖记录 / 走势网格 / 历史统计」三张表的数值。

数据直接读仓库原始 JSON，不复用页面代码——两边对上了才算数。
verify_logic.js 第 7 节把这些数字硬编码成断言，页面每次构建都会对撞一次。

口径（与页面一致）：
    遗漏 = 截至该期开奖前，这个数字已经连续多少期没出现
    0 = 上一期刚出过；从未出现过 = 已经过了 i 期
    （有些站点把"上一期刚出过"记作 1，本工具记 0）
"""

import json
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
