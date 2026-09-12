@echo off
setlocal
chcp 65001 >nul
title FuCai3D Research - run all steps
cd /d "%~dp0scripts"

echo ================================================================
echo   FuCai3D Research  -  run the full pipeline
echo   project : %~dp0
echo   time    : %date% %time%
echo ================================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] python not found in PATH.
  echo         Install Python 3.10+ or add it to PATH, then run again.
  echo.
  pause
  exit /b 1
)

echo ---- [1/5] build 2-year dataset ... ----
python build_fucai3d_dataset.py
if errorlevel 1 goto fail
echo.

echo ---- [2/5] build full dataset ... ----
python build_fucai3d_all_dataset.py
if errorlevel 1 goto fail
echo.

echo ---- [3/5] walk-forward backtest ... ----
python fucai3d_backtest_walkforward.py
if errorlevel 1 goto fail
echo.

echo ---- [4/5] forecast next 7 days ... ----
python fucai3d_forecast_next7days.py
if errorlevel 1 goto fail
echo.

echo ---- [5/5] entertainment recommender ... ----
python recommender.py bundle 5
if errorlevel 1 goto fail
echo.

echo ================================================================
echo   ALL STEPS FINISHED OK
echo.
echo   Results you can open:
echo     reports\backtest_walkforward_report.md
echo     reports\forecast_next7days_entertainment.md
echo.
echo   Note: this run refreshed the files under data\ and reports\.
echo         To undo that, run:  git checkout -- data reports
echo ================================================================
goto end

:fail
echo.
echo ================================================================
echo   FAILED - read the error message above this line.
echo ================================================================

:end
echo.
pause
