# ─── Build-Stage: komplette node_modules (auch fuer einmalige Migrations-Runs) ─
FROM node:22-alpine AS build
WORKDIR /app

# pnpm über corepack (Version aus package.json → deterministisch)
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Generierter Prisma-Client ist gitignored — im Image immer frisch erzeugen.
RUN pnpm exec prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* werden zur Build-Zeit eingebrannt.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm build

# ─── Laufzeit-Stage: nur standalone-Server (~150 MB, ohne Build-Tools) ────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Berlin \
    HOSTNAME=0.0.0.0

# Healthcheck-faehiges curl (Prisma-Engine liegt im standalone-Bundle nicht an —
# der Server laeuft ohne DB-Engine, Migrationen macht die Build-Stage).
RUN apk add --no-cache curl

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
