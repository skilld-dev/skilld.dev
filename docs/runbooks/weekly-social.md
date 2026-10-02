# Weekly social posts

The weekly social workflow serves discovery. It links trending Skills to their source and run command.

X uses a dedicated skilld account. Discord uses a channel webhook in Harlan's Open Source.
The workflow runs every Monday at 09:00 UTC. Each destination has its own job and enable switch.

## Preview

Run these commands from the repository:

```sh
SKILLD_SOCIAL_OUTPUT_DIR="$HOME/scratch" pnpm exec tsx scripts/weekly-social.ts prepare x
SKILLD_SOCIAL_OUTPUT_DIR="$HOME/scratch" pnpm exec tsx scripts/weekly-social.ts prepare discord
```

Manual workflow runs preview by default. Preview requests only the public skilld APIs.
The workflow keeps feed order and includes only Skills with linked social mentions.
It excludes fallback rows and links each Skill's source and mention evidence.
Empty weeks send nothing. X includes up to three Skills. Discord includes up to five.
Discord groups complete rows into one card and uses the skilld logo and rose accent.

## Configure X

Create the dedicated X account. Prefer `@skilld_dev`; use `skilld.dev` as its display name.
Authorize an X developer app with Read and Write permissions for this account.
Generate new user access tokens after changing app permissions.

Add these GitHub Actions secrets:

| Secret | Value |
| --- | --- |
| `SKILLD_WEEKLY_X_API_KEY` | Developer app consumer key |
| `SKILLD_WEEKLY_X_API_SECRET` | Developer app consumer secret |
| `SKILLD_WEEKLY_X_ACCESS_TOKEN` | Dedicated account user access token |
| `SKILLD_WEEKLY_X_ACCESS_SECRET` | Dedicated account user access token secret |

Set `SKILLD_WEEKLY_X_USERNAME` to the dedicated handle without `@`.
Handles must start with `skilld`. The default is `skilld_dev`.
Every publish verifies the authenticated username before sending.
Keep these credentials separate from the existing discovery bearer key.

X charges for API writes. Check [current pricing](https://docs.x.com/x-api/getting-started/pricing) before enabling posts.

## Configure Discord

Open [Harlan's Open Source](https://discord.com/invite/5jDAMswWwX) with the server owner account.
Create the text channel `skilld-dev` and an incoming webhook named `skilld`.
Save its URL as the GitHub Actions secret `SKILLD_WEEKLY_DISCORD_WEBHOOK`.
Set the Actions variable `SKILLD_WEEKLY_DISCORD_CHANNEL_ID` to that channel's ID.
Enable Discord Developer Mode to copy the channel ID.

The sender verifies server `931135234261532713` and the configured channel before sending.
It disables mentions and uses `wait=true` to obtain the message ID.
Keep the discovery webhook separate from the weekly channel webhook.

## Enable a destination

Review its preview first. Set the corresponding Actions variable to `true`:

- `SKILLD_WEEKLY_X_ENABLED`
- `SKILLD_WEEKLY_DISCORD_ENABLED`

Enable either destination independently. Only main-branch runs can publish.
For an immediate send, run the workflow with `publish` selected.
Clear the corresponding enable variable to stop its sends.

## Inspect a failed send

Before sending, the workflow stores an artifact named `skilld-weekly-{destination}-{Monday date}`.
Job concurrency prevents two runs from claiming the same destination together.
Existing claims block another send for that week.
Failed sends retain the claim because a network failure can hide an accepted message.

Inspect the destination and the run receipt before retrying.
If the message exists, keep the claim. If it does not, remove that claim artifact and rerun with `publish` selected.
Never delete the claim while its workflow job is running.
Claim artifacts stay for 90 days. Restrict artifact deletion to operators.

The receipt contains the destination's message ID. Workflow logs never print posting credentials.
See [X authorization](https://docs.x.com/fundamentals/authentication/oauth-1-0a/authorizing-a-request)
and [Discord webhooks](https://docs.discord.com/developers/resources/webhook) for API details.
