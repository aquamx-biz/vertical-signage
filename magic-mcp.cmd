@echo off
rem Launcher for Magic MCP (21st.dev) — reads MAGIC_API_KEY straight from the
rem Windows registry so it works even when the parent app has a stale env.
rem The key itself is NEVER stored in this file or in .mcp.json.
for /f "tokens=3" %%a in ('reg query HKCU\Environment /v MAGIC_API_KEY ^| findstr MAGIC_API_KEY') do set "API_KEY=%%a"
if not defined API_KEY (
  echo MAGIC_API_KEY not found in HKCU\Environment 1>&2
  exit /b 1
)
rem Pinned version: @latest makes npx hit the npm registry on every launch,
rem which delays server startup past the session's tool-loading window.
rem 0.1.0 (Jun 2025) returns [object Object] from the builder and malformed
rem MCP content from inspiration; 0.1.1-beta.1 (Dec 2025) is the newest build.
npx -y @21st-dev/magic@0.1.1-beta.1
