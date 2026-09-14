#!/usr/bin/env python3
"""每天自动更新开奖数据并发布到 GitHub。

做的事：
    1) 跑 scripts/refresh_all.py（抓官方接口 -> 重建数据集 -> 重建网页）
    2) 有变化就 git commit + git push，Pages 随后自动重新发布
    3) 全过程写进 logs/auto_update.log，方便事后查

为什么不用 GitHub Actions：
    官方接口 www.cwl.gov.cn 会拒绝境外 IP（实测 GitHub 服务器拿到
    HTTP 403 Forbidden），所以定时更新只能在本机（国内网络）跑。
    .github/workflows/update-data.yml 里保留了手动触发，方便临时使用。

用法：
    python scripts/auto_update_push.py           # 正常跑，写日志
    python scripts/auto_update_push.py --dry-run # 只抓取重建，不提交不推送
"""

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = ROOT / 'logs'
LOG_FILE = LOG_DIR / 'auto_update.log'


def log(msg):
    line = f'[{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}] {msg}'
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open('a', encoding='utf-8') as f:
        f.write(line + '\n')
    try:
        print(line, flush=True)
    except (OSError, ValueError, AttributeError):
        pass          # 计划任务里用 pythonw 跑，没有控制台，忽略即可


def git(*args, check=True):
    # 计划任务里没有交互终端，禁用凭据弹窗，免得卡住不动
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0')
    proc = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True,
                          encoding='utf-8', errors='replace', env=env)
    if check and proc.returncode != 0:
        raise SystemExit(f'git {" ".join(args)} 失败（退出码 {proc.returncode}）：\n'
                         f'{proc.stdout}\n{proc.stderr}')
    return proc


def latest_issue():
    import json
    p = ROOT / 'data/all/history_official_all_features.json'
    rows = json.loads(p.read_text(encoding='utf-8'))
    last = rows[-1]
    return f'{last["issue"]} ({last["date"]} 开 {last["number"]})'


def push_with_retry(tries=8):
    """这台机器的 GitHub 连接常被重置，多试几次。"""
    for i in range(1, tries + 1):
        proc = git('push', check=False)
        if proc.returncode == 0:
            log(f'推送成功（第 {i} 次尝试）')
            return True
        log(f'推送第 {i} 次失败：{(proc.stderr or proc.stdout).strip()[:300]}')
        time.sleep(8)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='只抓取重建，不提交不推送')
    args = ap.parse_args()

    log('=' * 60)
    log('开始自动更新')

    # 计划任务里是 pythonw（没有控制台），子进程必须显式拿到输出句柄，
    # 否则它一 print 就会 OSError 崩掉。顺手把抓取/构建的完整输出也存进日志。
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open('a', encoding='utf-8') as sink:
        proc = subprocess.run([sys.executable, str(ROOT / 'scripts/refresh_all.py')],
                              cwd=ROOT, stdout=sink, stderr=subprocess.STDOUT)
    if proc.returncode != 0:
        log(f'抓取/重建失败（退出码 {proc.returncode}），本次不提交。')
        return 1

    issue = latest_issue()
    log(f'数据已重建到：{issue}')

    if args.dry_run:
        log('--dry-run：跳过提交与推送。')
        return 0

    git('add', '-A', 'data', 'docs')
    if git('diff', '--cached', '--quiet', check=False).returncode == 0:
        log('没有新数据，跳过提交。')
        return 0

    # 重建网页每次都会改「本页构建于…」那一行时间戳。如果除此之外什么都没有变，
    # 那就不是新数据，把这次构建撤掉，免得每天推一个"假更新"上去。
    docs_changed = [ln for ln in git('diff', '--cached', '--', 'docs').stdout.splitlines()
                    if ln.startswith(('+', '-')) and not ln.startswith(('+++', '---'))]
    data_changed = git('diff', '--cached', '--quiet', '--', 'data', check=False).returncode != 0
    if not data_changed and len(docs_changed) == 2 and all('本页构建于' in ln for ln in docs_changed):
        git('reset', '-q')
        git('checkout', '--', 'docs')
        log('没有新数据（只有网页构建时间在变），跳过提交。')
        return 0

    git('-c', 'user.name=mmwei258',
        '-c', 'user.email=62610897+mmwei258@users.noreply.github.com',
        'commit', '-m', f'chore(data): 自动更新开奖数据至 {issue}')
    log(f'已提交：自动更新开奖数据至 {issue}')

    if not push_with_retry():
        log('推送始终失败，改动留在本地，下次运行会一起推上去。')
        return 1

    log('完成。GitHub Pages 会在一两分钟内重新发布。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
