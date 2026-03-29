# ============================================================
# FlamePaper 1.8.8 BedWars Server — Railway Production Dockerfile
# ============================================================
FROM eclipse-temurin:17-jre-alpine

# Labels
LABEL maintainer="BedWars Server" \
      description="FlamePaper 1.8.8 BedWars1058 MULTIARENA Server"

# Environment — Railway injects PORT at runtime
ENV MINECRAFT_PORT=25565 \
    MEMORY="28G" \
    TZ=Asia/Singapore

# FlamePaper is a performance-focused 1.8.8 Paper fork.
RUN apk add --no-cache bash curl tar ca-certificates unzip libarchive-tools nodejs npm

# Install File Browser (web file manager)
ARG FILEBROWSER_VERSION=v2.31.2
RUN ARCH="$(uname -m)" && \
        case "$ARCH" in \
            x86_64) FB_ARCH="amd64" ;; \
            aarch64) FB_ARCH="arm64" ;; \
            *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
        esac && \
        curl -fsSL "https://github.com/filebrowser/filebrowser/releases/download/${FILEBROWSER_VERSION}/linux-${FB_ARCH}-filebrowser.tar.gz" -o /tmp/filebrowser.tar.gz && \
        tar -xzf /tmp/filebrowser.tar.gz -C /usr/local/bin filebrowser && \
        chmod +x /usr/local/bin/filebrowser && \
        rm -f /tmp/filebrowser.tar.gz

# Install nginx (reverse proxy for file manager + web console on single port)
RUN apk add --no-cache nginx && \
    mkdir -p /run/nginx /var/lib/nginx/tmp

# Install ttyd (web-based terminal)
ARG TTYD_VERSION=1.7.7
RUN ARCH="$(uname -m)" && \
    case "$ARCH" in \
        x86_64) TTYD_ARCH="x86_64" ;; \
        aarch64) TTYD_ARCH="aarch64" ;; \
        *) echo "Unsupported arch: $ARCH" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}" \
        -o /usr/local/bin/ttyd && \
    chmod +x /usr/local/bin/ttyd

# Build mcrcon (Minecraft RCON CLI client)
RUN apk add --no-cache --virtual .build-deps gcc musl-dev && \
    curl -fsSL https://github.com/Tiiffi/mcrcon/archive/refs/tags/v0.7.2.tar.gz | tar xz -C /tmp && \
    cd /tmp/mcrcon-0.7.2 && \
    gcc -std=gnu11 -pedantic -Wall -Wextra -O2 -s -o /usr/local/bin/mcrcon mcrcon.c && \
    rm -rf /tmp/mcrcon-0.7.2 && \
    apk del .build-deps

# Create server directory and non-root user for security
RUN adduser -D -h /server -s /bin/bash minecraft && \
    mkdir -p /server/plugins /server/worlds && \
    chown -R minecraft:minecraft /server && \
    chown -R minecraft:minecraft /run/nginx /var/lib/nginx /var/log/nginx

WORKDIR /server

# Copy FlamePaper jar (performance-focused 1.8.8 Paper fork)
COPY --chown=minecraft:minecraft FlamePaper.jar /server/server.jar

# Copy pre-built configs and scripts
COPY --chown=minecraft:minecraft server.properties /server/server.properties
COPY --chown=minecraft:minecraft bukkit.yml /server/bukkit.yml
COPY --chown=minecraft:minecraft spigot.yml /server/spigot.yml
COPY --chown=minecraft:minecraft paper.yml /server/paper.yml
COPY --chown=minecraft:minecraft pandaspigot.yml /server/pandaspigot.yml
COPY --chown=minecraft:minecraft flamepaper.yml /server/flamepaper.yml
COPY --chown=minecraft:minecraft commands.yml /server/commands.yml
COPY --chown=minecraft:minecraft help.yml /server/help.yml
COPY --chown=minecraft:minecraft permissions.yml /server/permissions.yml
COPY --chown=minecraft:minecraft wepif.yml /server/wepif.yml
COPY --chown=minecraft:minecraft eula.txt /server/eula.txt
COPY --chown=minecraft:minecraft start.sh /server/start.sh

# All plugins, configs, worlds, and scripts are managed via the panel.
# Only LuckPerms config is synced (needs MySQL env var injection at boot).
COPY --chown=minecraft:minecraft luckperms-config/config.yml /server/plugins/LuckPerms/config.yml

# Arena map worlds (~1GB) are uploaded via File Browser at runtime.
# BedWars1058 arena configs reference them by folder name.
RUN mkdir -p /server/maps

# Copy nginx config and console wrapper
COPY nginx.conf /etc/nginx/nginx.conf
COPY --chown=minecraft:minecraft console.sh /server/console.sh
RUN chmod +x /server/console.sh

# Copy and build server management panel
COPY --chown=minecraft:minecraft panel/ /server/panel/
RUN cd /server/panel && npm install --production && chown -R minecraft:minecraft /server/panel

RUN chmod +x /server/start.sh

# Build-time version marker — forces /data refresh when image changes
RUN echo "build-$(date +%s)" > /server/.image-version

# Create persistent data directory (mount Railway volume at /data)
RUN mkdir -p /data && chown minecraft:minecraft /data

# Expose Minecraft + file manager + RCON ports
EXPOSE 25565 8080 25575

# Run as root so we can fix volume permissions at startup, then java runs as minecraft
# (Railway volume mounts override build-time ownership)
COPY --chown=root:root entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD bash -c 'echo > /dev/tcp/127.0.0.1/25565' 2>/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
