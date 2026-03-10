FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/contracts/src ./packages/contracts/src
COPY apps/orchestrator/package.json apps/orchestrator/tsconfig.json apps/orchestrator/vitest.config.ts ./apps/orchestrator/
COPY apps/orchestrator/src ./apps/orchestrator/src

RUN corepack enable \
  && pnpm install --frozen-lockfile --filter @specwave/orchestrator... --filter @specwave/contracts...

ENV SPECWAVE_ORCHESTRATOR_HOST=0.0.0.0
ENV SPECWAVE_ORCHESTRATOR_PORT=8787

EXPOSE 8787

CMD ["pnpm", "-C", "apps/orchestrator", "start"]
