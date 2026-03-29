# Build Contract: Homepage

## What will be built

**Page**: `app/pages/index.vue` (orchestrator, <200 lines)

**Components**:
- `app/components/CuratorCard.vue` — avatar, name, @handle, stack badges, collection count
- `app/components/CollectionCard.vue` — name, description, curator inline, skill count, copy install command
- `app/components/AppLogo.vue` — skilld wordmark (mono text)

**Shell update**: `app/app.vue` — rebrand header/footer for skilld

**Sections**:
1. Hero: tagline, two CTAs (browse curators, install CLI)
2. Featured curators: 6 curator cards in responsive grid
3. Featured collections: 4-5 collection cards with curator attribution
4. CTA: final call to action

**Mock data**: fictional curators with ui-avatars.com avatars, realistic stacks and collection names.

## Testable Behaviors

### Interactions
- [C1] GIVEN homepage loaded, WHEN user hovers a curator card, THEN card border color changes and subtle rose glow appears
- [C2] GIVEN homepage loaded, WHEN user clicks "Browse curators" hero CTA, THEN page scrolls to #curators section
- [C3] GIVEN homepage loaded, WHEN user clicks a collection's copy button, THEN install command is copied to clipboard and icon shows check confirmation
- [C4] GIVEN homepage loaded, WHEN user clicks a curator card, THEN navigates to /people/[handle]
- [C5] GIVEN homepage loaded, WHEN user clicks a collection card title, THEN navigates to /people/[handle]/[slug]

### State
- [C6] GIVEN homepage, WHEN page loads, THEN curators section shows 6 cards with avatars, names, handles, and stack badges
- [C7] GIVEN homepage, WHEN page loads, THEN collections section shows at least 4 collection cards with curator attribution
- [C8] GIVEN homepage, WHEN page loads, THEN hero shows tagline and two CTA buttons (primary + secondary)

### Responsive
- [C9] GIVEN viewport 375px, WHEN page loads, THEN curator cards stack in single column, no horizontal overflow
- [C10] GIVEN viewport 768px, WHEN page loads, THEN curator cards display in 2-column grid, collections in 2-column grid

### Dark Mode
- [C11] GIVEN dark mode (default), WHEN page loads, THEN all surfaces use warm-tinted backgrounds (oklch with chroma >0), no pure black or gray

### Accessibility
- [C12] GIVEN keyboard navigation, WHEN user tabs through page, THEN all interactive elements (CTAs, cards, copy buttons) receive visible focus rings

### SSR
- [C13] GIVEN SSR pre-render, WHEN HTML is served, THEN response contains curator names, collection titles, and hero tagline before hydration

## Design Expectations

- **Principle**: "We prioritize human warmth over technical precision"
- **Headings**: font-mono (IBM Plex Mono), section labels use .section-label utility
- **Body**: font-sans (Plus Jakarta Sans)
- **Cards**: rounded-xl, border border-[var(--ui-border)], hover transitions
- **Avatars**: rounded-full, stacked with -space-x-2 for groups
- **Badges**: subtle variant for stack labels
- **Spacing**: generous py-16 md:py-24 between sections
- **Color**: rose accent on primary CTAs only; 60-30-10 split

## Out of Scope

- Authentication / sign up flow
- Working /people/[handle] or /skills/[pkg] pages (links point to future routes)
- Real data fetching (all mock data)
- Search functionality
- Mobile hamburger nav (keep simple header)
- OG image generation
