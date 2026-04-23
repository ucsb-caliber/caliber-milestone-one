# Coding Runner Setup

## Goal

Caliber supports two execution modes for coding questions:

- Localhost development: the main backend uses the built-in local executor, with no runner container required.
- Server / Docker deployment: the main backend sends coding runs to a separate `coding-runner` service over an internal Docker network.

That gives you a simple local workflow and a safer server architecture.

## How The URL Works

`CODING_RUNNER_URL` tells the main backend where the dedicated runner service lives.

- If `CODING_RUNNER_URL` is blank or unset, the backend falls back to the built-in local executor.
- If `CODING_RUNNER_URL` is set, the backend sends coding runs to `POST <CODING_RUNNER_URL>/internal/execute`.

Examples:

```env
# local dev
CODING_RUNNER_URL=
```

```env
# server / docker compose
CODING_RUNNER_URL=http://coding-runner:8010
```

## Local Development

Use this mode when you are working on localhost and do not want to run a separate runner container.

`backend/.env`:

```env
CODING_RUNNER_URL=
CODING_RUNNER_USE_DOCKER=false
```

Then run the backend normally:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Behavior:

- `Run Code` and coding assignment submission still work.
- The backend executes the C++ harness directly on your machine.
- No runner container is required.

## Server / Docker Compose

Use the provided root `docker-compose.yml`.

Start the services:

```bash
docker compose up --build
```

The compose stack creates:

- `backend`: the main app
- `coding-runner`: the dedicated execution service

Inside this Docker network, the backend reaches the runner at:

```env
CODING_RUNNER_URL=http://coding-runner:8010
```

The runner service is not published publicly. It is only exposed to the backend inside the Compose network.

## Fresh Container Per Submission

The dedicated `coding-runner` service can execute each code run in a fresh short-lived Docker container.

Use:

```env
CODING_RUNNER_USE_DOCKER=true
CODING_RUNNER_CPP_IMAGE=gcc:14
```

In this setup:

- the main backend never gets Docker access
- only the `coding-runner` service has `/var/run/docker.sock`
- each student run can be compiled and executed in a fresh isolated container

That is the intended server architecture.

## Docker Compose Shape

The provided compose file does this:

- backend reads `backend/.env`
- backend defaults `CODING_RUNNER_URL` to `http://coding-runner:8010`
- coding-runner starts `uvicorn runner_service:app`
- coding-runner mounts the Docker socket so it can launch fresh execution containers

## Recommended Env Values

### Localhost

```env
CODING_RUNNER_URL=
CODING_RUNNER_USE_DOCKER=false
CODING_RUNNER_CPP_IMAGE=gcc:14
```

### Server

```env
CODING_RUNNER_URL=http://coding-runner:8010
CODING_RUNNER_USE_DOCKER=true
CODING_RUNNER_CPP_IMAGE=gcc:14
```

## Operational Notes

- Keep `coding-runner` off the public internet unless you add your own authentication layer in front of it.
- The Docker socket should be mounted only into the runner container, never into the main backend.
- If you deploy on a single server, Docker Compose service names are enough. You do not need a separate cloud internal load balancer.
- If you later move to Kubernetes or another orchestrator, `CODING_RUNNER_URL` can point at that internal service name instead.

## Current C++ Test Format

The current implementation expects visible and hidden tests to be trusted C++ snippets that return `bool`, for example:

```cpp
Solution s;
return s.solve(4) == 4;
```

This keeps the MVP simple and LeetCode-style without needing a full signature parser.
