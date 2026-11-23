FROM node:24-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package manifests for workspace caching
COPY package*.json ./
COPY packages/contracts/package*.json ./packages/contracts/
COPY packages/domain/package*.json ./packages/domain/
COPY server/package*.json ./server/
COPY apps/web/package*.json ./apps/web/

RUN npm ci

# Copy full source tree
COPY tsconfig.base.json ./
COPY packages ./packages
COPY server ./server
COPY apps/web ./apps/web

# Build contracts, domain, server, and Next.js web application
ENV DEMO_MODE=true
ENV NEXT_PUBLIC_DEMO_MODE=true
RUN npm run build

# Prepare persistent or ephemeral database directory
RUN mkdir -p .data && chown -R node:node /app

USER node

# Render injects PORT for public HTTP traffic (typically 10000)
ENV PORT=10000
ENV API_PORT=4100
ENV DATABASE_PATH=.data/pran-rekha-demo.sqlite

EXPOSE 10000

CMD ["npm", "run", "start"]
