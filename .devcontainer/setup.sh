#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " Running GitHub Codespaces postCreateCommand setup..."
echo " Time: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "=========================================================="

# 1. Install Agent platform dependencies
echo "[1/3] Installing root application npm packages..."
npm install

# 2. Install Playwright browser and Linux system dependencies
echo "[2/3] Installing Playwright Chromium browser and dependencies..."
npx playwright install --with-deps chromium

# 3. Clone and configure Conduit demo app at pinned commit
CONDUIT_REPO="https://github.com/gutentag2012/realworld-nextjs-trpc-prisma.git"
CONDUIT_COMMIT="1413fb9cc94409bdb47d904f9895084b050e900c"

if [ ! -d "conduit-app" ]; then
  echo "[3/3] Cloning Conduit demo app from $CONDUIT_REPO..."
  git clone "$CONDUIT_REPO" conduit-app
  cd conduit-app
  git checkout "$CONDUIT_COMMIT"
  cp .env.example .env
  npm install --legacy-peer-deps
  npx prisma generate
  npx prisma db push
  cd ..
else
  echo "[3/3] conduit-app directory already exists. Ensuring Prisma client is generated..."
  cd conduit-app
  npx prisma generate
  cd ..
fi

echo "=========================================================="
echo " GitHub Codespaces postCreateCommand setup complete!"
echo " Start the stack with: npm run codespace:start"
echo "=========================================================="
