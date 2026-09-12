"""从仓库数据生成前端用的紧凑数据集。

输出 data.js：const FUCAI3D_DATA = [[期号, 日期, 号码, 销售额万], ...]
按时间正序排列（最旧 -> 最新）。
"""

import json
from pathlib import Path

REPO = Path(r"D:\fucai3d-research")
SRC = REPO / "data/all/history_official_all_features.json"
OUT = Path(r"D:\Codex\2026-09-13\dt-x20\work\mvp\data.js")

rows = json.loads(SRC.read_text(encoding="utf-8"))

compact = []
for r in rows:
    sales = r.get("sales") or 0
    try:
        sales_wan = round(float(sales) / 10000.0, 1)
    except (TypeError, ValueError):
        sales_wan = 0
    compact.append([str(r["issue"]), r["date"], str(r["number"]), sales_wan])

payload = json.dumps(compact, ensure_ascii=False, separators=(",", ":"))
OUT.write_text(
    "// 由 extract_data.py 生成，数据来源：中国福彩网官方接口\n"
    f"// 记录数 {len(compact)}，区间 {compact[0][0]} ~ {compact[-1][0]}\n"
    f"const FUCAI3D_DATA = {payload};\n",
    encoding="utf-8",
)

print(f"记录数: {len(compact)}")
print(f"区间: {compact[0][0]} {compact[0][1]} ~ {compact[-1][0]} {compact[-1][1]}")
print(f"最新一期: {compact[-1][2]}")
print(f"输出: {OUT}  ({OUT.stat().st_size / 1024:.0f} KB)")
print(f"样例(首): {compact[0]}")
print(f"样例(末): {compact[-1]}")
