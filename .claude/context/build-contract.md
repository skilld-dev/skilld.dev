# Build Contract: Skill Detail Pages

## What will be built

### API
- `server/api/skills/[...slug].get.ts`: fetches skill metadata from the skills sitemap cache, attempts to load the SKILL.md content from GitHub, and cross-references curators whose collections include this skill

### Pages
- `app/pages/skills/[...slug].vue`: dedicated detail page for a single skill, showing metadata, install command, curator endorsements, SKILL.md content, and source links

### Modifications
- `app/pages/skills.vue`: grid items become `NuxtLink` elements pointing to `/skills/{owner}/{name}`

## Testable Behaviors

### Interaction assertions
- [C1] GIVEN a skill detail page is loaded, WHEN the user clicks "Copy" on the install command, THEN the clipboard contains the `skilld add {owner}/{name}` string
- [C2] GIVEN the skills list page at /skills, WHEN the user clicks a skill card, THEN they navigate to /skills/{owner}/{name}
- [C3] GIVEN a skill detail page with curator endorsements, WHEN the user clicks a curator's name, THEN they navigate to /people/{handle}
- [C4] GIVEN a skill detail page with a collection link, WHEN the user clicks the collection name, THEN they navigate to /people/{handle}/{slug}
- [C5] GIVEN a skill detail page, WHEN the user clicks the "View on skills.sh" link, THEN a new tab opens to the skills.sh URL
- [C6] GIVEN a skill detail page, WHEN the user clicks the "View source" link, THEN a new tab opens to the GitHub repository
- [C7] GIVEN a skill detail page, WHEN the user clicks the back link, THEN they navigate to /skills

### State assertions
- [C8] GIVEN the API is loading, WHEN the page renders, THEN skeleton placeholders are visible with aria-busy="true"
- [C9] GIVEN the API returns a 404 (skill not found), WHEN the page renders, THEN an error state shows "Couldn't find this skill" with a link back to /skills
- [C10] GIVEN the API returns a network error, WHEN the page renders, THEN an error state shows with a "Retry" button
- [C11] GIVEN the skill exists but no curators include it, WHEN the page renders, THEN the curators section shows an empty state: "No curators have added this skill yet."
- [C12] GIVEN the skill exists but SKILL.md fetch fails, WHEN the page renders, THEN the page still renders all other sections without the content preview

### Responsive assertions
- [C13] GIVEN a viewport of 375px width, WHEN the skill detail page renders, THEN all content fits without horizontal overflow and the install command block truncates with ellipsis
- [C14] GIVEN a viewport of 768px width, WHEN the skill detail page renders, THEN the layout uses the max-w-3xl container with appropriate padding

### Dark mode assertion
- [C15] GIVEN dark mode is active, WHEN the skill detail page renders, THEN all surfaces use warm stone backgrounds (oklch 0.14-0.22 range), text is readable at 4.5:1+ contrast, and the install command block uses bg-muted

### Accessibility assertion
- [C16] GIVEN the page is loaded, WHEN a keyboard user tabs through, THEN focus moves in logical order: back link, install copy button, curator links, source links, with visible focus rings

### SSR assertion
- [C17] GIVEN a request to /skills/harlanzw/nuxt, WHEN the server renders the HTML, THEN the response contains the skill name, owner, and install command in the initial HTML

## Design Expectations

**Theme**: stone (warm editorial, existing design system)

**Design principle applied**: Quiet + Progressive Data Discovery

The page follows the existing collection detail page pattern (`/people/[handle]/[slug].vue`) as the closest structural analog: single-entity detail view with header, metadata, related items, and provenance.

**Layout structure**:
1. Header section (max-w-3xl): back breadcrumb, skill name in mono text-xl, owner as muted mono link, install command block with copy button
2. Curators section: section-label "Curators using this skill", list of curator cards linking to their profiles and the specific collection containing this skill
3. Content section (collapsible, default open): rendered SKILL.md content if available, otherwise a link to view on skills.sh
4. Source section: external links to skills.sh and GitHub repo

**Visual weight**: quiet, border-driven. Same card and spacing patterns as collection detail. No extra embellishment. Mono font for all chrome, sans-serif only if rendering markdown body content.

## Out of scope

- Editing or creating skills from the detail page
- Download/install count display (against brand guidelines)
- Skill versioning or changelog
- Comments or ratings
- Related skills recommendations
