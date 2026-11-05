# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx nest build

FROM node:24-alpine
# Cloud Run sends traffic to 8080; the app reads PORT.
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
# Production dependencies only (no test tools, no pino-pretty).
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
