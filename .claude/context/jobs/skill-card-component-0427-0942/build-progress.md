# Skill Card Component — Build Progress

## SkillCard.vue
- Created `app/components/SkillCard.vue`
- Variants: `grid` (default), `list`, `compact`
- Signal modes: `installs`, `stars`, `auto`, `none`
- Toggles: `showDescription`, `showCopy`, `showOwnerAvatar`, `showOwnerPath`, `showTags`
- Internal copy state via `useClipboard({ copiedDuring: 2000 })`; `@click.stop.prevent` prevents NuxtLink navigation
- C1, C3-C13 met by component in isolation

## orgs/[owner].vue
- Replaced lines 471-514 with `<SkillCard :skill />` (default grid)
- Removed `copySkill` (useClipboard), `copiedName`, `copySkillCmd`, `formatCount`
- Kept `skillPath`/`skillSlug` for schema-org `hasPart`
- Kept `copyRepoInstall`/`repoCopiedKey`/`copyRepoCmd` (out of scope: repo header)
- Smoke test (C2): outer card classes match canonical exactly; inner markup adds one wrapper div for avatar slot (zero visual diff with `v-if` empty)

## skills/index.vue
- Official grid → `<SkillCard :skill :show-description="false" show-tags />`
- Official list → `<SkillCard :skill variant="list" :show-description="false" show-tags />`
- Community grid → `<SkillCard :skill :show-description="false" show-owner-path />`
- Community list → `<SkillCard :skill variant="list" :show-description="false" show-owner-path />`
- Removed `formatStars`
- Kept `copyCmd`/`copiedName`/`useClipboard` for the npm Algolia search results section (out of scope, contract C14 didn't account for this — flagged in known_limitations)

## nuxt.vue
- Replaced lines 346-374 with `<SkillCard :skill />`
- Removed `copySkill`, `copiedName`, `copySkillCmd`
- Kept `formatStars` (used at lines 223, 298 for stat display)
- Kept `skillPath`/`skillSlug` for schema-org

## index.vue (homepage)
- Replaced popular grid lines 446-473 with `<SkillCard :skill variant="compact" :show-copy="false" :show-owner-avatar="skill.official" show-owner-path />`
- Removed `skillSlug`, `skillInstallCmd`, `skillPath`
- Avatar binding `:show-owner-avatar="skill.official"` preserves the original conditional (avatar only on official skills)

## Verification
- All 4 routes 200 OK on dev (port 3001): `/orgs/github`, `/skills`, `/nuxt`, `/`
- SSR card counts: orgs/github 200, skills 57, nuxt 96, homepage 32
- C13: SkillCard.vue contains zero hardcoded color tokens (only `top-1/2` matched, which is spacing not color)
- C14: orgs/[owner].vue, nuxt.vue, index.vue clean of `copySkillCmd|copiedName`; skills/index.vue retains for npm search section (out of scope)