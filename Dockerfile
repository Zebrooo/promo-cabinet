# promo-cabinet (админка РК) в контейнере — переезд на прод-машину, где всё
# живёт в Docker под Traefik, а Node на хосте нет.
#
# Сборка внутри образа, а не «rsync + npm build на хосте», как было на
# eremin.site: на проде некому запускать npm. env.ts читает переменные лениво
# и с дефолтами, поэтому build проходит без секретов — они нужны только в
# рантайме (env_file в compose).
#
# Менеджер пакетов — pnpm, тот же lockfile (pnpm-lock.yaml), что и в CI.
# Раньше образ ставил зависимости через npm ci по package-lock.json, а CI —
# через pnpm по pnpm-lock.yaml; два lockfile расходились, и деплой падал на
# «lock file's … does not satisfy …», хотя CI был зелёным. Один lockfile —
# одна правда. pnpm ставим через npm (не corepack: у corepack в базовых
# образах случались устаревшие ключи подписи, и prepare падал).
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@9 --no-audit --no-fund
# Приватный @zebrooo/promo-renderer из GitHub Packages. Токен — секретом
# сборки, не ARG: ARG остаётся в истории слоёв.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=node_auth_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token)" \
    pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next лежит в node_modules/.bin — npm run работает и поверх pnpm-раскладки.
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
# Не standalone-режим (он потребовал бы менять next.config.mjs — лишнее
# изменение при переезде): несём node_modules целиком и стартуем next start,
# как это делал systemd-юнит. Образ толще, поведение — ровно прежнее.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
# public/ — только service worker Web Push (sw.js): его Next отдаёт как есть
# с корня, поэтому в образ он нужен рядом с .next.
COPY --from=build /app/public ./public
COPY package.json next.config.mjs ./
USER node
ENV NODE_ENV=production
EXPOSE 3190
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3190", "-H", "0.0.0.0"]
