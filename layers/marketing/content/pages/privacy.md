---
title: Privacy
description: What skilld.dev stores, why it needs the data, how long it keeps it, and how you delete your account.
label: Last updated 7 October 2026
updatedAt: 2026-10-07
---

## In short

- You can browse skilld.dev and run Skills without an account.
- skilld.dev counts page views and command copies. The counts hold no name, IP address, or cookie. It loads no advertising scripts.
- An account is optional. You sign in with [GitHub](https://github.com) to like Skills, watch Repositories, get email, or connect the skilld CLI.
- You can delete your account from your dashboard at any time.
- The skilld CLI sends no telemetry.
- The MCP server for [ChatGPT](https://chatgpt.com), Claude, and other MCP apps needs no account. It receives only what each tool needs, such as your search text.

## When you visit

[Cloudflare](https://cloudflare.com) hosts skilld.dev. Every request goes through Cloudflare, which uses your IP address to deliver the page.

skilld writes request logs to Cloudflare Workers Logs. A log entry holds the route, the response status, and the time the request took. It also holds your country and the Cloudflare data center that answered. It holds no IP address, user agent, or query string.

Cloudflare also records a timing trace for 1 request in 100. A trace holds the route and how long each step took. It holds no IP address and no request body.

### Web Analytics

skilld.dev uses [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) to count page views and measure page speed. According to [Cloudflare's metrics documentation](https://developers.cloudflare.com/web-analytics/data-metrics/), it records:

- Page views and visits.
- Page load timings and Core Web Vitals.
- The page path and the site that referred you.
- Your country, device type, browser, and operating system.

Cloudflare states that Web Analytics uses no cookies or local storage, and that it does not fingerprint visitors by IP address or user agent. The script loads from skilld.dev itself. Its reports also go to skilld.dev, which forwards only the report body to Cloudflare. Cloudflare's analytics service does not receive your IP address, cookies, or other request headers from that request.

### Usage counts

skilld.dev is early, so it needs to know which Skills developers run and where they find them.

When you copy a printed command, your browser tells skilld.dev. skilld stores one count with:

- The surface that printed the command, such as a Skill card or the home page.
- Whether the command runs a Skill or installs it.
- The Skill, Repository, or collection the command names.
- Your country.

That count goes to [Cloudflare Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/), which keeps it for 90 days. It holds no IP address, no cookie, and no account ID, so a count cannot be traced to you or joined to your account. skilld keeps no record of an individual copy.

The skilld CLI sends no telemetry. skilld.dev accepts an anonymous run count from a CLI at the same address, under the same rules, and drops any account ID the request carries.

### Cookies

skilld.dev sets these cookies and no others:

- `nuxt-session` keeps you signed in. skilld.dev sets it only when you sign in. It holds your account ID, login, name, and avatar URL, encrypted. It ends when you close your browser.
- `__nkpv` records which version of the site your browser loaded, so an update does not break an open page. It lasts 7 days.
- `nuxt-auth-state` protects the GitHub sign-in step against forged requests. It lasts 10 minutes.
- `skilld-login-intent` keeps your return page and pending Like or Watch action during GitHub sign-in. It is encrypted and lasts 10 minutes.
- `agent_setup_dismissed` remembers that you closed the Agent setup card on your account page. It lasts 180 days.

### Your browser

Your browser keeps your color mode and your 5 most recent searches in local storage. If you close the email hint on a Skill page, session storage remembers that until you close the tab. This data stays on your device.

### Search

Search sends your query to Workers AI on Cloudflare to find matching Skills. skilld stores no copy of the query text. It caches the query's embedding, a list of numbers, for up to one day. The cache entry holds nothing that identifies you.

### Task search

When you search with a sentence, the search panel offers "Find skills for this task". The search box sends nothing more until you select it.

When you select it, skilld sends your search text to the GPT-6 Luna model from [OpenAI](https://openai.com), through Cloudflare. The model writes a few searches, skilld runs them on its own registry, and the model picks Skills from those results. OpenAI receives your search text and those results. It receives no IP address, cookie, or account details.

skilld caches the answer, a list of Skills, for up to 7 days. The cache key is a hash of your search text. skilld logs how long each answer took, how many tokens it used, and what it cost. The log holds no search text.

Each task search costs money, so Cloudflare counts task searches per IP address over one minute. skilld stores no IP address.

### Images

Every avatar and every image in a Skill loads through skilld.dev. skilld.dev fetches the image from GitHub, X, Bluesky, or the host the Skill names, and sends none of your request details. Those hosts never see your IP address, and your browser never contacts them for an image. skilld.dev also sends a referrer policy that shares only the site origin with other sites you open.

## When you sign in with GitHub

Sign-in uses GitHub OAuth. skilld asks for two scopes:

- `read:user` reads your profile: your GitHub ID, login, name, and avatar.
- `user:email` reads your verified primary email address when your GitHub profile hides your email.

skilld uses the same token for two more jobs, and only when you ask:

- When you sign in, skilld offers to search your public Repositories for `SKILL.md` files and add the Skills it finds to the registry. You can decline, and you can run the same search later from your profile.
- When you import your stars, skilld reads the list of Repositories you starred.

skilld stores this data for your account:

- Your GitHub ID, login, name, avatar URL, and email address.
- Your GitHub tokens, encrypted. Signing out deletes them.
- The Skills you like. Your profile shows them, unless you turn off "Show liked Skills on your profile" in your dashboard.
- The Repositories you watch and the stars you import.
- The collections you create. Collections are public.
- Your email settings and the email address you save.
- When you created your account and when you last signed in.

## Email

skilld sends email only after you turn it on, during sign-up or in your dashboard.

- **Weekly email:** new trending Skills every Monday.
- **Monthly digest:** changes to your liked Skills and watched Repositories, on the first day of each month.

skilld sends to the address you save. If you save no address, it uses the email address from your GitHub account. Cloudflare delivers each email from `noreply@mail.skilld.dev`. Every email has an unsubscribe link.

Links in these emails go through skilld.dev. skilld counts clicks per day, per email issue, and per link. This includes the links to GitHub, which are counted by Repository. Every reader of an issue gets the same links, so a count holds no name, email address, IP address, or user agent.

## The skilld CLI

The skilld CLI sends no telemetry or analytics. It calls the skilld.dev API only when a command needs it, such as `skilld search`, `skilld run`, or `skilld install`. The [CLI README](https://github.com/skilld-dev/skilld#privacy) lists every network request the CLI makes.

When you sign in with the CLI, skilld stores a record for that token:

- The token, hashed or encrypted.
- The CLI version.
- A label for the token. The skilld CLI sends your computer's hostname, so you can tell your devices apart. Only you can see it.
- When skilld issued the token, and when a request last used it.

If the client sends your operating system and processor type, such as `darwin-arm64`, device sign-in records it. The sign-in page shows it, so you can check which machine asks for access. You can revoke a device in your [dashboard](/me/devices).

## The MCP server

ChatGPT, Claude, and other MCP apps can search skilld.dev through its MCP server at `https://skilld.dev/api/mcp`. The server needs no account and sets no cookie. Every tool is read only, except `submit_repository`.

When your chat app calls a tool, skilld receives what that tool needs:

- `search_skills` receives your search text and a result count.
- `get_skill` receives the owner, Repository, and name of one Skill.
- `install_command` receives one Skill or Repository reference.
- `list_tracks` receives nothing.
- `get_track` receives a track slug, a result count, and an offset.
- `list_trending` receives a period, a week or a month, and a result count.
- `get_repository` receives the owner and name of one Repository and a result count.
- `submit_repository` receives one Repository name or URL. skilld stores the index request with the Repository name and its status. It records nothing about who sent it.

skilld receives no chat history, no files from the chat, and no account details from the chat app. ChatGPT and Claude call the server from OpenAI or Anthropic servers, so skilld sees their IP address, not yours. Apps on your computer, such as Claude Code or Cursor, call it from your network. Rate limits count requests per IP address, and skilld stores no IP address.

Search text goes to Workers AI, as [Search](#when-you-visit-search) describes. Request logs follow the rules under [When you visit](#when-you-visit). OpenAI and Anthropic handle your chat under their own privacy policies.

## Error reports

skilld uses [Sentry](https://sentry.io) to find and fix errors.

- Error reports from your browser go to skilld.dev first, and skilld.dev forwards them. Sentry does not receive your IP address.
- Reports keep the page path and your browser's user agent. They remove cookies, query strings, request bodies, and other request headers.
- Your browser sends error reports only. It sends no session replays and no performance traces.
- The skilld server sends Sentry timing data for 5% of requests, with the same data removed.
- Sentry stores this data in its United States region.

## Services that handle your data

- Cloudflare hosts skilld.dev and runs its database, cache, email delivery, image proxy, Web Analytics, usage counts, Workers AI search, and request logs. It handles requests, account data, email addresses, analytics reports, and search queries.
- GitHub handles sign-in and holds the source of every Skill. It handles your GitHub profile and tokens.
- Sentry receives error reports, with the data listed above removed.
- OpenAI runs the model behind task search. Through Cloudflare, it receives the search text of a task search and the registry results, and nothing that identifies you.

## How long skilld keeps data

- Your account data stays until you delete your account.
- Signing out deletes your stored GitHub tokens.
- Skilld tokens stay for 7 days after they expire or you revoke them.
- CLI sign-in codes and device sign-in requests stay for 1 day.
- Email send records and unsubscribe history stay for 90 days.
- Usage counts and request logs stay for 90 days. Email click counts are kept as daily totals with no account in them.

A daily job deletes these records at 04:30 UTC. Two kinds of digest records stay longer. The newest digest record for each account stays, because the next digest starts from it. A digest that did not send successfully also stays, so a retry cannot send it twice.

Cloudflare D1 keeps a point-in-time recovery history of the database. A deleted row can stay in that history for up to 30 days, and then it expires.

## Delete your account

Open your [dashboard](/me) and select the Delete account button. Type your GitHub login to confirm. skilld then deletes all of this at once:

- Your GitHub profile details, email address, and stored tokens.
- Your likes, watched Repositories, and imported stars.
- Your collections.
- Your email settings and email history.
- Your skilld tokens and device sign-ins.

After that, skilld asks GitHub to revoke its access to your GitHub account. If GitHub does not confirm, your dashboard tells you. You can then revoke skilld in your [GitHub settings](https://github.com/settings/applications).

Skills in your public Repositories stay in the registry, because GitHub is their source. Deleted data can stay in the database recovery history for up to 30 days.

## Contact

Harlan Wilton runs skilld.dev. Email [harlan@harlanzw.com](mailto:harlan@harlanzw.com) with questions about your data. To report a security problem, use [GitHub private vulnerability reporting](https://github.com/skilld-dev/skilld/security/advisories/new).
