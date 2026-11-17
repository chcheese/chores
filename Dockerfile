# syntax=docker/dockerfile:1

# ---- toolchain for native modules (better-sqlite3) --------------------------
FROM node:24-bookworm-slim AS toolchain
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# ---- build: install all deps, build web + server ---------------------------
FROM toolchain AS build
WORKDIR /src
COPY app/package.json app/package-lock.json ./
COPY app/server/package.json server/
COPY app/web/package.json web/
RUN npm ci --no-audit --no-fund
COPY app/server server
COPY app/web web
RUN npm run build -w web && npm run build -w server \
 && npm test -w server

# ---- prod deps only ---------------------------------------------------------
FROM toolchain AS deps
WORKDIR /src
COPY app/package.json app/package-lock.json ./
COPY app/server/package.json server/
COPY app/web/package.json web/
RUN npm ci --omit=dev --workspace server --no-audit --no-fund

# ---- runtime ----------------------------------------------------------------
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIST=/app/web \
    APP_TZ=Europe/Zurich \
    TZ=Europe/Zurich
WORKDIR /app/server
COPY --from=deps /src/node_modules /app/node_modules
COPY --from=build /src/server/dist ./dist
COPY --from=build /src/server/drizzle ./drizzle
COPY --from=build /src/server/package.json ./
COPY --from=build /src/web/dist /app/web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
