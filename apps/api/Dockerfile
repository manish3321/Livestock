# Build and run the API. Context must be the repository root.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --filter @farm/api... --frozen-lockfile=false
RUN pnpm --filter @farm/contracts build
RUN pnpm --filter @farm/api db:generate
RUN pnpm --filter @farm/api build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
WORKDIR /repo/apps/api
EXPOSE 4000
# Apply migrations, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
