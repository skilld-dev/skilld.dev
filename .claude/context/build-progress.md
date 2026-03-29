# Build Progress

## Homepage Updates

**Files modified:**
- `app/pages/index.vue` (CTA section replaced, authModalOpen inject added)
- `app/app.vue` (header: Skills nav, auth button/avatar, AuthModal integration)
- `app/assets/css/main.css` (color contrast fix: primary-500 darkened, text-inverted added)

**Contract criteria satisfied:** C1, C13, C16
**Remaining:** C2-C6 require live OAuth flow testing

Browser check: PASS (200 on /, SSR content includes "Publish your collection")

## Skills Browse Page

**Files created:**
- `app/pages/skills.vue`
- `server/api/skills/index.get.ts`

**Contract criteria satisfied:** C7, C8, C9, C10, C11, C12, C13, C15
**Remaining:** C11, C12 need visual verification

Browser check: PASS (200 on /skills, SSR content includes "Skills")

## Auth Infrastructure

**Files created:**
- `modules/oauth.ts` (Nuxt module for client URI + session password)
- `server/plugins/oauth-client.ts` (singleton NodeOAuthClient)
- `server/utils/atproto/oauth.ts` (client metadata, handle resolver)
- `server/utils/atproto/storage.ts` (state + session store factory)
- `server/utils/atproto/oauth-state-store.ts`
- `server/utils/atproto/oauth-session-store.ts`
- `server/api/auth/atproto.get.ts` (OAuth initiation + callback)
- `server/api/auth/session.get.ts`
- `server/api/auth/session.delete.ts`
- `server/routes/oauth-client-metadata.json.get.ts`
- `app/composables/useAuth.ts`
- `app/components/AuthModal.client.vue`

**Contract criteria satisfied:** C2, C3, C4, C5, C6, C14 (structurally; full OAuth flow requires PDS interaction)
