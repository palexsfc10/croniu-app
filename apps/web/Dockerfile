FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG GIT_SHA=unknown
ARG APP_VERSION=0.0.0-dev
ARG BUILD_TIME=
ARG NEXT_PUBLIC_APP_VERSION=$APP_VERSION
ARG NEXT_PUBLIC_GIT_SHA=$GIT_SHA
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG API_PROXY_TARGET=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV API_PROXY_TARGET=$API_PROXY_TARGET
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_GIT_SHA=$NEXT_PUBLIC_GIT_SHA
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
ARG GIT_SHA=unknown
ARG APP_VERSION=0.0.0-dev
ARG BUILD_TIME=
ARG NEXT_PUBLIC_APP_VERSION=$APP_VERSION
ARG NEXT_PUBLIC_GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.revision=$GIT_SHA
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.created=$BUILD_TIME
LABEL org.opencontainers.image.source="https://github.com/palexsfc10/croniu-app"

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV GIT_SHA=$GIT_SHA
ENV APP_VERSION=$APP_VERSION
ENV BUILD_TIME=$BUILD_TIME
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_GIT_SHA=$NEXT_PUBLIC_GIT_SHA
RUN addgroup -S croniu && adduser -S croniu -G croniu
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER croniu
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
