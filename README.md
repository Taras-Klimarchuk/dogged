# Hot Dog Resilience Lab

A study project built while working through Michael Nygard's **Release It!** with a mentor. Models a hot dog vendor system as three NestJS services and uses it to practice the book's stability patterns — timeouts, retry with exponential backoff + jitter, circuit breakers, and fallback/cached state — against real network calls between containers, not simulations.

## Architecture

- **`apps/terminal`** — simulated vendor client (stand-in for what would be frontend/POS code in a real system). Fetches the menu and registers orders against `orders-management`, applying client-side retry + circuit breaker. Swagger at `/docs`.
- **`apps/orders-management`** — shared backend: inventory, idempotent order registration, Postgres-backed. Itself wraps its outbound call to `warehouse` in the same resilience policies. Swagger at `/docs`.
- **`apps/warehouse`** — receives delivery requests from `orders-management`, Postgres-backed. Swagger at `/docs`.
- **`libs/resilience`** — shared [cockatiel](https://github.com/connor4312/cockatiel) retry/circuit-breaker policies, used by both `terminal` and `orders-management`.

One NestJS monorepo, one Postgres instance (two databases: `orders_management`, `warehouse`), two Docker networks:
- `edge-net`: `terminal` ↔ `orders-management`
- `backend-net`: `orders-management` ↔ `warehouse` ↔ `postgres`

`terminal` is **not** attached to `backend-net` — it has no network path to `warehouse` or the database, enforcing the same topology as the system's sequence diagrams at the infrastructure level, not just in application code.

## Running it

```bash
cp .env.example .env
docker compose up --build
```

- Terminal: http://localhost:3000/docs
- Orders Management: http://localhost:3001/docs
- Warehouse: http://localhost:3002/docs

## Local development (without Docker)

```bash
npm install
npm run start:terminal:dev            # apps/terminal, no DB required
npm run start:orders-management:dev   # needs Postgres reachable at POSTGRES_HOST
npm run start:warehouse:dev           # needs Postgres reachable at POSTGRES_HOST
```

Other scripts: `npm test` (unit, vitest), `npm run test:e2e` (e2e — orders-management/warehouse need a live Postgres, e.g. via `docker compose up postgres`), `npm run lint` (oxlint), `npm run build:all`.

## Status

Infrastructure scaffold only: Nest monorepo, Docker/Compose, Swagger, TypeORM + Postgres wiring, and network topology are in place and verified end-to-end. Not yet implemented: menu/inventory/order domain logic, the `/admin/chaos` fault-injection endpoints, and the actual retry/circuit-breaker policies in `libs/resilience` — those are being built next, module by module.
