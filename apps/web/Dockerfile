# Build the web dashboard and serve with nginx. Context must be the repo root.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --filter @farm/web... --frozen-lockfile=false
RUN pnpm --filter @farm/contracts build && pnpm --filter @farm/design-tokens build
RUN pnpm --filter @farm/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
