# ==============================================================================
# Agentic Playwright Test Writer - Unified Container
# Base: Official Microsoft Playwright image (includes Node, Chromium, Firefox, WebKit, and system dependencies)
# ==============================================================================
FROM mcr.microsoft.com/playwright:v1.50.0-noble

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Set working directory
WORKDIR /app

# Install git, curl, and certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# 1. Build & Prepare Conduit Demo App at build time
# Repository: https://github.com/gutentag2012/realworld-nextjs-trpc-prisma.git
# Commit:     1413fb9cc94409bdb47d904f9895084b050e900c
# ------------------------------------------------------------------------------
ARG CONDUIT_REPO=https://github.com/gutentag2012/realworld-nextjs-trpc-prisma.git
ARG CONDUIT_COMMIT=1413fb9cc94409bdb47d904f9895084b050e900c

RUN echo "Cloning Conduit demo app from ${CONDUIT_REPO} at commit ${CONDUIT_COMMIT}..." \
 && git clone ${CONDUIT_REPO} /app/conduit-app \
 && cd /app/conduit-app \
 && git checkout ${CONDUIT_COMMIT} \
 && cp .env.example .env \
 && npm install --legacy-peer-deps \
 && npx prisma generate \
 && npx prisma db push

# ------------------------------------------------------------------------------
# 2. Install Root Agent Project Dependencies
# ------------------------------------------------------------------------------
COPY package*.json ./
RUN npm install

# ------------------------------------------------------------------------------
# 3. Copy Application Source Code, Seed Database, and Entrypoint
# ------------------------------------------------------------------------------
COPY tsconfig.json ./
COPY src/ ./src/
COPY data/ ./data/
COPY evidence/ ./evidence/
COPY docker-entrypoint.sh ./

# Fix CRLF line endings (for Windows builds) and ensure execute permissions
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# ------------------------------------------------------------------------------
# 4. Runtime Configuration
# NOTE: Secrets like GEMINI_API_KEY are strictly passed at runtime via -e GEMINI_API_KEY
# ------------------------------------------------------------------------------
ENV PORT=3050 \
    APP_BASE_URL=http://localhost:3000 \
    NODE_ENV=production

# Expose default public agent dashboard port
EXPOSE 3050

# Docker healthcheck querying /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://127.0.0.1:' + (process.env.PORT || 3050) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));"

# Launch internal Conduit and public Agent Dashboard
ENTRYPOINT ["/app/docker-entrypoint.sh"]
