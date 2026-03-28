<div align="center" width="100%">
    <img src="./public/icon.svg" width="128" alt="Uptime Kuma Logo" />
</div>

# Uptime Kuma (forked)

A self-hosted monitoring tool with automatic Docker container discovery. This fork adds the ability to auto-discover and monitor all running local Docker containers at startup — no manual configuration needed.

<img src="https://user-images.githubusercontent.com/1336778/212262296-e6205815-ad62-488c-83ec-a5b0d0689f7c.jpg" width="700" alt="Uptime Kuma Dashboard Screenshot" />

## Features

All original Uptime Kuma features, plus:

- **Auto-discover local Docker containers** via Docker socket at startup
- **Pre-seed monitors** via `UPTIME_KUMA_MONITORS` environment variable (JSON array)
- Monitors are seeded immediately after account creation — no restart needed
- Seeding is idempotent — existing monitors are never duplicated, UI-added monitors are unaffected

Original features:
- Monitoring uptime for HTTP(s) / TCP / HTTP(s) Keyword / HTTP(s) Json Query / Websocket / Ping / DNS Record / Push / Steam Game Server / Docker Containers
- Fancy, Reactive, Fast UI/UX
- Notifications via Telegram, Discord, Gotify, Slack, Pushover, Email (SMTP), and 90+ notification services
- 20-second intervals
- Multiple status pages
- Ping chart, Certificate info, Proxy support, 2FA support

---

## Installation

### Option 1 — Docker Run (pull from Docker Hub)

**Auto-discover all running local containers:**

```bash
docker run -d \
  --name uptime-kuma \
  --restart always \
  --network host \
  -v uptime-kuma-data:/app/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e UPTIME_KUMA_AUTO_DISCOVER=true \
  -e UPTIME_KUMA_PORT=3001 \
  gsllucas/uptime-kuma:latest
```

**Or pass monitors manually:**

```bash
docker run -d \
  --name uptime-kuma \
  --restart always \
  --network host \
  -v uptime-kuma-data:/app/data \
  -e 'UPTIME_KUMA_MONITORS=[{"name":"My API","url":"http://localhost:3000/health","interval":20,"maxretries":2}]' \
  -e UPTIME_KUMA_PORT=3001 \
  gsllucas/uptime-kuma:latest
```

Uptime Kuma will be available at **http://localhost:3001** (or whichever port you set).

> [!NOTE]
> After creating your account on first setup, monitors are seeded immediately. If the dashboard does not show the monitors on first load, **refresh the browser page**.

---

### Option 2 — Docker Compose

**1. Clone this repo and start with auto-discovery:**

```bash
git clone https://github.com/gsllucas/uptime-kuma.git
cd uptime-kuma
npm run kuma
```

The `compose.yaml` is pre-configured with `UPTIME_KUMA_AUTO_DISCOVER=true` and the Docker socket mounted. All running local containers will be discovered and monitored automatically.

**`compose.yaml` reference:**

```yaml
services:
  uptime-kuma:
    build: .
    container_name: uptime-kuma
    restart: always
    network_mode: host
    volumes:
      - uptime-kuma-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      UPTIME_KUMA_AUTO_DISCOVER: "true"
      # Or use manual monitors instead:
      # UPTIME_KUMA_MONITORS: |
      #   [
      #     {"name": "My API", "url": "http://localhost:3000/health", "interval": 20, "maxretries": 2}
      #   ]

volumes:
  uptime-kuma-data:
```

**2. Open http://localhost:3001 and create your admin account.**

Monitors will be seeded immediately after account creation.

---

## Environment Variables

| Variable | Description |
|---|---|
| `UPTIME_KUMA_PORT` | Port the server listens on. Default: `3001`. |
| `UPTIME_KUMA_AUTO_DISCOVER` | Set to `"true"` to auto-discover all running Docker containers via the Docker socket. Requires `/var/run/docker.sock` to be mounted. |
| `UPTIME_KUMA_MONITORS` | JSON array of monitor specs to seed at startup. Takes precedence over auto-discovery. |
| `UPTIME_KUMA_MONITOR_URL_TEMPLATE` | URL template for auto-discovered monitors. Default: `http://localhost:{port}/`. |

### Monitor object fields

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | string | **required** | Display name shown in the dashboard |
| `url` | string | **required** | URL to monitor |
| `type` | string | `"http"` | Monitor type: `http`, `tcp`, `ping`, `dns`, `keyword`, `push`, etc. |
| `interval` | int | `60` | Seconds between checks |
| `timeout` | int | `48` | Request timeout in seconds |
| `maxretries` | int | `1` | Failures before alerting |
| `method` | string | `"GET"` | HTTP method |
| `active` | bool | `true` | Whether to start monitoring immediately |
| `maxredirects` | int | `10` | Max redirects to follow |
| `accepted_statuscodes_json` | string | `'["200-299"]'` | Accepted HTTP status codes or ranges |

---

## How Auto-Discovery Works

When `UPTIME_KUMA_AUTO_DISCOVER=true` is set and `/var/run/docker.sock` is mounted:

1. At startup (and right after account creation on first run), the server queries the Docker Engine API for all running containers
2. For each container with a host-mapped port, a monitor is created pointing to `http://localhost:{port}/`
3. The uptime-kuma container itself is excluded automatically
4. Containers with no port mappings are skipped

Re-running or restarting will not duplicate monitors — the seeder is idempotent.

---

## Screenshots

Light Mode:

<img src="https://uptime.kuma.pet/img/light.jpg" width="512" alt="Uptime Kuma Light Mode" />

Status Page:

<img src="https://user-images.githubusercontent.com/1336778/134628766-a3fe0981-0926-4285-ab46-891a21c3e4cb.png" width="512" alt="Uptime Kuma Status Page" />

---

## Original Project

This is a fork of [louislam/uptime-kuma](https://github.com/louislam/uptime-kuma).
All credits for the original application go to [@louislam](https://github.com/louislam) and contributors.
