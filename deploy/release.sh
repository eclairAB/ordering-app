#!/usr/bin/env bash
# Gate, package and publish a release.
#
#   pnpm release [version] [--no-push]
#
# 1. Runs lint, typecheck, tests and build; stops at the first failure.
# 2. Packages release/ordering-app-<version>.tar.gz (+ .sha256). The bundle has no
#    node_modules: better-sqlite3 is native, so install on the target host itself.
# 3. Unless --no-push: tags v<version> and publishes the tarball plus an index page
#    to the gh-pages branch. main is never modified.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

push=1
version=""
for arg in "$@"; do
  case "$arg" in
    --no-push) push=0 ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) version="$arg" ;;
  esac
done

sha="$(git rev-parse --short HEAD)"
version="${version:-$(date -u +%Y.%m.%d)-$sha}"
name="ordering-app-$version"
tag="v$version"

step() { printf '\n==> %s\n' "$*"; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean; commit or stash first so the release matches $sha." >&2
  exit 1
fi
if (( push )) && git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "Tag $tag already exists; pass a different version." >&2
  exit 1
fi

step "Install"
pnpm install --frozen-lockfile

step "Lint";      pnpm lint
step "Typecheck"; pnpm typecheck
step "Test";      pnpm test
step "Build";     pnpm build

step "Package $name"
out="$root/release"
stage="$out/$name"
rm -rf "$stage"
mkdir -p "$stage"

# Keep the workspace layout: the server finds the apps at ../../<app>/dist.
git archive HEAD \
  package.json pnpm-lock.yaml pnpm-workspace.yaml .env.example README.md \
  apps/server packages/shared \
  apps/customer/package.json apps/staff/package.json \
  | tar -x -C "$stage"
find "$stage" -name '*.test.ts' -delete
for app in customer staff; do
  cp -r "apps/$app/dist" "$stage/apps/$app/dist"
done

cat > "$stage/INSTALL.txt" <<EOF
ordering-app $version (commit $sha)

  pnpm install --prod --frozen-lockfile
  cp .env.example .env      # set STAFF_PASSCODE and SHOP_TIMEZONE
  NODE_ENV=production pnpm start

Requires Node 22.18+ and pnpm. Migrations run on server start.
EOF

tar -czf "$out/$name.tar.gz" -C "$out" "$name"
rm -rf "$stage"
(cd "$out" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
echo "Created release/$name.tar.gz"

if (( ! push )); then
  echo "--no-push: skipping tag and gh-pages."
  exit 0
fi

step "Publish to gh-pages"
wt="$(mktemp -d)"
cleanup() { git worktree remove --force "$wt" 2>/dev/null || true; rm -rf "$wt"; }
trap cleanup EXIT

if git fetch -q origin gh-pages 2>/dev/null; then
  git worktree add -q -B gh-pages "$wt" FETCH_HEAD
else
  git worktree add -q --orphan -b gh-pages "$wt"
fi

mkdir -p "$wt/releases"
cp "$out/$name.tar.gz" "$out/$name.tar.gz.sha256" "$wt/releases/"
touch "$wt/.nojekyll"

# Regenerate the download page from whatever is in releases/, newest first.
{
  cat <<'EOF'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ordering-app releases</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; }
  li { margin: .5rem 0; } code { font-size: .8em; word-break: break-all; color: #555; }
</style>
</head>
<body>
<h1>ordering-app releases</h1>
<p>Unpack, then follow <code>INSTALL.txt</code> inside the archive.</p>
<ul>
EOF
  for f in $(ls "$wt"/releases/*.tar.gz | sort -rV); do
    base="$(basename "$f")"
    sum="$(cut -d' ' -f1 "$f.sha256")"
    printf '<li><a href="releases/%s">%s</a><br><code>sha256 %s</code></li>\n' "$base" "$base" "$sum"
  done
  echo '</ul>'
  echo '</body>'
  echo '</html>'
} > "$wt/index.html"

git -C "$wt" add -A
git -C "$wt" commit -q -m "Release $version ($sha)"
git tag -a "$tag" -m "Release $version" HEAD
git -C "$wt" push origin gh-pages
git push origin "$tag"
echo "Published $tag to gh-pages."
