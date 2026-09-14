"""把模板 + CSS + 数据 + JS 合并成一个自包含的单文件 HTML。

用法：
    python tool/build.py                       # 默认写到 <仓库>/docs/index.html
    python tool/build.py --out 任意路径.html    # 指定输出位置

输出路径也可用环境变量 FUCAI3D_HTML_OUT 指定（命令行 --out 优先）。
页面里的 __BUILT_AT__ 会被替换成本次构建时间（北京时间），
用来在页面上显示"数据截止到哪一期、页面是什么时候构建的"。
"""

import argparse
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE.parent / "docs" / "index.html"


def read(p):
    return Path(p).read_text(encoding="utf-8")


ap = argparse.ArgumentParser()
ap.add_argument("--out", default=os.environ.get("FUCAI3D_HTML_OUT") or str(DEFAULT_OUT),
                help="输出 HTML 路径（默认 <仓库>/docs/index.html）")
args = ap.parse_args()
OUT = Path(args.out).resolve()

built_at = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")


css = read(HERE / "app.css")
data = read(HERE / "data.js")

js_files = sorted((HERE / "js").glob("*.js"))
js = "\n\n".join(read(f) for f in js_files)

html = read(HERE / "app.html")
html = html.replace("/*__CSS__*/", css)
html = html.replace("/*__DATA__*/", data)
html = html.replace("/*__JS__*/", js)
html = html.replace("__BUILT_AT__", built_at)

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding="utf-8")

print("已合并的 JS 模块：")
for f in js_files:
    print(f"  {f.name}  ({f.stat().st_size / 1024:.1f} KB)")
print()
print(f"CSS:  {len(css) / 1024:.1f} KB")
print(f"数据: {len(data) / 1024:.1f} KB")
print(f"JS:   {len(js) / 1024:.1f} KB")
print()
print(f"输出: {OUT}")
print(f"总大小: {OUT.stat().st_size / 1024:.0f} KB")
print(f"构建时间: {built_at}（北京时间）")

leftover = [m for m in ("/*__CSS__*/", "/*__DATA__*/", "/*__JS__*/", "__BUILT_AT__") if m in html]
print("占位符残留:", leftover if leftover else "无")
