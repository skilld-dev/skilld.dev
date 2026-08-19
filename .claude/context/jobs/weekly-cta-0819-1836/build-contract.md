# Build contract: weekly email CTAs

Job: `weekly-cta-0819-1836`

## What gets built

1. **`app/pages/_WeeklyBand.vue`** (colocated, single caller). New homepage band between
   Freshness and Publish. Two columns at `md:` and up, stacked below: copy on the left,
   a cropped render of the real weekly email on the right.
2. **`server/api/weekly/demo.get.ts`**. Cached endpoint returning the email as an HTML
   fragment plus its subject. Renders the real trending half through `renderWeekly`, so
   the homepage cannot drift from what the email actually sends.
3. **`renderWeeklyFragment()`** exported from `weekly-template.ts`. The existing
   `renderWeekly` keeps wrapping it in a full document.
4. **`server/routes/weekly/preview.get.ts`**. Production-safe full-page render of the
   same email, linked from the band.
5. **Trending CTA row** on `/skills/trending`, above the results.
6. **Copy fixes**: `login.vue`, `LikeButton.client.vue` (condition and text),
   `me/index.vue` toggle description.
7. **Removal** of the `home-freshness-watch` panel from `index.vue` and its now-orphaned
   CSS, since the new band replaces it.

## Honesty constraint

The demo shows the real trending half for the current week. The liked half is absent,
because an anonymous visitor has no likes, and fabricating one would put invented commit
messages against real people's repositories. The copy carries the liked half in words.

## Testable behaviours

- [C1] GIVEN the homepage, WHEN it renders, THEN a `#weekly` section exists between the
  freshness and publish sections.
- [C2] GIVEN the homepage, WHEN the demo endpoint returns rows, THEN the band shows at
  least one skill name that also appears in `/api/feed/trending`.
- [C3] GIVEN the homepage, WHEN the demo endpoint fails, THEN the band still renders its
  copy and CTA, and no error surfaces to the visitor.
- [C4] GIVEN the demo fragment, WHEN it renders, THEN its container carries
  `aria-hidden="true"` and contains no tabbable element in the page tab order.
- [C5] GIVEN a signed-out visitor, WHEN they view the band, THEN the primary CTA reads
  "See this week's" and points at `/weekly/preview`, not at `/login`.
- [C6] GIVEN `/weekly/preview`, WHEN requested in production mode, THEN it returns 200
  with `content-type: text/html`.
- [C7] GIVEN `/skills/trending`, WHEN a signed-out visitor loads it, THEN one CTA row
  appears above the results with a link to `/weekly/preview`.
- [C8] GIVEN a signed-in user who is receiving the weekly, WHEN they view either surface,
  THEN no subscribe CTA renders.
- [C9] GIVEN the like button on a skill detail page, WHEN a signed-in user likes a skill
  and has no weekly opt-out, THEN the nudge reads "Liked. Its changes land in your next
  weekly." and offers no setup link.
- [C10] GIVEN 375px width, WHEN the band renders, THEN the columns stack and the demo
  stays within the viewport with no horizontal scroll.
- [C11] GIVEN 768px width, WHEN the band renders, THEN the copy column and demo sit side
  by side.
- [C12] GIVEN dark mode, WHEN the band renders, THEN the band chrome uses dark tokens and
  the email panel stays light, framed by a visible border.
- [C13] GIVEN SSR, WHEN the homepage HTML is fetched without JavaScript, THEN it contains
  the band heading text.
- [C14] GIVEN reduced motion, WHEN the band enters, THEN no transform animation runs.

## Design expectations

DESIGN.md tokens only. Warm stone neutrals, rose as the single accent in the band (the
primary CTA), `rounded-lg`, 1px borders, no shadows, mono chrome, `py-12 md:py-16`,
`max-w-5xl`. Motion within the 400ms budget, fade plus 4px rise, opacity-only under
reduced motion.

Design principle expressed: "the interface recedes; the curation speaks." The band's
visual interest is the email itself, so the band adds no atmosphere layer of its own.

## Out of scope

- Inline CTAs templated across `/gh/*` skill pages. The index is still recovering from
  the 2026-06 suppression and those pages have no measured traffic.
- A `useWeeklyStatus` composable and its endpoint. The signed-in states read from the
  existing session user for now.
- Reading `skill_subscriptions` into the weekly. Separate change, separate review.
- A weekly archive at `/weekly/<date>`.
