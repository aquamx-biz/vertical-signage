# กู้ข้อมูลจาก backup · Restoring a backup

Backups run every day at 01:00 (`.github/workflows/backup.yml`) into the
Google Shared Drive **aquamx-backup**, one folder per day, newest 14 kept.
Older folders sit in the Shared Drive trash for 30 days.

| File | What | Encrypted |
|---|---|---|
| `sanity-production.tar.gz` | every Studio document + images/videos | no (dataset is public-read anyway) |
| `sanity-internal.tar.gz.enc` | private co-broke contacts (PDPA) | yes |
| `firestore.ndjson.gz.enc` | leads, orders, payments, config (holds credentials) | yes |
| `MANIFEST.txt` | document counts + sha256 of each file | no |

Run everything below in **Git Bash** (it ships `openssl`), from the
`vertical-signage` folder. Download the week's files from Drive into
`vertical-signage/_restore/` first — that folder is git-ignored, so decrypted
contacts and credentials can never be committed by accident.

## 1. Decrypt

The passphrase is `BACKUP_PASSPHRASE` — GitHub cannot show it again. One copy is
in `aquamx-handoff/.env.local` (git-ignored), a second one outside this laptop.

```bash
export BACKUP_PASSPHRASE="$(grep '^BACKUP_PASSPHRASE=' ../aquamx-handoff/.env.local | cut -d= -f2- | tr -d '"\r\n')"
# no .env.local? type it instead:  read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE
cd _restore
for f in sanity-internal.tar.gz firestore.ndjson.gz; do
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in "$f.enc" -out "$f" -pass env:BACKUP_PASSPHRASE
done
sha256sum -c <(grep '^sha256 ' MANIFEST.txt | cut -d' ' -f2-)   # every line must say OK
cd ..
```

`bad decrypt` = wrong passphrase (or one with a stray space/quote).

## 2. Sanity

**There is no spare dataset to restore into.** The plan allows 3 datasets and
all 3 are taken (`production`, `production-comments`, `internal`), so
`sanity dataset create` fails with *Payment Required - Quota exceeded*. Check
the archive on the laptop instead, then import into the live dataset with the
flag that touches the least.

### Check the archive

```bash
mkdir -p _restore/p && tar --force-local -xzf _restore/sanity-production.tar.gz -C _restore/p
wc -l _restore/p/*/data.ndjson                                        # = "documents" in MANIFEST.txt
find _restore/p -type f \( -path '*/images/*' -o -path '*/files/*' \) | wc -l   # = "asset files"
grep -F '"_id":"THE-DOC-ID"' _restore/p/*/data.ndjson                 # is the lost doc in there?
```

Tested 2026-10-18 on the first backup: 6,145/6,145 documents matched live
`_rev` for `_rev`, all 690 asset files passed their sha1, internal 13,593/13,593.
The only live docs not in an export are the 13 system `_.groups.*` docs, which
Sanity never exports and does not need restored.

### Put data back — pick the smallest that fixes it

Run from `sanity-studio/`. Every write here is a normal Sanity mutation, so the
publish webhook fires and the kiosks rebuild — do it when a rebuild is fine.

| Situation | Command |
|---|---|
| Documents were **deleted** (the 16/09 purge kind) | `npx sanity dataset import ../_restore/sanity-production.tar.gz production --missing` — adds only docs whose `_id` no longer exists; nothing that still exists is touched |
| **One document** was edited wrongly | `grep -F '"_id":"THE-DOC-ID"' ../_restore/p/*/data.ndjson > ../_restore/one.json` then `npx sanity documents create ../_restore/one.json --replace --dataset production` |
| The dataset is **wrecked** | `npx sanity dataset import ../_restore/sanity-production.tar.gz production --replace` — every backed-up doc overwrites its live version; docs created after the backup stay |

`internal` works the same way with `_restore/sanity-internal.tar.gz` and
`--dataset internal` / `internal` as the target. Never import into
`production-comments`.

## 3. Firestore

`restore-firestore.mjs` is a dry run until `--write`; `--only` limits it to
some collections. It overwrites documents with the backed-up version and leaves
newer documents alone.

```bash
export FIREBASE_SERVICE_ACCOUNT_JSON="$(grep '^FIREBASE_SERVICE_ACCOUNT_JSON=' ../aquamx-handoff/.env.local | cut -d= -f2-)"
node tools/backup/restore-firestore.mjs _restore/firestore.ndjson.gz --only leads           # look first
node tools/backup/restore-firestore.mjs _restore/firestore.ndjson.gz --only leads --write   # then write
```

Careful with `config`: it also holds settings the fleet reads live.

## 4. Clean up

`rm -rf _restore` when done — the decrypted files hold phone numbers and
credentials in plain form.

## Run a backup now

GitHub → Actions → **Daily backup** → Run workflow. A failure posts in the
"aquamx notify" LINE group with a link to the run.
