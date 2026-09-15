#!/usr/bin/env bash
#
# Push the variables api/upload.js and api/users.js need from .env.local into
# the linked Vercel project, for all three environments.
#
#   bash vercel-env.sh --dry-run     show what would happen, change nothing
#   bash vercel-env.sh               do it
#
# Values are read from .env.local and never printed. .env.local is gitignored
# and this script contains no secrets, so it is safe to commit.
#
# Vercel applies environment variables to NEW deployments, so redeploy after
# running this — pushing a commit is enough.

set -euo pipefail

FILE=".env.local"
ENVIRONMENTS="production preview development"

# Must match the guards at the top of api/upload.js and api/users.js. A name
# added here and nowhere else silently does nothing; a name added there and not
# here produces "Server is not configured." in production, which is the whole
# reason this script exists.
VARS="B2_KEY_ID B2_APP_KEY B2_BUCKET B2_ENDPOINT B2_REGION B2_PUBLIC_BASE \
SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY"

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

[ -f "$FILE" ] || {
  echo "No $FILE. Run: npx vercel env pull $FILE" >&2
  exit 1
}

# Strips CR (the file may have CRLF line endings) and one layer of surrounding
# quotes, which is how `vercel env pull` writes values.
value_of() {
  sed -n "s/^$1=//p" "$FILE" | head -1 | tr -d '\r' |
    sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}

# ---------------------------------------------------------------- check first
# Fail before touching the project rather than halfway through, so a typo does
# not leave some environments updated and others not.
missing=""
for v in $VARS; do
  [ -n "$(value_of "$v")" ] || missing="$missing $v"
done
if [ -n "$missing" ]; then
  echo "Missing or empty in $FILE:$missing" >&2
  exit 1
fi

echo "Source:       $FILE"
echo "Environments: $ENVIRONMENTS"
echo "Variables:    $(echo $VARS | wc -w) (values hidden)"
echo

# One cheap sanity check worth having, because these two disagreeing is the
# exact mistake that sent uploads to one bucket and URLs to another.
bucket="$(value_of B2_BUCKET)"
base="$(value_of B2_PUBLIC_BASE)"
case "$base" in
*"$bucket"*) ;;
*)
  echo "WARNING: B2_PUBLIC_BASE does not mention B2_BUCKET ($bucket). Check both."
  echo
  ;;
esac

if [ "$DRY" = "1" ]; then
  for v in $VARS; do
    printf '  would set %-28s -> %s\n' "$v" "$ENVIRONMENTS"
  done
  echo
  echo "Dry run only. Re-run without --dry-run to apply."
  exit 0
fi

# ---------------------------------------------------------------------- apply
#
# --force overwrites an existing value, so there is no remove-then-add dance
# and re-running this is safe.
#
# --value rather than piping on stdin: `vercel env add NAME preview` takes an
# optional positional git-branch, and when the value arrives on stdin the CLI
# consumes it answering that prompt instead. Every Preview write then fails.
# The value is briefly visible in the process list, which is the trade for a
# documented non-interactive path; nothing is written to shell history, since
# the script reads from the file itself.
#
# Failures are reported, never swallowed. Hiding them is what let a completely
# empty Preview environment look like success.
failed=""
for v in $VARS; do
  val="$(value_of "$v")"
  ok=""
  for e in $ENVIRONMENTS; do
    if npx vercel env add "$v" "$e" --value "$val" --force --yes >/dev/null 2>&1; then
      ok="$ok $e"
    else
      failed="$failed $v/$e"
    fi
  done
  printf '  %-28s ->%s\n' "$v" "${ok:- none}"
done

echo
if [ -n "$failed" ]; then
  echo "FAILED:$failed" >&2
  echo "Re-run, or add those by hand with: npx vercel env add <name> <environment>" >&2
  exit 1
fi

echo "Done. Verify with:  npx vercel env ls"
echo "Redeploy for these to take effect (pushing a commit is enough)."
