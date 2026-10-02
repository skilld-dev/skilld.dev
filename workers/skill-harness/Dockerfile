FROM node:24.18.0-trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git ripgrep \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.4.2

COPY --from=docker.io/cloudflare/sandbox:1.0.0 /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
WORKDIR /opt/harness
COPY runner/package.json runner/package-lock.json ./
RUN npm ci --ignore-scripts
COPY runner/prepare.mjs ./
RUN node prepare.mjs
COPY runner/run.mjs ./

CMD ["sleep", "infinity"]
