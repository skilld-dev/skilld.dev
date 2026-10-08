# Artifact delivery rollout

Use this guide before the first v3.0 deploy.

v3.0 supports public Repositories only.
Private Repository access stays disabled until v3.1.

The existing GitHub OAuth App still handles sign in.
Do not change its callback or credentials.

## 1. Confirm the release scope

Keep this value in `wrangler.jsonc`:

```json
{
  "vars": {
    "ARTIFACT_PRIVATE_ACCESS_ENABLED": "false"
  }
}
```

The disabled state has these effects:

- GitHub App connection routes return `404`.
- The GitHub App webhook returns `404`.
- Private Artifact content and grants return `404`.
- Public builds do not read GitHub App or private Artifact secrets.

Do not create a GitHub App for v3.0.
Do not set any `GITHUB_APP_*` secret for v3.0.
Do not set Artifact wrapping or private grant secrets for v3.0.

## 2. Prepare access and recovery

Use a [Cloudflare](https://cloudflare.com) token.
It must manage Workers, D1, R2, Queues, secrets, and routes.

Export D1 before the first migration:

```bash
pnpm exec wrangler d1 export DB --remote --output <secure-path>/skilld-db-before-artifacts.sql
```

Store the export outside the Repository.

Worker rollback does not restore D1, R2, Queue, or secret state.

## 3. Create Cloudflare resources

Create each missing resource once:

```bash
pnpm exec wrangler r2 bucket create skilld-public-artifacts
pnpm exec wrangler r2 bucket create skilld-private-artifacts
pnpm exec wrangler queues create skilld-artifact-build
pnpm exec wrangler queues create skilld-artifact-build-dlq
```

The private bucket is a dormant v3.1 binding.
The Worker deploy still requires the bucket to exist.

Keep both R2 development URLs disabled.

Attach `artifacts.skilld.dev` to `skilld-public-artifacts`.
Do not attach a custom domain to `skilld-private-artifacts`.

Confirm these bindings match `wrangler.jsonc`:

- `DB`
- `PUBLIC_ARTIFACTS`
- `PRIVATE_ARTIFACTS`
- `ARTIFACT_BUILD_QUEUE`
- `ARTIFACT_SIGNER`

The signer uses the same D1 database and both R2 buckets.

## 4. Complete the public signing ceremony

Keep the Ed25519 root private key offline.
Never add it to Cloudflare or GitHub Actions.

Create one root-signed statement for the production signing key.
Use canonical JSON and canonical base64url.

Set `ARTIFACT_TRUSTED_ROOT_JSON` on the public Worker.
It contains the root public key and approved production keys.

Compile the same root key ID and public key into the skilld CLI.
Stop if either value differs.

Set these signer values in `workers/artifact-signer/wrangler.jsonc`:

- `ARTIFACT_SIGNING_KEY_ID`
- `ARTIFACT_SIGNING_KEY_NOT_BEFORE`
- `ARTIFACT_SIGNING_KEY_NOT_AFTER`
- `ARTIFACT_SIGNING_MAX_AGE_SECONDS`

Store only the production signing private key in the signer Worker:

```bash
pnpm --filter @skilld/artifact-signer-worker exec wrangler secret put ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8
```

## 5. Set v3.0 Worker secrets

Set `ARTIFACT_TRUSTED_ROOT_JSON` on the public Worker.

Preserve these existing values:

- `NUXT_OAUTH_GITHUB_CLIENT_ID`
- `NUXT_OAUTH_GITHUB_CLIENT_SECRET`
- `NUXT_TOKEN_KEY`

Every Worker [GitHub](https://github.com) read uses the read App `skilld-dev-registry-reads`: the registry sync, repository maintenance, mention checks, `/gh` pages and public Artifact builds. Set `SKILLD_READ_APP_ID`, `SKILLD_READ_APP_INSTALLATION_ID` and `SKILLD_READ_APP_PRIVATE_KEY_PKCS8` (a PKCS #8 PEM). The App has metadata read permission only, and its installation has its own quota.

Personal tokens are fallbacks only. They repeat a read GitHub denied the App, such as an organization that restricts Apps:

1. Builds try `ARTIFACT_GITHUB_TOKEN`, then `GITHUB_TOKEN`, then the token of the signed-in account that asked for the run.
2. Every other caller tries `GITHUB_TOKEN`.

Each denial emits an `app-denied` event: `github-credential` for registry reads and `artifact-github-credential` for builds. The `github.credential` field names the fallback, or `none`. Without a fallback, the read fails for that Repository only: a build answers `SOURCE_ACCESS_DENIED`, and the sync records a failure without pausing. If the fallback is spent or expired, the sync also records a failure for that Repository without pausing. After a denial, the sync paces itself on the App's quota, not on the fallback's.

If GitHub answers 401 to the cached installation token, the read mints one new token and repeats. If GitHub rejects the new token too, the read uses the fallback and emits an `app-token-rejected` event.

If the App secrets are set but unusable, or a mint fails, reads use the fallback. The sync then paces itself on the fallback's quota. A failure stands for about 60 seconds in each isolate. In that time, reads make no mint, and the isolate emits one event with the reason. After a 401, the new mint runs even while a failure stands.

A mint ends at the deadline of the read that waits for it. A `/gh` page read waits at most its 4 second limit. Builds and the sync wait up to the mint's own 15 second limit. A read deadline that ends a mint does not count as a failure.

Requests in one isolate share a minted token and a failure window, never a mint in flight. workerd ties a fetch to the request that made it, so a request that waited for another request's mint could fail or hang. If several requests find no token at the same time, each mints its own.

Keep the read App apart from the `GITHUB_APP_*` secrets below. Those belong to private delivery.

Changing `NUXT_TOKEN_KEY` breaks stored GitHub credentials.

Do not set these v3.1 secrets yet:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY_PKCS8`
- `GITHUB_APP_WEBHOOK_SECRET`
- `ARTIFACT_KEY_WRAP_KEY_PRIMARY`
- `ARTIFACT_KEY_WRAP_KEY_SECONDARY`
- `ARTIFACT_GRANT_IDEMPOTENCY_KEY`

## 6. Apply migrations in order

List pending migrations:

```bash
pnpm exec wrangler d1 migrations list DB --remote
```

The list must show this order:

1. `0110_artifact_delivery.sql`
2. `0111_github_app_delivery.sql`
3. `0112_private_artifact_keys.sql`

Apply them:

```bash
pnpm db:migrations:prod
```

List pending migrations again.
Stop unless the list is empty.

All three migrations are additive.
Public Artifact rows use columns added by `0111`.
The private tables remain dormant until v3.1.

Do not delete these tables during rollback.

## 7. Deploy in order

Deploy the signer first:

```bash
pnpm --filter @skilld/artifact-signer-worker deploy:production
```

Then deploy the public Worker:

```bash
pnpm build
pnpm production:deploy
```

The production workflow uses the same order.

Create the signer Worker before the public Worker deploy.
Complete the public signing ceremony before merging.

## 8. Run v3.0 production checks

Run the existing smoke check:

```bash
pnpm production:smoke
```

Then check public Artifact delivery:

1. Fetch `/api/v1/trusted-root`. Require `200` and a five-minute public cache policy.
2. Create one public Resolution. Poll it until `ready`.
3. Create its grant. Require a signed attestation and HTTPS content URL.
4. Download the public Artifact twice. Require identical SHA256 bytes.
5. Require `Cache-Control: public, max-age=31536000, immutable` on those bytes.
6. Sign in. Fetch `/api/v1/github/connections/authorize`. Require `404`.
7. Fetch private content with valid-looking credentials. Require `404`.
8. Send a GitHub App webhook. Require `404`.

Check `CF-Cache-Status` on the public Artifact domain.
The second public download should be cache eligible.

## 9. Roll back safely

`pnpm production:deploy` can roll back only the public Worker version.

It cannot reverse D1 migrations or restore R2, Queue, or secret state.
The signer also remains on its new version.

If public checks fail, let the deploy command restore the previous public Worker.
Keep the signer deployed when it supports both public Worker versions.

If the signer fails first, stop the rollout.
Identify its previous version before using `wrangler rollback` in the signer package.

Never restore the D1 export over a live database without a separate recovery plan.
New writes after the export would be lost.

Public Artifact URLs are immutable.
Downloaded or cached bytes can remain available.

## 10. Enable private Repository access in v3.1

Complete this section during the v3.1 rollout.

Create a separate GitHub App.
Keep the existing OAuth App for normal sign in.

Use these GitHub App settings:

- Callback URL: `https://skilld.dev/api/v1/github/connections/callback`
- Request user authorization during installation: enabled
- Expiring user access tokens: enabled
- Device Flow: disabled
- Webhook URL: `https://skilld.dev/api/v1/webhooks/github`
- Webhook SSL verification: enabled
- Repository permission, Contents: read only
- Repository permission, Metadata: read only
- Events: `installation` and `installation_repositories`
- Installation scope: any account

Leave the setup URL empty.
During installation, users choose `Only select repositories`.

Convert the GitHub App private key to unencrypted PKCS8.
Store its canonical base64url bytes as `GITHUB_APP_PRIVATE_KEY_PKCS8`.

Set these public Worker secrets:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY_PKCS8`
- `GITHUB_APP_WEBHOOK_SECRET`
- `ARTIFACT_KEY_WRAP_KEY_PRIMARY`
- `ARTIFACT_GRANT_IDEMPOTENCY_KEY`

Generate each Artifact secret from an independent random 32-byte value.
Keep `ARTIFACT_KEY_WRAP_KEY_SECONDARY` unset for the first private release.

Deploy once with `ARTIFACT_PRIVATE_ACCESS_ENABLED` still set to `false`.
Confirm the public checks still pass.

Change `ARTIFACT_PRIVATE_ACCESS_ENABLED` to `true`.
Deploy the public Worker again.

Then check private delivery:

1. Sign in with the existing OAuth App.
2. Open `/api/v1/github/connections/authorize?return_to=/me`.
3. Install the GitHub App on one test Repository.
4. Create and download one private Artifact.
5. Replay its one-time grant. Require `404`.
6. Remove the test Repository. Require old and new grants to fail.

If any private check fails, set the flag to `false` and redeploy.

## 11. Rotate keys

Rotate the Ed25519 Artifact signing key with [the signing key rotation runbook](../runbooks/signing-key-rotation.md).
It overlaps the old and new keys in two signer slots, so no build fails during the change.

Start private key rotation only in v3.1.

Rotate the GitHub App private key before deleting the old GitHub key.

Use both wrapping-key slots during Artifact key rotation.
Never overwrite a slot while any Account key uses its ID.

Rotate `ARTIFACT_GRANT_IDEMPOTENCY_KEY` only after every private grant expires.
Keep the old value for at least 25 hours after the last grant request.
