#!/usr/bin/env bash
# Build the cPanel deployment packages into dist/.
#
#   ./build-cpanel.sh
#
# Produces:
#   dist/streaks-cpanel.zip       full stack — extract into public_html
#   dist/streaks-frontend.zip     frontend only (API on a subdomain)
#   dist/streaks-backend-api.zip  API only
#   dist/DEPLOY.md                deployment guide
#
# Source CSS/TS is never deployed as-is: Next.js compiles it into
# content-hashed bundles under _next/static/chunks/. That hashing is what
# busts browser caches, so ALWAYS rebuild rather than hand-editing files on
# the server — the .htaccess marks _next/ immutable for a year.

set -euo pipefail
cd "$(dirname "$0")"
ROOT=$PWD
DIST=$ROOT/dist
PKG=$DIST/pkg

echo "==> cleaning"
rm -rf "$DIST"
mkdir -p "$PKG/public_html"

# ---------------------------------------------------------------- frontend --
# .env.local points the dev server at localhost:8080. If it is present during
# a production build, that URL is BAKED into the bundle and becomes the
# fallback whenever config.js is left empty — which is the same-domain
# default. Move it aside for the duration of the build.
cd "$ROOT/frontend"
ENV_LOCAL=$ROOT/frontend/.env.local          # absolute: the trap fires from $ROOT
RESTORE_ENV=0
if [ -f "$ENV_LOCAL" ]; then mv "$ENV_LOCAL" "$ENV_LOCAL.buildbak"; RESTORE_ENV=1; fi
restore_env() {
  if [ "$RESTORE_ENV" = 1 ] && [ -f "$ENV_LOCAL.buildbak" ]; then
    mv -f "$ENV_LOCAL.buildbak" "$ENV_LOCAL"
  fi
}
trap restore_env EXIT

echo "==> building frontend (static export)"
rm -rf out .next
NEXT_PUBLIC_API_BASE= npm run build

if grep -rq "localhost:8080" out/ 2>/dev/null; then
  echo "!! ABORT: localhost:8080 is baked into the bundle" >&2
  exit 1
fi
echo "    ok — no dev API origin in the bundle"

cd "$ROOT"
cp -R frontend/out/. "$PKG/public_html/"

# ----------------------------------------------------------------- backend --
echo "==> staging backend"
mkdir -p "$PKG/public_html/api"
cp -R backend/public backend/src backend/config backend/migrations backend/bin "$PKG/public_html/api/"
cp backend/.env.example "$PKG/public_html/api/.env.example"
find "$PKG" -name '.DS_Store' -delete

# ---------------------------------------------------------------- htaccess --
echo "==> writing .htaccess rules"
cp "$ROOT/deploy/htaccess-root"    "$PKG/public_html/.htaccess"
cp "$ROOT/deploy/htaccess-next"    "$PKG/public_html/_next/.htaccess"
cp "$ROOT/deploy/htaccess-api"     "$PKG/public_html/api/.htaccess"
for d in src config migrations bin; do
  cp "$ROOT/deploy/htaccess-deny" "$PKG/public_html/api/$d/.htaccess"
done
cp "$ROOT/deploy/DEPLOY.md" "$PKG/DEPLOY.md"
cp "$ROOT/deploy/DEPLOY.md" "$DIST/DEPLOY.md"

# --------------------------------------------------------------------- zip --
echo "==> zipping"
cd "$PKG/public_html"
zip -rqX "$DIST/streaks-cpanel.zip"   . -x '.DS_Store'
zip -rqX "$DIST/streaks-frontend.zip" . -x 'api/*' '.DS_Store'
cd "$PKG/public_html/api"
zip -rqX "$DIST/streaks-backend-api.zip" . -x '.DS_Store'
cd "$ROOT"; rm -rf "$PKG"

# The single most common packaging failure is losing the dotfiles.
n=$(unzip -Z1 "$DIST/streaks-cpanel.zip" | grep -c '\.htaccess$')
[ "$n" = "7" ] || { echo "!! ABORT: expected 7 .htaccess files in the zip, found $n" >&2; exit 1; }
echo "    ok — all 7 .htaccess files present"

echo
ls -lh "$DIST" | awk 'NR>1 {printf "    %-28s %s\n", $9, $5}'
echo
echo "Done. Upload dist/streaks-cpanel.zip into public_html and Extract."
