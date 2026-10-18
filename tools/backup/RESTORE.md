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

Always restore into a **new dataset first**, check it in Studio, then decide.
Importing straight over `production` replaces live documents that kiosks bake
from on the next rebuild.

```bash
cd sanity-studio
npx sanity dataset create restore-check --visibility private
npx sanity dataset import ../_restore/sanity-production.tar.gz restore-check
# compare: count(*) in restore-check vs the number in MANIFEST.txt
```

To put lost documents back into production, import with `--missing` (only adds
docs that no longer exist — the safe choice after an accidental delete) or
`--replace` (also overwrites docs that still exist with the backed-up version):

```bash
npx sanity dataset import ../_restore/sanity-production.tar.gz production --missing
```

Remove the check dataset afterwards: `npx sanity dataset delete restore-check`.
`internal` works the same way with `_restore/sanity-internal.tar.gz`.

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
