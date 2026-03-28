const { R } = require("redbean-node");
const { log } = require("../src/util");
const http = require("http");
const fs = require("fs");

const DEFAULTS = {
    type: "http",
    interval: 60,
    maxretries: 1,
    timeout: 48,
    active: 1,
    accepted_statuscodes_json: '["200-299"]',
    maxredirects: 10,
    method: "GET",
};

const DOCKER_SOCKET = "/var/run/docker.sock";

/**
 * Make an HTTP GET request to the Docker Engine API via Unix socket.
 *
 * @param {string} endpoint API path, e.g. "/containers/json"
 * @param {string} socketPath Path to Docker socket (injectable for testing)
 * @returns {Promise<object>} Parsed JSON response
 */
async function queryDockerSocket(endpoint, socketPath = DOCKER_SOCKET) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            socketPath,
            path: endpoint,
            method: "GET",
        }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error("Failed to parse Docker API response: " + e.message));
                }
            });
        });
        req.setTimeout(5000, () => {
            req.destroy(new Error("Docker socket request timed out"));
        });
        req.on("error", reject);
    });
}

/**
 * Discover running local Docker containers via the Docker socket and return
 * monitor spec objects for each one that has a host-mapped port.
 *
 * Self-exclusion: skips the container whose ID starts with process.env.HOSTNAME
 * (Docker sets HOSTNAME to the short container ID by default).
 *
 * @param {string} urlTemplate URL template with {port} placeholder
 * @param {string} socketPath Path to Docker socket (injectable for testing)
 * @param {Function|null} queryFn Optional override for queryDockerSocket (for testing)
 * @returns {Promise<Array>} Array of monitor spec objects
 */
async function discoverDockerContainers(
    urlTemplate = "http://localhost:{port}/",
    socketPath = DOCKER_SOCKET,
    queryFn = null
) {
    const query = queryFn ?? ((ep) => queryDockerSocket(ep, socketPath));

    // Check socket is accessible before trying to connect
    try {
        fs.accessSync(socketPath, fs.constants.R_OK);
    } catch (e) {
        throw new Error(`Docker socket not accessible at ${socketPath}: ${e.message}`);
    }

    const containers = await query("/containers/json");
    const selfHostname = process.env.HOSTNAME || "";
    const specs = [];

    for (const container of containers) {
        // Exclude self
        if (selfHostname && container.Id && container.Id.startsWith(selfHostname)) {
            continue;
        }

        // Find first host-mapped port
        const hostPort = (container.Ports || [])
            .filter((p) => p.PublicPort)
            .map((p) => p.PublicPort)[0];

        if (!hostPort) {
            continue;
        }

        // Container name has a leading slash, strip it
        const name = (container.Names?.[0] || container.Id).replace(/^\//, "");
        const url = urlTemplate.replace("{port}", hostPort);

        specs.push({ name, url, interval: 20, maxretries: 2 });
    }

    return specs;
}

/**
 * Seed monitors from environment configuration.
 *
 * Two modes (manual takes precedence):
 *   1. Manual:       UPTIME_KUMA_MONITORS='[{...}]' — explicit JSON array
 *   2. Auto-discover: UPTIME_KUMA_AUTO_DISCOVER=true — query Docker socket
 *
 * Seeding is idempotent: monitors with the same URL are skipped.
 * Monitors added through the UI are never affected.
 *
 * @param {import("socket.io").Server} io Socket.io server instance
 * @param {object} server UptimeKumaServer instance (exposes monitorList)
 * @param {Function|null} startFn Optional override for starting a monitor
 * @param {Function|null} discoverFn Optional override for discoverDockerContainers (for testing)
 * @returns {Promise<void>}
 */
async function seedMonitorsFromEnv(io, server, startFn = null, discoverFn = null) {
    let specs;

    const raw = process.env.UPTIME_KUMA_MONITORS;

    if (raw) {
        // Manual mode
        try {
            specs = JSON.parse(raw);
        } catch (e) {
            log.error("seeder", "UPTIME_KUMA_MONITORS is not valid JSON: " + e.message);
            return;
        }
    } else if (process.env.UPTIME_KUMA_AUTO_DISCOVER === "true") {
        // Auto-discover mode
        const urlTemplate = process.env.UPTIME_KUMA_MONITOR_URL_TEMPLATE || "http://localhost:{port}/";
        const discover = discoverFn ?? discoverDockerContainers;
        try {
            specs = await discover(urlTemplate);
            log.info("seeder", `Auto-discovered ${specs.length} container(s) via Docker socket`);
        } catch (e) {
            log.warn("seeder", "Docker auto-discovery failed: " + e.message);
            return;
        }
    } else {
        return;
    }

    if (!Array.isArray(specs) || specs.length === 0) {
        return;
    }

    const user = await R.findOne("user");
    if (!user) {
        log.warn("seeder", "No user found — skipping monitor seeding. Create an account first, then restart the server.");
        return;
    }

    for (const spec of specs) {
        if (!spec.name || !spec.url) {
            log.warn("seeder", "Skipping monitor entry missing 'name' or 'url': " + JSON.stringify(spec));
            continue;
        }

        const existing = await R.findOne("monitor", " url = ? AND user_id = ? ", [ spec.url, user.id ]);
        if (existing) {
            log.info("seeder", `Monitor already exists, skipping: ${spec.name} (${spec.url})`);
            continue;
        }

        const bean = R.dispense("monitor");
        bean.import({ ...DEFAULTS, ...spec });
        bean.user_id = user.id;
        await R.store(bean);

        server.monitorList[bean.id] = bean;
        const _start = startFn ?? ((b, ioInstance) => b.start(ioInstance));
        await _start(bean, io);

        log.info("seeder", `Seeded monitor: ${spec.name} (${spec.url})`);
    }
}

module.exports = { seedMonitorsFromEnv, discoverDockerContainers, queryDockerSocket };
