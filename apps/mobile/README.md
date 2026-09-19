# Farm mobile (Expo) — native React Native

Native client in the same monorepo as `apps/web`. **Does not use WebView as the primary UI.** Shares `@farm/contracts`, design tokens, and the Nest API.

## Run

```bash
pnpm install
pnpm --filter @farm/contracts build
pnpm --filter @farm/design-tokens build
cp apps/mobile/.env.example apps/mobile/.env
pnpm dev:api
pnpm --filter @farm/mobile start
```

`EXPO_PUBLIC_API_URL` — Android emulator `http://10.0.2.2:4001`

## Shell

- Top bar: farm name, language, sign out
- Tabs: **Home · Shed · Inbox · More**
- Ember **Scan FAB** (camera QR from any screen)
- More drawer: moss green, full module list (role-aware)
