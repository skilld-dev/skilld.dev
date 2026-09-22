# The SKILL.md management thread, April 2026

https://x.com/Mappletons/status/2048789569189957840

> Strategic response to the viral "How is everyone managing their SKILL.md files?" thread (Apr 28 2026, 65K views). Captures the market signal, the competitor audit, and the positioning sharpening that follows.

## 1. Source Signal

A tweet asking "how is everyone managing SKILL.md files, is it just chaos?" surfaced the entire Claude Code / Codex / Cursor power-user audience naming the same problem in real time. The replies cluster into three distinct lanes. Each lane is a different product. Only one is ours.

### Lane A: "Just sync the files" (DIY infrastructure)
Symlinks, dotfiles, Ansible playbooks, personal git repos with sync scripts. Roughly half the replies. Pain: working solutions held together with twine. They will not pay for tooling; they will copy good ideas.

### Lane B: "Build a manager" (CLI / plugin tooling)
Skill manager agents, thin wrappers, internal CLIs with hooks, CI/CD auto-update, skill-management skills. Pain: distribution and lifecycle are unsolved, cross-harness compatibility is broken.

### Lane C: "Hosted context platform" (SaaS / MCP, our direct competitors)
LFC.dev, sharedcontext.ai, Contextium, swarm.services, skillburst.ai, SkillSync MCP, AI Skills Manager, SkillsMP, ClawHub. Funded, shipping, fragmented. All solving plumbing.

### Lane D: "Skills are overrated" (the contrarians)
Just don't use them. ROI unclear. Trash folder. A real risk: if Anthropic ships a built-in manager that is "good enough", Lane D wins by default.

### Lane E: "Curation, not management" (the quiet pain, our lane)
Three replies, total. "Fewer more robust skills." "Skills written like operating docs: when to use, exact steps, gotchas. The boring part is the product." "I'm still struggling to get my agents to remember they HAVE skills."

This lane is small in the thread because nobody is articulating it yet. That is the opening.

## 2. Competitor Audit

Researched live, April 2026. The market is wider, larger, and more dangerous than the original tweet thread suggested.

### Distribution registries (volume plays)

| Player | Wedge | Weakness | Our angle |
|---|---|---|---|
| **Anthropic plugin marketplace** (`/plugin marketplace add anthropics/skills`, 125k stars on the official repo) | Built into Claude Code. Default install path. Enterprise partners: Atlassian, Canva, Cloudflare, Figma, Notion, Ramp, Sentry. | Anthropic builds infra, not a curated content layer. Enterprise-partner-first, not open-ecosystem-first. | We must ship as a Claude Code marketplace on Day 1: `/plugin marketplace add skilld-dev/skilld`. Be a *complement* to Anthropic's surface, not a replacement. |
| **skills.sh** | 91k skills, install-count leaderboard, multi-agent install | No curation, no taste, no people. Volume race. | Already in brand guidelines as the foil. We are the editorial answer. |
| **agentskill.sh** | 107k+ skills, security audit scores 0-100, defaults to grade-A only | Algorithmic security, no editorial taste, no people | We share the trust framing. They grade by automation; we vouch by humans. |
| **ClawHub** | Distribution registry. Low publishing barrier. | **335 malicious skills in Jan 2026 coordinated campaign**. The cautionary tale of the ecosystem. | The case study we cite when explaining why curation matters. |
| **SkillsMP / LobeHub Skills / VoltAgent awesome-agent-skills (1000+)** | Marketplace + community lists | Volume mechanics, no editorial filter | Volume plays. Same trap. |
| **alirezarezvani/claude-skills (13k stars, 235 skills)** | One opinionated maintainer, SkillCheck validation, security auditor, multi-tool conversion | Single person, single vision, no social layer | Closest *spirit* to us, but solo. We are the multi-curator version with identity. |

### Curation / quality layers (the lane we play in)

| Player | Wedge | Weakness | Our angle |
|---|---|---|---|
| **SkillHub** (`skillhub.club`) | **Closest direct threat**. 15k+ curated skills, AI-graded on 5 dimensions (Practicality, Clarity, Automation, Quality, Impact). S-rank (9.0+), A-rank (8.0+). Weekly newsletter. | LLM judges, not humans. No identity, no AT Protocol, no curators with reputations on the line. | Headline contrast: **human chosen, not AI graded**. SkillHub validates the editorial-curation thesis; we win on social identity and trust transfer. |
| **SkillSync MCP** | Security-gated install, 60+ threat patterns, dry-run sync | Security only, no editorial layer | Interesting trust angle to borrow at the install path. Not a positioning threat. |

### Sync / distribution (the lane we explicitly avoid)

| Player | Wedge | Weakness | Our angle |
|---|---|---|---|
| **sharedcontext.ai** | Git-backed skills, cross-platform sync, "context > prompts" framing | Sync is undifferentiated. Whose context? | We answer *whose*. They move bytes, we choose them. |
| **LFC.dev** | OSS alpha, artifact rollout for AI tools | No curation, early, generic | Becomes a downstream sync target for our registry, not a competitor for taste. |
| **swarm.services** | Cross-agent shared workspace memory | Solves a different problem (run state, not skill choice) | Out of lane. Ignore. |
| **Contextium.io** | MCP-based docs aggregation | Docs, not skills. No opinion. | Adjacent. We curate skills specifically, with version tracking. |

### Author tooling (adjacent, possible partners)

| Player | Wedge | Weakness | Our angle |
|---|---|---|---|
| **skillburst.ai** | "Release skills sanely" (closest to us in marketing language) | Author / publish lane, not curator / taste lane | Possible partner. They distribute, we curate. |
| **AI Skills Manager (ASM)** | Scaffold, validate, package, install lifecycle CLI | Author tooling, not discovery | Out of lane unless we ship `skilld author`. |
| **Anthropic skill-creator** | Official tool: write evals, run benchmarks, A/B test skill versions | Author-side quality only, not consumer-side discovery | We can recommend skill-creator outputs as a quality signal on our package skills. |
| **`reseed`, `cc-switch`, dotfile repos** | OSS personal sync | Solo, no curation | Free distribution surface for our skills. |

**Pattern**: every funded competitor either races on volume, automates curation, or solves plumbing. **Nobody owns "humans you can name vouching for skills you can audit."** That is the moat, if we claim it before someone else slaps "curated by experts" on a sync product.

## 2.5 The Trust Crisis (the unexpected wedge)

The research turned up an order-of-magnitude shift since the tweet was written. The skill ecosystem is exploding *and* compromised.

### The numbers
- **350k+ skills published in two months** (npm took a decade to reach 350k packages, per VentureBeat reporting on Anthropic's open-standard launch).
- **Snyk Feb 2026 audit** of 3,984 ClawHub + skills.sh skills: 13% contain a critical security flaw. 91% of malicious skills combine prompt injection with traditional malware. 1,467 malicious payloads. 76 confirmed via human-in-the-loop verification.
- **ClawHub Jan 2026**: a coordinated malware campaign shipped 335 malicious skills targeting API keys, wallet credentials, and browser passwords.
- **Frontier-model attack success rate**: up to 80% on skill-based attacks, per Feb 2026 research.
- **Publishing barrier on most registries**: a SKILL.md file and a one-week-old GitHub account. No code signing, no review, no sandbox.
- **OWASP Agentic Skills Top 10** released as a 2026 Edition.
- **Anthropic's own guidance**: "install skills only from trusted sources, thoroughly audit those from less-trusted origins."

### Why this matters for our positioning

Anthropic's recommendation is, literally, an invitation. Skilld is the trusted source by construction:

- **Package skills** are authored by skilld from official docs, regenerated on a known cadence, version-tracked. The supply chain stops at us. We are the upstream.
- **Guide skills** are vouched by named curators with public AT Protocol identities. Compromised handle = visible diff = cooling period. The supply chain stops at humans you can name.
- **No third-party publish-and-forget**. There is no "publish a SKILL.md from a 1-week-old account" path on skilld. That is the feature, not a limitation.

This converts the editorial frame from a *taste* argument to a *trust* argument. Both are true; trust is the harder-to-dismiss one and the one that matures into enterprise demand.

### Refined positioning

- **Surface line**: *Curated agent skills from trusted open-source developers.* (Unchanged. Now load-bearing.)
- **The trust frame**: *Every skill on skilld traces to a name you recognise. Either we authored it from official docs, or a named curator vouched for it. No anonymous uploads. No one-week-old accounts.*
- **Anti-pitch**: *We do not host random SKILL.md files. We do not have 91k skills. We have the ones you would actually install.*

## 3. The Pivot (and what does not change)

### What does not change
- Core thesis. Skills are knowledge, not packages. People-first discovery. Curators as the unit of trust. AT Protocol identity. (`SCOPE.md` and `brand-guidelines.md` already lock this in.)
- Two skill types: package skills (canonical, authored by skilld) and guide skills (community).
- Architecture: registry, MCP server, CLI. No rewrites.

### What sharpens
- **Public frame**: skilld is the editorial layer above the sync tools. They handle bytes. We handle taste *and* trust. Every public surface, post, README, and OG image leans on this.
- **Hero promise**: trust as a one-liner. `skilld add @danielroe/nuxt-stack` should output the curator's *rationale per skill* in the terminal. The install command IS the editorial moment.
- **Curator stack URLs**: `/people/[handle]/stack` becomes a single shareable preset. The viral surface every Lane A / B user wants but is hand-rolling.
- **"Why this skill?"**: a per-entry rationale field, surfaced everywhere collections are shown. The single uncopyable feature.
- **Compatibility badges**: every skill detail page shows which agents it works with (Claude Code, Codex, Cursor, Copilot, Gemini CLI). Cheap to add, expensive to lack. The Agent Skills open standard (Dec 2025, OpenAI adopted) makes this honest, not aspirational.
- **Provenance line on every skill**: human-readable trace. *"Authored by skilld from `vue@3.5.13` docs on 2026-04-22"* or *"Vouched by @danielroe on 2026-04-15."* Auditable by definition. This is also our answer to OWASP Agentic Skills Top 10.
- **Anthropic plugin marketplace integration**: ship `/plugin marketplace add skilld-dev/skilld` so we are reachable from inside Claude Code on Day 1. Do not fight the default surface, occupy it.

### What we explicitly will not build
- File sync engine, symlink manager, dotfile integration.
- Cross-machine memory or shared workspace state.
- Team-wide install governance, RBAC, deployment pipelines.
- Skill leaderboards, download-count sorts, popularity ranks.
- Author marketplace where third parties publish package skills (skilld authors them, full stop, until volume forces revisit).
- Any homepage variant that calls itself "AI-powered."

Saying no here is the strategy. Every word above pulls toward Lane C and dilutes the editorial brand.

## 4. Positioning Lines

Drop-in copy. Voice matches `brand-guidelines.md`: editorial, grounded, no hype, no contrast pattern, no em dashes.

### One-liner candidates (ordered by preference)
1. *Curated agent skills from trusted open-source developers.* (current, keep)
2. *Human chosen, not AI graded.*
3. *Skills curated by developers you already trust.*
4. *The editorial layer for AI agent skills.*

### Elevator (2 sentences)
*Skilld organises agent skills around developers you trust, not download counts. Follow a curator, install their stack with one command, re-sync when they update.*

### Sharpened "what we are not"
> Sync tools move skill files between machines. Marketplaces host them by the hundred thousand. Skilld decides which skill files are worth moving and which humans are worth trusting. No sync engine, no leaderboard, no popularity rank, no anonymous uploads. The signal is a developer you trust choosing it for their own workflow.

### The trust line (use when security comes up)
> Snyk found 13% of skills on the big registries contain critical security flaws. 335 malicious skills shipped on ClawHub in a single January campaign. Anthropic itself recommends installing only from trusted sources. Skilld is that source, by construction. Every skill traces to a name. Either we authored it from official docs, or a named curator vouched for it.

### Tweet for the response thread (when we publish)
*The thread is right: SKILL.md management is chaos. Sync tools fix the plumbing. Marketplaces brag about 91k skills you'd never install. Skilld is the editorial layer above both. Humans you can name, skills they actually use, one install command, the why per skill.*

## 5. Action Items

### This week
- [ ] **Homepage hero pass**. Strip any phrasing that reads as sync, lifecycle, or management. Lead with the editorial frame, with the trust line as the secondary beat. Touch points: `app/pages/index.vue`, hero subhead, the "How it works" copy.
- [ ] **"Why this skill?" rationale field**. Schema + UI for collection authoring. Smallest, highest-leverage product change. Touch points: collection author flow, collection detail page, skill card hover state.
- [ ] **Provenance line on every skill**. Human-readable trace: who authored, from what source, on what date. This is the auditable trust signal. Cheap to add to existing schema.
- [ ] **Public response post**. Quote the original viral thread, ship the positioning post on Bluesky and personal Twitter. Window is open right now. Lead with the trust angle, not the editorial one — security is the harder-to-dismiss frame.
- [ ] **Curator outreach**. Land 3 named curators with full stacks before any further marketing push. First targets: danielroe, atinux, sebastien chopin, pooya parsa, daniel kelly. Faces are the moat.

### Next 2-4 weeks
- [ ] **`/people/[handle]/stack` shareable preset URL**. One-line install command. The viral surface.
- [ ] **Skill detail page**. "Recommended by N curators" + agent compatibility badges + provenance line. The conversion surface.
- [ ] **MCP server v0.1** at `skilld.dev/api/mcp`. Edge-cached install resolution.
- [ ] **Anthropic plugin marketplace publish**. `/plugin marketplace add skilld-dev/skilld` must work. Build a thin plugin manifest that points at the registry. Day-1 reach into the default Claude Code surface.
- [ ] **Resolve the CRITICAL DEFECT below**: define the guide-skill editorial review process before the first guide skill ships.

### Next 60 days
- [ ] Reach out to **skillburst.ai** about partnership: skilld as curated content layer, them as author distribution.
- [ ] Publish the meta-authority piece: "We surveyed every skill management tool. Here is what each one is for." Position skilld at the top of the stack. Cite Snyk, OWASP, the ClawHub incident.
- [ ] **Trust manifesto post**: a public document spelling out the supply chain. Who authors what, how regeneration works, what curators commit to, how compromised handles are handled. Map it to OWASP Agentic Skills Top 10.
- [ ] `skilld doctor` CLI: audit installed setup, surface stale or duplicate skills, flag skills installed from non-skilld sources. Quiet diagnostic move that takes the high ground from Lane B tools.

## 6. Critical Defect to Resolve

`SCOPE.md` says guide skills are "editorially reviewed on skilld.dev". The process, queue, reviewer, SLA, and rejection feedback loop are not specified. This is a trust path with no handling. It must be designed before the first guide skill ships, and before any public push that mentions guide skills.

## 7. Zero Silent Failure Watchlist

Strategic-level failure paths the pivot introduces or amplifies. Each has a handling strategy or is flagged as open.

| Path | Failure | Handling |
|---|---|---|
| Empty curator profile | Curator joins, picks nothing, profile is a ghost town | First-run wizard requires 3 picks before profile is public. "New curator" badge below 5 picks. Never show empty profiles in feed. |
| Empty search | "nuxt" returns 0 because catalog is small | Fall back to a curator suggestion ("`@danielroe` recommends these instead"). Never show bare empty state. |
| Stale skill | Package shipped 3 majors since regeneration | Daily job compares `package_version` vs npm latest. Block install with confirmation modal. Surface on detail page. |
| Stale curator | Featured curator inactive 6 months | Auto-rotate homepage features by `last_active_at`. Email curator at 90 days. Quietly drop, never publicly shame. |
| Compromised handle | Bluesky handle hijacked, attacker pushes malicious updates | Suspicious diffs (50+ skills added at once) trigger 24h cooling period before re-syncing to followers. Banner on followers' end. |
| MCP downtime | Cloudflare Worker errors | Cache last-known-good bundle at edge for 24h. CLI falls back to git source with warning. |
| Viral curator | Celebrity stack URL gets hundreds of installs/sec | Static cached JSON manifest at edge, not per-install D1 query. Index `(curator_id, updated_at)`, `(slug)` from day one. |
| Bad-faith curator | Curator publishes a malicious guide skill | **Open**: needs the editorial review queue from Section 6. |
| Silent install moment | User installs a stack but never sees the *why*, falls back to ignoring skills | Install command must print rationale per skill in the terminal. This is the single most important UX detail of the pivot. |

## 8. The Test

Every product or copy decision over the next 60 days must pass these two filters:

1. *Does this make us sound like infrastructure, or like an editorial publication that happens to ship code?* If infrastructure, rewrite or cut.
2. *Can we name the human responsible?* If a skill has no human attached (curator vouch or skilld-as-author), it does not belong on the platform.

The first filter protects the editorial voice. The second protects the trust supply chain. Both are one-way doors. Once we smell like Lane C, the editorial voice dies. Once we let anonymous skills onto the platform, the trust frame dies. Neither can be rebuilt.

## 9. Why This Works: The Awesome-List Precedent

Curated lists on GitHub have been the most durable trust mechanism in dev tooling for over a decade. Sindre Sorhus's awesome-* lists outlived dozens of "discover npm packages" startups by being human, opinionated, and slow. They scaled because trust transferred through identity, not algorithms.

Skilld is awesome-lists with three upgrades the format always lacked:
- **Identity**: AT Protocol handles, not anonymous PRs.
- **Freshness**: package skills regenerate against `npm latest`; stale gets flagged, not silently lied about.
- **One-command install**: the curated bundle is executable, not just a markdown link list.

The market already knows the curated-list pattern works. The job is to ship it as a product, with social identity as the authentication layer and skill provenance as the trust layer.

## 10. Strategic Bets, Stack-Ranked

If only one of the following ships in the next 60 days, this is the order it should ship in.

1. **The trust frame, in copy**. Hero, response post, README, OG images. Words first, because the words define which competitors we are even in conversation with.
2. **"Why this skill?" rationale field + provenance line**. The two smallest product changes that make every other surface honest.
3. **Anthropic plugin marketplace publish**. We must be reachable from `/plugin marketplace add` on Claude Code, or we are invisible to the default install path.
4. **3 named curators with stacks live**. Faces are the moat. The platform is empty without them.
5. **`/people/[handle]/stack` shareable URL**. The viral surface. Without it, curators have nothing to share.
6. **Trust manifesto post**. The defensible long-form artifact that locks in our positioning before a competitor copies it.
7. **MCP server**. Distribution moat once content moat is set.

Everything below this line is real but optional: skill-detail page, `skilld doctor`, partnership outreach, comparison post. Ship them when the top seven are in market.
