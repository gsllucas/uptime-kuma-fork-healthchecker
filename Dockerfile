FROM louislam/uptime-kuma:2
ENV UV_THREADPOOL_SIZE=4
ENV NODE_OPTIONS="--max-old-space-size=256"
COPY server/monitor-seeder.js /app/server/monitor-seeder.js
COPY server/server.js /app/server/server.js
