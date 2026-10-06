# ADR-0012: Resolution poll allowance

Date: 2026-10-07

Amends [ADR-0008](0008-api-rate-limits.md).

## Context

ADR-0008 gives every v1 operation one shared allowance.
A guest gets 60 requests per 60 seconds, keyed by `CF-Connecting-IP`.

`skilld run` polls `GET /api/v1/resolutions/{id}` at the rate the server names in `pollAfterMs`.
The server names 1000 ms. The CLI waits up to 60 seconds for a Resolution.
One build that takes a minute therefore costs about 60 polls.
That spends the whole guest allowance, so the run fails with `RATE_LIMITED`.
A second run from the same network fails the same way.

## Decision

A poll of one Resolution draws from a separate binding, `API_RESOLUTION_POLL_RATE_LIMIT`.
It allows 600 requests per 60 seconds.
It uses the ADR-0008 key: the verified account ID, or the guest IP.
Ten runs from one network can poll through a one-minute build.

A poll is a `GET` of `/api/v1/resolutions/{id}`.
Every other v1 request keeps the ADR-0008 allowance, including the `POST` that starts a Resolution.
An exhausted poll allowance answers like an exhausted shared one: HTTP 429, `RATE_LIMITED`, and `Retry-After: 60`.

## Consequences

A poll is one indexed D1 read. 600 polls per minute is 10 reads per second for one key.
The starting `POST` stays in the shared allowance, so the number of builds one network can start does not change.
