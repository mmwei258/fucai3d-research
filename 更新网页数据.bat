@echo off
setlocal
chcp 65001 >nul
title 福彩3D 数据工具箱 - 更新网页数据
cd /d "%~dp0"

echo ================================================================
echo   更新网页数据
echo   1) 从中国福彩网官方接口抓最新开奖
echo   2) 重建数据集
echo   3) 重建网页 docs\index.html
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

python scripts\refresh_all.py %*
if errorlevel 1 (
  echo.
  echo [失败] 上面有错误信息。若只是网络问题，可改用离线重建：
  echo        python scripts\refresh_all.py --offline
  echo.
  pause
  exit /b 1
)

echo.
echo 网页已重建：%cd%\docs\index.html
echo 想发布到线上，再执行：
echo   git add -A data docs
echo   git commit -m "chore(data): 更新开奖数据"
echo   git push
echo.
choice /c YN /n /t 8 /d N /m "现在就用浏览器打开本页看看吗？(Y/N，8 秒后自动跳过)"
if errorlevel 2 goto end
start "" "%cd%\docs\index.html"

:end
pause
