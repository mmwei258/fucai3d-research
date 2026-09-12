"""把模板 + CSS + 数据 + JS 合并成一个自包含的单文件 HTML。"""

from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = Path(r"D:\Codex\2026-09-13\dt-x20\outputs\福彩3D数据工具箱.html")


def read(p):
    return Path(p).read_text(encoding="utf-8")


css = read(HERE / "app.css")
data = read(HERE / "data.js")

js_files = sorted((HERE / "js").glob("*.js"))
js = "\n\n".join(read(f) for f in js_files)

html = read(HERE / "app.html")
html = html.replace("/*__CSS__*/", css)
html = html.replace("/*__DATA__*/", data)
html = html.replace("/*__JS__*/", js)

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

leftover = [m for m in ("/*__CSS__*/", "/*__DATA__*/", "/*__JS__*/") if m in html]
print("占位符残留:", leftover if leftover else "无")
