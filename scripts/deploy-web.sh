#!/usr/bin/env bash
#
# Production bring-up for the Kegelee web backend, run ON the server (a Linux
# shared host you SSH into). Brings the current checkout to a running
# production state in place: deps, assets, migrations, seed, cache warm.
#
#   bash scripts/deploy-web.sh --seed --url https://kegelee.com
#
# Typical SSH workflow:  cd ~/kegelee && git pull && bash scripts/deploy-web.sh --seed
#
# Docroot: point the domain at this project's  public/  folder (or symlink
#   ~/public_html -> <project>/public). The public disk writes into
#   public/storage, so no storage symlink gymnastics are required.
#
# Options:
#   --fresh                 Rebuild the DB from scratch (migrate:fresh). DESTROYS
#                           DATA. Needs --force (or a 'yes' prompt). Implies --seed.
#   --seed                  Seed production content + ensure the admin account.
#   --admin-email <email>   Initial admin email (else ADMIN_EMAIL in .env).
#   --admin-password <pw>   Initial admin password (else generated + printed once).
#   --skip-composer         Reuse the existing vendor/ (no composer install).
#   --skip-npm              Reuse the existing public/build (no asset rebuild).
#   --url <base>            Health-check <base>/up and <base>/admin/login after.
#   --force, --yes, -y      Skip the destructive-action confirmation.
#   -h, --help              Show this help.
#
# Safe to re-run: without --fresh it never drops data, and the admin account is
# only created when one does not already exist.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

FRESH=0; SEED=0; SKIP_COMPOSER=0; SKIP_NPM=0; FORCE=0
ADMIN_EMAIL_ARG=""; ADMIN_PASSWORD_ARG=""; URL=""
PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-composer}"

while [ $# -gt 0 ]; do
  case "$1" in
    --fresh)          FRESH=1; SEED=1 ;;
    --seed)           SEED=1 ;;
    --admin-email)    ADMIN_EMAIL_ARG="${2:-}"; shift ;;
    --admin-password) ADMIN_PASSWORD_ARG="${2:-}"; shift ;;
    --skip-composer)  SKIP_COMPOSER=1 ;;
    --skip-npm)       SKIP_NPM=1 ;;
    --url)            URL="${2:-}"; shift ;;
    --force|--yes|-y) FORCE=1 ;;
    -h|--help)        sed -n '2,40p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'; exit 0 ;;
    *)                echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
step() { printf "\n${C}==> %s${N}\n" "$1"; }
die()  { printf "${R}ERROR: %s${N}\n" "$1" >&2; exit 1; }

command -v "$PHP_BIN" >/dev/null 2>&1 || die "'php' not found on PATH."

printf "${G}Kegelee - Production web deploy (server)${N}\n"
echo "Project: $ROOT"

# --fresh is destructive: confirm before wiping.
if [ "$FRESH" -eq 1 ] && [ "$FORCE" -ne 1 ]; then
  printf "${Y}--fresh will DROP ALL TABLES and rebuild the database.${N}\n"
  read -r -p "Type 'yes' to continue: " ans
  [ "$ans" = "yes" ] || die "Aborted."
fi

# 0. .env + APP_KEY
step "Checking environment (.env / APP_KEY)"
if [ ! -f .env ]; then
  [ -f .env.example ] || die "No .env and no .env.example to copy from."
  cp .env.example .env
  printf "${Y}    Created .env from .env.example - review it before going live.${N}\n"
fi
if ! grep -qE '^APP_KEY=.+' .env; then
  printf "${Y}    APP_KEY empty - generating.${N}\n"
  "$PHP_BIN" artisan key:generate --force
fi

# 1. Clear stale caches from a previous deploy first.
step "Clearing stale caches"
"$PHP_BIN" artisan optimize:clear

# 2. PHP dependencies
if [ "$SKIP_COMPOSER" -eq 0 ]; then
  step "Installing PHP dependencies (composer)"
  command -v "$COMPOSER_BIN" >/dev/null 2>&1 || die "'composer' not found (use --skip-composer)."
  "$COMPOSER_BIN" install --no-dev --optimize-autoloader --no-interaction --prefer-dist
else
  step "Skipping composer install (--skip-composer)"
fi

# 3. Front-end assets
if [ "$SKIP_NPM" -eq 0 ]; then
  step "Building front-end assets (npm)"
  command -v npm >/dev/null 2>&1 || die "'npm' not found (use --skip-npm)."
  npm ci
  npm run build
else
  step "Skipping asset build (--skip-npm)"
fi

# 4. Database schema
if [ "$FRESH" -eq 1 ]; then
  step "Rebuilding database (migrate:fresh --force)"
  "$PHP_BIN" artisan migrate:fresh --force
else
  step "Running migrations (migrate --force)"
  "$PHP_BIN" artisan migrate --force
fi

# 5. Production seed (content + admin)
if [ "$SEED" -eq 1 ]; then
  step "Seeding production content + admin"
  admin_email="${ADMIN_EMAIL_ARG:-}"
  [ -n "$admin_email" ] && export ADMIN_EMAIL="$admin_email"
  [ -n "$ADMIN_PASSWORD_ARG" ] && export ADMIN_PASSWORD="$ADMIN_PASSWORD_ARG"
  "$PHP_BIN" artisan db:seed --class=ProductionSeeder --force
  # Never leave the admin password lingering in the environment.
  unset ADMIN_PASSWORD || true
else
  step "Skipping seed (pass --seed to seed content + ensure admin)"
fi

# 6. Storage + production caches
step "Linking public storage"
"$PHP_BIN" artisan storage:link || printf "${Y}    (non-fatal - continuing)${N}\n"
mkdir -p public/storage

step "Warming production caches (config/route/view/event)"
"$PHP_BIN" artisan optimize

step "Restarting queue workers"
"$PHP_BIN" artisan queue:restart || true

# 7. Health check
if [ -n "$URL" ]; then
  base="${URL%/}"
  step "Health check: $base"
  if command -v curl >/dev/null 2>&1; then
    for path in /up /admin/login; do
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$base$path" || echo "000")
      printf "    %s -> HTTP %s\n" "$path" "$code"
    done
  else
    printf "${Y}    curl not found - skipping health check.${N}\n"
  fi
fi

printf "\n${G}Deploy complete.${N}\n"
