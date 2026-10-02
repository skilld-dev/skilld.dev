# ADR-0008: API rate limits

Date: 2026-10-02

## Context

ADR-0006 leaves general v1 rate limiting as a follow-up.
Public requests need no token. Verified credentials should receive a larger allowance.
Creating another token must not create another allowance.

## Decision

Use Cloudflare Workers rate-limit bindings before every `/api/v1` handler.
The guest binding allows 60 requests per 60 seconds, keyed by `CF-Connecting-IP`.
The account binding allows 600 requests per 60 seconds, keyed by the verified account ID.
Every v1 operation shares its caller's allowance, including the OpenAPI document.
OPTIONS preflights do not consume the allowance.
Invalid credentials use the guest allowance. Missing IP metadata shares an `unknown` guest bucket.
Do not trust `X-Forwarded-For` or use a raw token as the account key.

Middleware resolves the existing sign-in cookie or Bearer credential once.
Account handlers reuse that identity. Public handlers still receive no caller identity.
This amends ADR-0006's rule that public operations never resolve a session.
No token is required for public operations, and their response bodies stay caller-independent.

Every v1 response sends `Cloudflare-CDN-Cache-Control: no-store`.
Workers Cache runs before the Worker, so caching v1 responses would skip enforcement.
Browser cache policies and registry/feed caches remain available.
Site pages and internal API routes keep their existing cache policies and limits.

An exhausted allowance answers HTTP 429 with the existing `RATE_LIMITED` problem shape.
It sends `Retry-After: 60` and `Cache-Control: private, no-store`.
The limiter exposes no exact reset time, so 60 seconds is a conservative retry delay.
No response fields or SDK contract descriptors change.

Cloudflare counters are approximate and local to each location.
These allowances provide abuse protection, not global usage accounting or billing quotas.
Guest IPs may represent several devs behind one network.
They can send a skilld token to use their account allowance.
The application does not log counter keys or store IPs in D1.

## Sources

- [Cloudflare Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Workers Cache](https://developers.cloudflare.com/workers/cache/)
