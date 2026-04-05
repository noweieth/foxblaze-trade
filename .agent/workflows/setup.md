---
description: How to set up the FoxBlaze development environment from scratch
---

# Setup Development Environment

// turbo-all

## Prerequisites

1. Ensure Docker is installed and running:
   ```bash
   docker --version
   ```

2. Ensure Node.js >= 20 is installed:
   ```bash
   node --version
   ```

## Start Infrastructure

3. Start PostgreSQL and Redis via Docker Compose:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && docker compose up -d
   ```

4. Verify containers are running:
   ```bash
   docker compose ps
   ```

5. Expected output: `foxblaze_postgres` and `foxblaze_redis` are both `Up`.

## Install Dependencies

6. Install npm packages:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && npm install
   ```

## Database Setup

7. Generate Prisma client:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && npx prisma generate
   ```

8. Run database migration:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && npx prisma migrate dev --name init
   ```

## Environment

9. Copy `.env.example` to `.env` if not exists:
   ```bash
   cd /Users/vinhlam/workspace/bot/agent-foxblaze && cp -n .env.example .env 2>/dev/null || echo ".env already exists"
   ```

10. Remind user to fill in required secrets in `.env`:
    - `TELEGRAM_BOT_TOKEN`
    - `MASTER_SEED_PHRASE`
    - `ENCRYPTION_KEY`
    - `HYPERLIQUID_MASTER_ADDRESS`
    - `HYPERLIQUID_MASTER_KEY`
    - `RELAYER_PRIVATE_KEY`
    - `REFERRAL_CODE`

## Verify

11. Build the project:
    ```bash
    cd /Users/vinhlam/workspace/bot/agent-foxblaze && npm run build
    ```

12. Start in dev mode:
    ```bash
    cd /Users/vinhlam/workspace/bot/agent-foxblaze && npm run start:dev
    ```
