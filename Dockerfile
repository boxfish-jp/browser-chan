FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ src/
COPY cli/ cli/
RUN pnpm run build

ENV BROWSER_CHAN_HOST=127.0.0.1
ENV BROWSER_CHAN_PORT=3000
ENV BROWSER_CHAN_PROFILE_DIR=/app/browser-profile

CMD ["node", "dist/src/index.js"]
