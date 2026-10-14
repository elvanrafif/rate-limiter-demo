# Rate Limiter Demo

**Live demo:** [Try it here](https://your-demo-domain.example) *(replace this placeholder after deploying)*  
**Source:** [GitHub repository](https://github.com/your-username/rate-limiter-demo) *(replace `your-username` with your GitHub account)*

A small Express API and static browser UI for comparing three Redis-backed rate limiting algorithms. Each browser receives a separate client ID stored in `localStorage`; the fixed limit is 10 requests per 60 seconds.

## Run locally

Requirements: Docker and Docker Compose.

```sh
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Redis is only reachable inside the Compose network and is intentionally not published to the host. The demo Redis instance is in-memory; its counters reset if the container is recreated.

## Algorithms

| Algorithm | How it works | Trade-off |
| --- | --- | --- |
| **Fixed Window Counter** | Increments a Redis counter for the current 60-second window. | Small and fast, but traffic can burst across a window boundary. |
| **Sliding Window Log** | Keeps request timestamps in a Redis sorted set and counts the trailing 60 seconds. | Precise, but stores one entry per request. |
| **Token Bucket** | Holds up to 10 tokens and refills continuously at 10 tokens per minute. | Allows short bursts while controlling the long-term rate. |

Fixed Window uses Redis `INCR` with a window TTL. Sliding Window Log and Token Bucket use Lua scripts so concurrent requests cannot race between reading and updating state.

## API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/demo/fixed-window` | Try Fixed Window Counter. |
| `POST` | `/api/demo/sliding-log` | Try Sliding Window Log. |
| `POST` | `/api/demo/token-bucket` | Try Token Bucket. |
| `POST` | `/api/reset` | Reset the calling client's counters. |
| `GET` | `/api/health` | App liveness check. |

Demo requests accept an optional `x-client-id` header. The UI creates and persists one automatically; API calls without it use the request IP. Responses include `X-RateLimit-Limit` and `X-RateLimit-Remaining`; a rejected request returns `429`, a `Retry-After` header, and `retryAfterSeconds` in its JSON body. Unknown algorithms return `400`. If Redis is unavailable, rate-limited API calls return `503`; the health endpoint remains live.

## Tests

Tests use a real Redis instance at `REDIS_URL` (default `redis://127.0.0.1:6379`). Start Redis locally, then run:

```sh
npm ci
npm test
```

For example, with Redis installed locally, run `redis-server --port 6379 --save "" --appendonly no` in another terminal. Tests cover the 10-request limit, recovery, concurrent requests, API headers, reset behavior, and Redis errors.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | App listen port. Compose maps this host port to the same container port. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL; Compose sets it to `redis://redis:6379`. |

## Deploy with Coolify

1. Push this repository to GitHub and create a **Docker Compose** resource in Coolify.
2. Set the repository and Compose file to `docker-compose.yml`.
3. Attach a domain only to the `app` service, on the port configured by `PORT` (default `3000`). Do not expose the `redis` service.
4. Set `PORT` to `3000` unless you also update the app's internal port mapping; the Compose file maps the selected value on both sides.
5. Deploy. Coolify's app health check calls `/api/health`; verify the domain loads the demo and send requests to each algorithm.

The `x-client-id` header identifies a demo client, not an authenticated user. Anyone can choose a different ID; this project demonstrates rate limiter mechanics, not an abuse-resistant public API.
