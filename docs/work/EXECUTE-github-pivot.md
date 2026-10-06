# GitHub pivot

Status: open · 2026-10-03 · legacy table removal verified in production; mail completion needs evidence

**Next move:** Ready. Inspect sender DNS, sender registration, and recipient restrictions without sending mail. Harlan approves any test send.

Done means: the atproto and legacy `collections` / `collection_skills` tables are dropped in prod, `mail.skilld.dev` passes SPF, DKIM and DMARC, and a digest reaches an address that was never added to the Verified Destination list.

## Ledger

- [x] Phase 1, 2 and 3 shipped on `main` 2026-05-08, with the deviations inlined below
- [x] Pivot D1 migrations, including legacy removal, verified through production schema and the deploy migration step
- [ ] `mail.skilld.dev` DNS plus verified sender domain registration
- [ ] Verified Destination Addresses, or Cloudflare Send Email unrestricted
- [ ] Review current digest summary configuration before applying the original Anthropic prerequisite
- [x] Phase 4: drop the atproto tables
- [x] Phase 4: drop the old `collections` and `collection_skills` tables

## Log

- 2026-10-03 A production `sqlite_master` query found none of `curators`, `follows_cache`, `follows_refresh_state`, `collections`, or `collection_skills`.
  The query wrote zero rows. Migrations 0051 and 0052 contain the removals.
  Deployment [37038090688](https://github.com/skilld-dev/skilld.dev/actions/runs/37038090688) passed its D1 migration step.
  Sender DNS, sender registration, recipient restrictions, and digest delivery were not checked.

## References

- [VISION](../../VISION.md) owns the two loops and product scope.
- [Architecture](../arch/README.md) owns identity and handler boundaries.
- [Daily health check](../runbooks/checkin.md) owns delivery evidence collection.
- Migrations 0051 and 0052 record the legacy table removals.
- The original May specification remains in Git history.
