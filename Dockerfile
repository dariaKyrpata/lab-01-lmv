# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci

COPY tsconfig*.json ./
COPY client ./client
COPY server ./server
COPY shared ./shared
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
ARG BUILD_SHA=dev
LABEL org.opencontainers.image.revision=${BUILD_SHA}
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 BUILD_SHA=${BUILD_SHA} LOG_DIR=/app/logs
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/src ./server/src
COPY --from=build --chown=node:node /app/shared/package.json ./shared/package.json
COPY --from=build --chown=node:node /app/shared/src ./shared/src
COPY --from=build --chown=node:node /app/client/package.json ./client/package.json
COPY --from=build --chown=node:node /app/client/dist ./client/dist
RUN mkdir -p /app/logs && chown node:node /app/logs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>{process.exitCode=1})"
STOPSIGNAL SIGTERM
CMD ["node", "server/src/index.ts"]
