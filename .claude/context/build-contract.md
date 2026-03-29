# Build Contract: Onboarding + Skills Browse

## What will be built

### Home page updates
- Replace "Share your skill set" CTA with "Publish your collection" that opens auth modal
- Fix color contrast on solid primary buttons (WCAG AA)
- Add "Skills" nav link to header
- Add auth button/avatar to header

### Auth modal (`AuthModal.client.vue`)
- Bluesky handle input with validation
- "Connect with Bluesky" button initiating AT Protocol OAuth
- Connected state showing avatar and handle
- Disconnect action
- Loading and error states

### Server auth (AT Protocol OAuth, adapted from npmx.dev)
- `modules/oauth.ts` Nuxt module for client URI config
- `server/plugins/oauth-client.ts` singleton OAuth client
- `server/utils/atproto/` state store, session store, helpers
- `server/api/auth/atproto.get.ts` OAuth initiation + callback
- `server/api/auth/session.get.ts` current session
- `server/api/auth/session.delete.ts` logout
- `server/routes/oauth-client-metadata.json.get.ts` client metadata

### Auth composable (`useAuth.ts`)
- Reactive user session state
- Login redirect and logout methods

### Skills browse page (`/skills`)
- Server route fetching skills from skills.sh sitemap
- Search input with real-time filtering
- Grid of skill cards showing name, owner, install command
- Loading skeleton and error states

## Testable behaviors

[C1] GIVEN unauthenticated user, WHEN clicking "Publish your collection" CTA, THEN auth modal opens
[C2] GIVEN auth modal open, WHEN entering valid Bluesky handle and clicking Connect, THEN browser redirects to Bluesky OAuth endpoint
[C3] GIVEN OAuth callback success, WHEN redirected back, THEN session is set and header shows avatar + handle
[C4] GIVEN authenticated user, WHEN clicking avatar in header, THEN dropdown shows handle and disconnect option
[C5] GIVEN auth modal, WHEN submitting empty handle, THEN validation error displayed
[C6] GIVEN authenticated user, WHEN clicking disconnect, THEN session cleared and UI updates to unauthenticated state
[C7] GIVEN /skills page, WHEN loaded, THEN skills grid displayed with search input visible
[C8] GIVEN /skills page, WHEN typing "vue" in search, THEN only skills matching "vue" shown
[C9] GIVEN /skills data loading, WHEN fetch in progress, THEN loading skeleton visible
[C10] GIVEN /skills fetch failure, WHEN error occurs, THEN error message with retry button shown
[C11] GIVEN /skills page at 375px width, THEN single column layout with no horizontal overflow
[C12] GIVEN /skills page at 768px width, THEN 2-column grid layout
[C13] GIVEN dark mode active, THEN all new components use semantic tokens (no hardcoded colors)
[C14] GIVEN keyboard user, WHEN tabbing through auth modal, THEN focus order: handle input, connect button, close button
[C15] GIVEN SSR request to /skills, THEN HTML contains skill cards before hydration
[C16] GIVEN header nav on any page, THEN "Skills" link navigates to /skills

## Design expectations

- Quiet theme: warm stone neutrals, rose accent only on primary CTAs
- Auth modal: border-driven card with surface-warm background, mono font on inputs/buttons
- Skills page: same section-label pattern, compact cards, progressive disclosure (click to expand)
- Header auth: small avatar + mono handle text, ghost variant for sign-in button

## Out of scope

- Collection creation/editing UI (future phase)
- Curator profile pages
- Skill detail pages
- Real-time sync with Bluesky feeds
- Production Redis/KV session storage (dev uses file storage)
- JWK signing keys for confidential OAuth client
