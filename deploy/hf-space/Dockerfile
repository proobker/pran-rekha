# Hugging Face Space: builds the public GitHub repo and runs the web app (5173) and API (127.0.0.1:4100)
# in one container. The API runs in demo mode, so it seeds synthetic accounts into an ephemeral SQLite file
# that resets whenever the Space restarts.
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/proobker/pran-rekha.git /app
WORKDIR /app
RUN npm ci && npm run build && chown -R node:node /app

USER node
EXPOSE 5173
CMD ["npm", "run", "start"]
