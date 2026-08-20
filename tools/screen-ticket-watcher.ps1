# screen-ticket-watcher.ps1 — poll Sanity for open screen tickets and launch
# the headless repair agent (claude -p) per ticket. Registered as the Windows
# scheduled task "AquaMX Screen Tickets" (every 5 min; PC must be on — same
# limitation as the 4h kiosk health task, accepted).
#
# Queue contract: line-webhook opens tickets (_type screenTicket, status open);
# this watcher claims one (status working), hands it to the agent with the
# playbook; the agent finishes it (fixed/failed/needs_action) and calls
# /api/screen-ticket-notify itself. Watcher logs to tools\health\tickets.log.

$ErrorActionPreference = 'Stop'
$RepoDir  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogFile  = Join-Path $RepoDir 'tools\health\tickets.log'
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content -Path $LogFile -Encoding utf8 }

# Sanity credentials — write token from the handoff repo's local env
$envFile = Join-Path (Split-Path -Parent $RepoDir) 'aquamx-handoff\.env.local'
$tok = ((Get-Content $envFile | Where-Object { $_ -match '^SANITY_WRITE_TOKEN=' } | Select-Object -First 1) -split '=', 2)[1].Trim().Trim('"')
if (-not $tok) { Log 'no write token — abort'; exit 0 }
$base = 'https://awjj9g8u.api.sanity.io/v2024-01-01'

try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

# One ticket per run (oldest open) — keeps agent runs serialized
$q = [uri]::EscapeDataString('*[_type == "screenTicket" && status == "open"] | order(createdAt asc)[0]{_id, projectId, projectTitle, lineGroupId, message, createdAt}')
try {
  $res = Invoke-RestMethod -Uri "$base/data/query/production?query=$q" -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 30
} catch { Log "queue query failed: $($_.Exception.Message)"; exit 0 }
$t = $res.result
if (-not $t) { exit 0 }   # nothing to do — stay silent

$tid = $t._id
Log "claiming ticket $tid ($($t.projectTitle)) — '$($t.message)'"

# Claim it so a parallel run can't double-work
$claim = @{ mutations = @(@{ patch = @{ id = $tid; set = @{ status = 'working'; workedAt = (Get-Date).ToUniversalTime().ToString('o') } } }) } | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri "$base/data/mutate/production" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tok" } -Body $claim -TimeoutSec 30 | Out-Null

# Thai survives only through a UTF-8 file — PS 5.1 mangles non-ASCII in
# native-command arguments (codepage), so the prompt itself stays ASCII.
$ticketFile = Join-Path $RepoDir 'tools\health\current-ticket.json'
[IO.File]::WriteAllText($ticketFile, ($t | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$playbook = Join-Path $RepoDir 'tools\screen-repair-playbook.md'
$prompt = ('You are the automated kiosk screen-repair agent. Read the ticket JSON at ' + $ticketFile +
  ' and the playbook at ' + $playbook +
  ', then execute the playbook for that ticket EXACTLY as written, guardrails first. ' +
  'Work autonomously, finish by patching the ticket to a terminal status and POSTing the notify endpoint as the playbook says, then stop.')

Log "launching repair agent for $tid"
try {
  & claude -p $prompt --dangerously-skip-permissions --output-format text 2>&1 |
    Out-File -FilePath (Join-Path $RepoDir "tools\health\ticket-$($tid.Substring(0,8)).log") -Encoding utf8
  Log "agent finished for $tid"
} catch {
  Log "agent launch failed: $($_.Exception.Message)"
  $fail = @{ mutations = @(@{ patch = @{ id = $tid; set = @{ status = 'needs_action'; note = 'ตัวซ่อมอัตโนมัติสตาร์ทไม่สำเร็จบนพีซี — ตรวจด้วยมือ' } } }) } | ConvertTo-Json -Depth 6
  Invoke-RestMethod -Uri "$base/data/mutate/production" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tok" } -Body $fail -TimeoutSec 30 | Out-Null
  try { Invoke-RestMethod -Uri 'https://app.aquamx.biz/api/screen-ticket-notify' -Method Post -ContentType 'application/json' -Body (@{ ticketId = $tid } | ConvertTo-Json) -TimeoutSec 30 | Out-Null } catch {}
}
