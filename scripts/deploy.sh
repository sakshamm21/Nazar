#!/usr/bin/env bash
# Stock AI — one-shot GitHub + Vercel deploy (macOS/Linux). Needs git, gh, vercel logged in.
# Usage: bash scripts/deploy.sh [repo-name] [--public]
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${1:-stockai}"; VIS="--private"; [[ "${2:-}" == "--public" ]] && VIS="--public"
[ -f .env.local ] || cp .env.example .env.local
get() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//'; }
[ -n "$(get OPENAI_API_KEY)" ] || { echo "Put OPENAI_API_KEY in .env.local first"; exit 1; }
if [ -z "$(get NEXTAUTH_SECRET)" ]; then
  S=$(openssl rand -base64 32); sed -i.bak "s#^NEXTAUTH_SECRET=.*#NEXTAUTH_SECRET=$S#" .env.local && rm -f .env.local.bak
fi
[ -d .git ] || git init -b main >/dev/null
git add -A; git diff --cached --quiet || git commit -m "Stock AI: AI-powered equity research platform" >/dev/null
if git remote | grep -q origin; then git push -u origin HEAD; else gh repo create "$REPO" $VIS --source . --remote origin --push; fi
vercel link --yes --project "$REPO"
if [ -z "$(get CRON_SECRET)" ]; then
  echo "CRON_SECRET=$(openssl rand -hex 24)" >> .env.local; echo "Generated CRON_SECRET"
fi
if [ -z "$(get INSIGHTS_KEY)" ]; then
  echo "INSIGHTS_KEY=$(openssl rand -hex 16)" >> .env.local; echo "Generated INSIGHTS_KEY"
fi
for NAME in OPENAI_API_KEY NEXTAUTH_SECRET DATABASE_URL CRON_SECRET INSIGHTS_KEY NEXTAUTH_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_ID GITHUB_SECRET ALLOWED_MODELS RATE_LIMIT_PER_MINUTE RATE_LIMIT_PER_DAY RATE_LIMIT_PER_DAY_IP USER_DAILY_BUDGET_USD GLOBAL_DAILY_BUDGET_USD GUARD_MODEL; do
  V="$(get $NAME)"; [ -n "$V" ] || continue
  for T in production development; do
    vercel env rm "$NAME" "$T" --yes >/dev/null 2>&1 || true
    printf '%s' "$V" | vercel env add "$NAME" "$T" >/dev/null
  done; echo "Set $NAME on Vercel"
done
[ -n "$(get DATABASE_URL)" ] || echo "WARN: no DATABASE_URL — Vercel uses an in-memory DB. Add Neon via Vercel > Storage and redeploy."
vercel git connect --yes >/dev/null 2>&1 || true
vercel deploy --prod --yes
