# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ может отсутствовать в репозитории (пустые каталоги git не хранит), а финальный образ его копирует.
RUN mkdir -p public && npm run build && npm prune --omit=dev

# lab-runner — терминал учебного стенда (WebSocket ↔ SSH). Запускается из исходников через tsx.
FROM node:22-alpine AS labrunner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY lab-runner ./lab-runner
COPY src/lib/lab/ssh.ts src/lib/lab/token.ts ./src/lib/lab/
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "lab-runner/server.ts"]

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/content ./content
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
# При старте применяем миграции, затем запускаем сайт.
CMD ["sh", "-c", "node scripts/migrate.mjs && node_modules/.bin/next start"]
