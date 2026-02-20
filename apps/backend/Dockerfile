FROM node:20-slim

WORKDIR /workspace

RUN apt-get update -y \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*

ARG DATABASE_URL=file:/workspace/data/local.db
ENV DATABASE_URL=${DATABASE_URL}

COPY package.json package-lock.json ./
COPY nx.json tsconfig.base.json ./
COPY apps ./apps
COPY libs ./libs

RUN npm ci
RUN npm run prisma:generate
RUN npm run prisma:generate:sqlite

# Install Playwright Chromium for Browserbase provider
RUN npx playwright install --with-deps chromium
# Install Patchright Chromium for stealth local browser mode
RUN npx patchright install --with-deps chromium

RUN npx nx build backend --configuration=production

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/apps/backend/main.js"]
