# Digest preview

Use `POST /api/admin/digest-preview` to rehearse one account's watched changes.
The route requires the admin bearer credential or an admin session.
It selects the last 30 days with the production digest selector and renderer.
It does not claim deliveries, advance cursors, or count clicks.

Send a JSON body with `login`. The default login is `harlan-zw`.
Omit `to` to receive the rendered HTML, text, and subject.
If the window has no watched changes, the route returns `empty` and sends nothing.

For an inbox check, set `to` to the operator's test address.
The sender uses the production EMAIL binding and unsubscribe headers.
The subject starts with `[test]`. The campaign ID starts with `skilld-digest-test:`.
The response preserves provider acceptance, rejection, or uncertainty.
Provider acceptance does not prove inbox placement. Read the received message and headers.

The unsubscribe link belongs to the selected account. Do not click it during rehearsal.
This preview does not exercise scheduled claims or cursor advancement.
Use `digest_runs` and the scheduled task records to verify those paths.
