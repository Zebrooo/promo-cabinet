# promo-cabinet (админка РК) в контейнере — переезд на прод-машину, где всё
# живёт в Docker под Traefik, а Node на хосте нет.
#
# Сборка внутри образа, а не «rsync + npm build на хосте», как было на
# eremin.site: на проде некому запускать npm. env.ts читает переменные лениво
# и с дефолтами, поэтому build проходит без секретов — они нужны только в
# рантайме (env_file в compose).
FROM node:22-alpine AS deps
WORKDIR /app
# Приватный @zebrooo/promo-renderer из GitHub Packages. Токен — секретом
# сборки, не ARG: ARG остаётся в истории слоёв.
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=node_auth_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token)" \
    npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
# Не standalone-режим (он потребовал бы менять next.config.mjs — лишнее
# изменение при переезде): несём node_modules целиком и стартуем next start,
# как это делал systemd-юнит. Образ толще, поведение — ровно прежнее.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
# public/ в проекте нет — статика вся в .next; не копируем несуществующее,
# иначе COPY уронит сборку.
COPY package.json next.config.mjs ./
USER node
ENV NODE_ENV=production
EXPOSE 3190
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3190", "-H", "0.0.0.0"]
