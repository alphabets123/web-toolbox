@echo off
title Snap-Task Local Agent
color 0b
echo =======================================================
echo.
echo   Snap-Task 유튜브 다운로더 로컬 에이전트
echo.
echo =======================================================
echo.
echo  * 이 창을 닫으면 다운로드 기능이 중단됩니다.
echo  * 분석/다운로드 중에는 창을 닫지 마세요.
echo.
echo  에이전트를 시작하는 중입니다...
echo.

node projects/yt-agent/youtube.js

if %errorlevel% neq 0 (
    echo.
    echo [오류] 에이전트 실행에 실패했습니다.
    echo Node.js가 설치되어 있는지 확인해 주세요.
    pause
)
