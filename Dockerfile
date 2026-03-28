FROM louislam/uptime-kuma:2
COPY server/monitor-seeder.js /app/server/monitor-seeder.js
COPY server/server.js /app/server/server.js
