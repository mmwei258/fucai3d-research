@echo off
setlocal
chcp 65001 >nul
title 福彩3D 数据工具箱 - 更新并发布
cd /d "%~dp0"

echo ================================================================
echo   更新并发布
echo   1) 从中国福彩网官方接口抓最新开奖
echo   2) 重建数据集与网页 docs\index.html
echo   3) 有变化就提交并推送到 GitHub（Pages 会自动重新发布）
echo   时间：%date% %time%
echo ================================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
  echo [错误] 没找到 python，请先安装 Python 3.11 以上版本并加入 PATH。
  echo.
  pause
  exit /b 1
)

python scripts\auto_update_push.py
set CODE=%errorlevel%

echo.
if not "%CODE%"=="0" (
  echo [失败] 退出码 %CODE%。详细日志：logs\auto_update.log
  echo        若是网络问题，稍后再试；官方接口偶尔会拒绝短时间内的密集请求。
) else (
  echo [完成] 日志：logs\auto_update.log
)
echo.
pause
exit /b %CODE%
