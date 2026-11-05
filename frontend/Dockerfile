# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Non-root nginx listening on 8080 (the port Cloud Run expects).
FROM nginxinc/nginx-unprivileged:1.30-alpine
USER root
RUN apk add --no-cache jq
USER 101
COPY --from=build /app/dist/doc-management/browser /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Scripts in /docker-entrypoint.d run before nginx starts; this one writes the runtime config.json.
COPY --chmod=755 docker/40-app-config.sh /docker-entrypoint.d/40-app-config.sh
