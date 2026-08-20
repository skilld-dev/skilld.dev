# Production deploy safety

Production deploys run only after the exact `main` SHA passes the `Test`
workflow. GitHub Actions serializes deploys and never cancels an active one.

`pnpm production:deploy` owns one atomic operational sequence:

1. Read the latest [Cloudflare](https://cloudflare.com) deployment and require one version at 100% traffic.
2. Save that explicit version ID as the rollback target.
3. Deploy the built Worker and static assets.
4. Confirm Cloudflare reports a different active version.
5. Run the production route smoke contract with retries.
6. If smoke fails, confirm the failed version is still active.
7. Roll back to the saved version ID, confirm it is active, then rerun smoke.

Any failed smoke keeps the GitHub Actions job failed, including when rollback
and recovery smoke succeed. The `rolled_back` result means production recovered,
not that the release passed.

Rollback refuses to act when deployment state is missing, malformed, split
across versions, or changed after smoke began. This prevents an older workflow
from overwriting a newer manual deployment.

Cloudflare Worker versions include code, configuration, bindings, and static
assets. They do not include D1, KV, R2, queue, or Durable Object state. D1
migrations remain forward only and must stay compatible with the previous
Worker version.

Artifact delivery has extra prerequisites and rollback limits. Follow the
[Artifact delivery rollout](./artifact-delivery-rollout.md) before its first deploy.
