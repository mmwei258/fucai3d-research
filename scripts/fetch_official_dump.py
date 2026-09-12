#!/usr/bin/env python3
"""从中国福彩网官方接口刷新 data/raw 下的原始转储文件。

用法：
    python scripts/fetch_official_dump.py                # 更新 all + 2y 两个转储
    python scripts/fetch_official_dump.py --mode all     # 只更新全历史
    python scripts/fetch_official_dump.py --mode 2y      # 只更新近两年
    python scripts/fetch_official_dump.py --dry-run      # 只抓取与校验，不写文件

设计要点：
  - 输出格式与仓库既有转储逐字节一致（字段顺序、缩进、\\UXXXX 转义、
    空值 \"\" / 纯数字裸写 / 其余加引号、记录间逗号）
  - 写盘前先用 build_fucai3d_dataset.parse_offload 自检，解析不通过则拒绝写入
  - 分页抓取 + 指数退避重试

抓取后请依次运行：
    python scripts/build_fucai3d_dataset.py
    python scripts/build_fucai3d_all_dataset.py
    python scripts/fucai3d_backtest_walkforward.py
    python scripts/fucai3d_forecast_next7days.py
"""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / 'data' / 'raw'

API = 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice'
HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    ),
    'Referer': 'https://www.cwl.gov.cn/ygkj/wqkjgg/',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
}

MODES = {
    'all': {
        'path': RAW_DIR / 'official_api_all_browser_dump.txt',
        'page_size': 300,
        'header_page_size': 5000,
        'start': '2013-01-01',
    },
    '2y': {
        'path': RAW_DIR / 'official_api_2y_browser_dump.txt',
        'page_size': 300,
        'header_page_size': 1000,
        'start_days_ago': 731,
    },
}


def esc_u(text):
    """把非 ASCII 字符转成 \\Uxxxx（小写十六进制），与既有转储一致。"""
    return ''.join(c if ord(c) < 128 else f'\\U{ord(c):04x}' for c in text)


def fmt_num(value):
    """空值 -> \"\"；纯数字（含 0）-> 裸数字；其余 -> 带引号字符串。"""
    text = '' if value is None else str(value).strip().strip('"')
    if text == '':
        return '""'
    return text if text.isdigit() else f'"{text}"'


def fmt_str(value):
    """一律带引号（允许空串）。"""
    text = '' if value is None else str(value).strip()
    return f'"{text}"'


def fetch_range(day_start, day_end, page_size, pause=0.8, retries=4):
    """按日期区间抓取全部记录（自动翻页）。返回按接口顺序的原始记录列表。"""
    records = []
    page = 1
    while True:
        query = urllib.parse.urlencode({
            'name': '3d', 'issueCount': '', 'issueStart': '', 'issueEnd': '',
            'dayStart': day_start, 'dayEnd': day_end,
            'pageNo': page, 'pageSize': page_size, 'week': '', 'systemType': 'PC',
        })
        payload = None
        last_error = None
        for attempt in range(retries):
            try:
                request = urllib.request.Request(f'{API}?{query}', headers=HEADERS)
                with urllib.request.urlopen(request, timeout=30) as response:
                    payload = json.loads(response.read().decode('utf-8'))
                break
            except Exception as exc:                      # noqa: BLE001
                last_error = exc
                time.sleep(1.5 * (2 ** attempt))
        if payload is None:
            raise SystemExit(f'抓取失败（已重试 {retries} 次）: {last_error}')
        if payload.get('state') != 0:
            raise SystemExit(f'接口返回异常: {payload.get("message")}')

        rows = payload.get('result') or []
        if not rows:
            break
        records.extend(rows)
        print(f'    page {page}: +{len(rows)}（累计 {len(records)}）')
        if len(rows) < page_size:
            break
        page += 1
        time.sleep(pause)
    return records


def render_record(rec):
    """渲染单条记录为仓库转储格式的行列表。"""
    raw_date = str(rec['date'])
    if '(' in raw_date:
        day_part, week_part = raw_date.split('(', 1)
        week_part = week_part.rstrip(')')
    else:
        day_part, week_part = raw_date, ' '
    week = rec.get('week') or week_part

    lines = [
        '        {',
        f'        addmoney = {fmt_num(rec.get("addmoney"))};',
        f'        addmoney2 = {fmt_num(rec.get("addmoney2"))};',
        f'        blue = {fmt_num(rec.get("blue"))};',
        f'        blue2 = {fmt_num(rec.get("blue2"))};',
        f'        code = {rec["code"]};',
        f'        content = {fmt_str(rec.get("content"))};',
        f'        date = "{day_part}({esc_u(week_part)})";',
        f'        detailsLink = {fmt_str(rec.get("detailsLink"))};',
        f'        m2add = {fmt_num(rec.get("m2add"))};',
        f'        msg = {fmt_str(rec.get("msg"))};',
        '        name = 3D;',
        f'        poolmoney = {fmt_num(rec.get("poolmoney"))};',
        '        prizegrades =         (',
    ]
    grades = rec.get('prizegrades') or []
    for index, grade in enumerate(grades):
        lines += [
            '                        {',
            f'                type = {grade.get("type")};',
            f'                typemoney = {fmt_num(grade.get("typemoney"))};',
            f'                typenum = {fmt_num(grade.get("typenum"))};',
            '            }' + (',' if index < len(grades) - 1 else ''),
        ]
    lines += [
        '        );',
        f'        red = "{rec["red"]}";',
        f'        sales = {fmt_num(rec.get("sales"))};',
        f'        videoLink = {fmt_str(rec.get("videoLink"))};',
        f'        week = "{esc_u(week)}";',
        f'        z2add = {fmt_num(rec.get("z2add"))};',
        '    }',
    ]
    return lines


def build_dump_text(records, header_page_size, newline='\r\n'):
    """把记录列表渲染成完整转储文本。"""
    ordered = sorted(records, key=lambda r: int(r['code']), reverse=True)
    body = []
    for index, rec in enumerate(ordered):
        block = render_record(rec)
        if index < len(ordered) - 1:
            block[-1] += ','
        body.extend(block)
    text = '\n'.join([
        '  Tflag: 2',
        '  message: 查询成功',
        '  pageNo: 1',
        '  pageNum: 1',
        f'  pageSize: {header_page_size}',
        '  result: (',
        *body,
        ')',
        '  state: 0',
        f'  total: {len(ordered)}',
        '',
    ])
    if newline != '\n':
        text = text.replace('\n', newline)
    return text, ordered


def self_check(text, expected_count):
    """写盘前用仓库自带的解析器自检，避免写出无法解析的文件。"""
    sys.path.insert(0, str(ROOT / 'scripts'))
    import build_fucai3d_dataset as base

    parsed = base.parse_offload(text)
    if len(parsed) != expected_count:
        raise SystemExit(f'自检失败：解析出 {len(parsed)} 条，期望 {expected_count} 条')
    codes = sorted(int(r['code']) for r in parsed)
    if len(set(codes)) != len(codes):
        raise SystemExit('自检失败：存在重复期号')
    bad = [r['code'] for r in parsed
           if len(str(r.get('red', '')).split(',')) != 3
           or not str(r.get('date', ''))]
    if bad:
        raise SystemExit(f'自检失败：{len(bad)} 条记录字段异常，例如 {bad[:5]}')
    return parsed


def detect_newline(path):
    if path.exists():
        head = path.read_bytes()[:4096]
        return '\r\n' if b'\r\n' in head else '\n'
    return '\r\n'


def refresh(mode, today, dry_run=False):
    spec = MODES[mode]
    target = spec['path']
    if 'start_days_ago' in spec:
        day_start = (today - timedelta(days=spec['start_days_ago'])).isoformat()
    else:
        day_start = spec['start']
    day_end = today.isoformat()

    print(f'[{mode}] 抓取 {day_start} ~ {day_end} ...')
    records = fetch_range(day_start, day_end, spec['page_size'])
    if not records:
        raise SystemExit('未抓到任何记录，已中止（不覆盖原文件）')

    text, ordered = build_dump_text(records, spec['header_page_size'],
                                    detect_newline(target))
    parsed = self_check(text, len(ordered))

    codes = sorted(int(r['code']) for r in parsed)
    print(f'  记录数 {len(parsed)}  期号 {codes[0]} ~ {codes[-1]}  '
          f'自检通过')
    if dry_run:
        print('  --dry-run：不写文件')
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(text.encode('utf-8'))
    print(f'  已写入 {target.relative_to(ROOT)}  ({target.stat().st_size / 1024:.0f} KB)')


def main():
    parser = argparse.ArgumentParser(description='刷新福彩3D官方数据转储')
    parser.add_argument('--mode', choices=['all', '2y', 'both'], default='both')
    parser.add_argument('--dry-run', action='store_true', help='只抓取与自检，不写文件')
    parser.add_argument('--today', help='覆盖"今天"（YYYY-MM-DD），便于复现历史抓取')
    args = parser.parse_args()

    today = (date.fromisoformat(args.today) if args.today
             else datetime.now().date())
    print(f'== 福彩3D 数据转储刷新  today={today} ==')
    modes = ['all', '2y'] if args.mode == 'both' else [args.mode]
    for mode in modes:
        refresh(mode, today, dry_run=args.dry_run)
        print()
    print('完成。请继续运行构建脚本：')
    print('  python scripts/build_fucai3d_dataset.py')
    print('  python scripts/build_fucai3d_all_dataset.py')
    print('  python scripts/fucai3d_backtest_walkforward.py')
    print('  python scripts/fucai3d_forecast_next7days.py')


if __name__ == '__main__':
    main()
