# Clickpoint — production image.
# Records live in Postgres (DATABASE_URL), so the container needs no volume.
# Background pathway generation runs through after() in pipeline.ts, which
# keeps the process alive past the HTTP response.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env is not needed; all secrets are read at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run unprivileged.

# Headless Chromium for card verification (verifyCard.ts): every generated
# card must actually run — scripts execute, sliders drag, canvases paint —
# before it ships to a learner. Alpine's chromium needs its runner deps.
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npm", "run", "start"]
