---
title: Privacy
description: What skilld.dev stores, why it needs the data, how long it keeps it, and how you delete your account.
label: Last updated 17 September 2026
updatedAt: 2026-09-17
---

## In short

- You can browse skilld.dev and run Skills without an account.
- skilld.dev loads no analytics or advertising scripts.
- An account is optional. You sign in with [GitHub](https://github.com) to like Skills, watch Repositories, get email, or connect the skilld CLI.
- You can delete your account from your dashboard at any time.
- The skilld CLI sends no telemetry.

## When you visit

[Cloudflare](https://cloudflare.com) hosts skilld.dev. Every request goes through Cloudflare, which uses your IP address to deliver the page.

skilld writes request logs to Cloudflare Workers Logs. A log entry holds the route, the response status, and the time the request took. It also holds your country and the Cloudflare data center that answered. It holds no IP address, user agent, or query string.

### Cookies

skilld.dev sets these cookies and no others:

- `nuxt-session` keeps you signed in. Before you sign in, it holds only a random ID. After you sign in, it holds your account ID, login, name, and avatar URL, encrypted. It ends when you close your browser.
- `__nkpv` records which version of the site your browser loaded, so an update does not break an open page. It lasts 7 days.
- `nuxt-auth-state` protects the GitHub sign-in step against forged requests. It lasts 10 minutes.
- `cli_return_to` returns you to the CLI sign-in page after you sign in with GitHub. It lasts 10 minutes.

### Your browser

Your browser keeps your color mode and your 5 most recent searches in local storage. If you close the email hint on a Skill page, session storage remembers that until you close the tab. This data stays on your device.

### Search

Search sends your query to Workers AI on Cloudflare to find matching Skills. skilld stores no copy of the query text. It caches the query's embedding, a list of numbers, for up to one day. The cache entry holds nothing that identifies you.

### Skill pages

A Skill page never makes your browser load an image from the Skill author's own server.

## When you sign in with GitHub

Sign-in uses GitHub OAuth. skilld asks for two scopes:

- `read:user` reads your profile: your GitHub ID, login, name, and avatar.
- `user:email` reads your verified primary email address when your GitHub profile hides your email.

skilld uses the same token for two more jobs. On your first sign-in, it searches your public Repositories for `SKILL.md` files. It adds the Skills it finds to the registry. When you import your stars, it reads the list of Repositories you starred.

skilld stores this data for your account:

- Your GitHub ID, login, name, avatar URL, and email address.
- Your GitHub tokens, encrypted. Signing out deletes them.
- The Skills you like. Your likes are public at `skilld.dev/@your-login/liked`.
- The Repositories you watch and the stars you import.
- The collections you create. Collections are public.
- Your email settings and the email address you save.
- When you created your account and when you last signed in.

## Email

skilld sends email only after you turn it on, during sign-up or in your dashboard.

- **Weekly email:** new trending Skills every Monday.
- **Monthly digest:** changes to your liked Skills and watched Repositories, on the first day of each month.

skilld sends to the address you save. If you save no address, it uses the email address from your GitHub account. Cloudflare delivers each email from `noreply@mail.skilld.dev`. Every email has an unsubscribe link. skilld records no clicks by individual readers on email links.

## The skilld CLI

The skilld CLI sends no telemetry or analytics. It calls the skilld.dev API only when a command needs it, such as `skilld search`, `skilld run`, or `skilld install`. The [CLI README](https://github.com/skilld-dev/skilld#privacy) lists every network request the CLI makes.

When you sign in with the CLI, skilld stores a record for that token:

- The token, hashed or encrypted.
- The CLI version.
- The token's label, such as the name you give a personal token.
- When skilld issued the token, and when a request last used it.

If the client sends your operating system and processor type, such as `darwin-arm64`, device sign-in records it. The sign-in page shows it, so you can check which machine asks for access. You can revoke a device in your [dashboard](/me/devices).

## Error reports

skilld uses [Sentry](https://sentry.io) to find and fix errors.

- Error reports from your browser go to skilld.dev first, and skilld.dev forwards them. Sentry does not receive your IP address.
- Reports keep the page path and your browser's user agent. They remove cookies, query strings, request bodies, and other request headers.
- Your browser sends error reports only. It sends no session replays and no performance traces.
- The skilld server sends Sentry timing data for 5% of requests, with the same data removed.
- Sentry stores this data in its United States region.

## Services that handle your data

- Cloudflare hosts skilld.dev and runs its database, cache, email delivery, Workers AI search, and request logs. It handles requests, account data, email addresses, and search queries.
- GitHub handles sign-in and holds the source of every Skill. It handles your GitHub profile and tokens.
- Sentry receives error reports, with the data listed above removed.

## How long skilld keeps data

- Your account data stays until you delete your account.
- Signing out deletes your stored GitHub tokens.
- CLI tokens stay for 7 days after they expire or you revoke them.
- CLI sign-in codes and device sign-in requests stay for 1 day.
- Email send records and unsubscribe history stay for 90 days.

A daily job deletes these records at 04:30 UTC. Two kinds of digest records stay longer. The newest digest record for each account stays, because the next digest starts from it. A digest that did not send successfully also stays, so a retry cannot send it twice.

## Delete your account

Open your [dashboard](/me) and select the Delete account button. Type your GitHub login to confirm. skilld then deletes all of this at once:

- Your GitHub profile details, email address, and stored tokens.
- Your likes, watched Repositories, and imported stars.
- Your collections.
- Your email settings and email history.
- Your CLI tokens and device sign-ins.

After that, skilld asks GitHub to revoke its access to your GitHub account. If GitHub does not confirm, your dashboard tells you. You can then revoke skilld in your [GitHub settings](https://github.com/settings/applications).

Skills in your public Repositories stay in the registry, because GitHub is their source.

## Contact

Email [harlan@harlanzw.com](mailto:harlan@harlanzw.com) with questions about your data. To report a security problem, use [GitHub private vulnerability reporting](https://github.com/skilld-dev/skilld/security/advisories/new).
