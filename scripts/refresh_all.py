#!/usr/bin/env python3
"""一条命令把开奖数据抓下来、重建数据集、重建网页。

用法：
    python scripts/refresh_all.py             # 抓最新开奖 + 重建 + 重建网页
    python scripts/refresh_all.py --offline   # 不联网，只用现有 data/raw 转储重建
    python scripts/refresh_all.py --no-2y     # 跳过"近两年"数据集（省一半时间）
    python scripts/refresh_all.py --report    # 顺带跑回测和 7 天报表

做完这些事：
    1) scripts/fetch_official_dump.py        从中国福彩网官方接口抓最新开奖
    2) scripts/build_fucai3d_all_dataset.py  重建全历史数据集（2013 年至今）
    3) scripts/build_fucai3d_dataset.py      重建近两年数据集
    4) tool/extract_data.py                  生成前端用的紧凑数据
    5) tool/build.py                         合并成单文件网页 docs/index.html

每一步失败都会立刻停下并打印原因，不会写坏中间文件。
"""

import argparse
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(title, args):
    print()
    print('=' * 64)
    print(f'  {title}')
    print('=' * 64)
    t0 = time.time()
    # 用当前解释器跑，避免 Windows 上 python/py 混用导致找不到命令
    proc = subprocess.run([sys.executable] + args, cwd=ROOT)
    if proc.returncode != 0:
        raise SystemExit(f'\n[失败] {title}（退出码 {proc.returncode}），已停止。')
    print(f'  -- 用时 {time.time() - t0:.1f} 秒')


def latest_issue():
    """从构建好的 features.json 里读最新一期，用来汇报"更新到哪一期了"。"""
    import json
    p = ROOT / 'data/all/history_official_all_features.json'
    if not p.exists():
        return None
    rows = json.loads(p.read_text(encoding='utf-8'))
    return rows[-1] if rows else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--offline', action='store_true', help='不联网，仅用现有转储重建')
    ap.add_argument('--no-2y', action='store_true', help='跳过近两年数据集')
    ap.add_argument('--report', action='store_true', help='顺带跑回测与 7 天报表')
    args = ap.parse_args()

    started = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f'福彩3D 数据刷新　开始时间 {started}')
    print(f'仓库目录 {ROOT}')
    if args.offline:
        print('模式：离线重建（不抓取新数据）')

    if not args.offline:
        # 必须抓 all + 2y 两份转储：下面两个数据集分别从各自的转储重建，
        # 只抓 all 会让"近两年"数据集永远停在旧的一期上。
        run('[1/5] 抓取最新开奖（中国福彩网官方接口）',
            ['scripts/fetch_official_dump.py', '--mode', 'both'])
    else:
        print('\n[1/5] 跳过抓取（--offline）')

    run('[2/5] 重建全历史数据集', ['scripts/build_fucai3d_all_dataset.py'])
    if not args.no_2y:
        run('[3/5] 重建近两年数据集', ['scripts/build_fucai3d_dataset.py'])
    else:
        print('\n[3/5] 跳过近两年数据集（--no-2y）')

    run('[4/5] 生成前端数据', ['tool/extract_data.py'])
    run('[5/5] 重建网页 docs/index.html', ['tool/build.py'])

    if args.report:
        run('[附加] 样本外回测', ['scripts/fucai3d_backtest_walkforward.py'])
        run('[附加] 未来 7 天娱乐性参考', ['scripts/fucai3d_forecast_next7days.py'])

    last = latest_issue()
    print()
    print('=' * 64)
    print('  全部完成')
    print('=' * 64)
    if last:
        print(f'  数据已更新到：第 {last["issue"]} 期（{last["date"]} 开 {last["number"]}）')
    print('  网页：docs/index.html（部署到 GitHub Pages 后自动生效）')
    print('  提交发布：git add -A docs data && git commit -m "chore(data): 更新开奖数据" && git push')
    print(f'  结束时间 {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')


if __name__ == '__main__':
    main()
