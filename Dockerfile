# ============================================================
# FlamePaper 1.8.8 BedWars Server — Railway Production Dockerfile
# ============================================================
FROM eclipse-temurin:21-jre-alpine

# Labels
LABEL maintainer="BedWars Server" \
      description="FlamePaper 1.8.8 BedWars1058 MULTIARENA Server"

# Environment — Railway injects PORT at runtime
ENV MINECRAFT_PORT=25565 \
    MEMORY="8G" \
    TZ=UTC

# FlamePaper is a performance-focused 1.8.8 Paper fork.
RUN apk add --no-cache bash curl tar ca-certificates

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

# Create server directory and non-root user for security
RUN adduser -D -h /server -s /bin/bash minecraft && \
    mkdir -p /server/plugins /server/worlds && \
    chown -R minecraft:minecraft /server

WORKDIR /server

# Copy FlamePaper jar (performance-focused 1.8.8 Paper fork)
COPY --chown=minecraft:minecraft FlamePaper.jar /server/server.jar

# Copy pre-built configs and scripts
COPY --chown=minecraft:minecraft server.properties /server/server.properties
COPY --chown=minecraft:minecraft bukkit.yml /server/bukkit.yml
COPY --chown=minecraft:minecraft spigot.yml /server/spigot.yml
COPY --chown=minecraft:minecraft paper.yml /server/paper.yml
COPY --chown=minecraft:minecraft commands.yml /server/commands.yml
COPY --chown=minecraft:minecraft eula.txt /server/eula.txt
COPY --chown=minecraft:minecraft start.sh /server/start.sh

# Copy all plugin JARs (BedWars + companions)
COPY --chown=minecraft:minecraft plugins-extra/*.jar /server/plugins/

# Copy Skript scripts (chat formatting, /msg, /r, mention sounds)
COPY --chown=minecraft:minecraft skript-scripts/ /server/plugins/Skript/scripts/

# Copy FastLogin config (autoRegister for premium players)
COPY --chown=minecraft:minecraft fastlogin-config/ /server/plugins/FastLogin/

# Copy AuthMe config (no forced registration — FastLogin handles premium)
COPY --chown=minecraft:minecraft authme-config/ /server/plugins/AuthMe/

# Copy LuckPerms config + pre-configured groups/users (YAML storage)
COPY --chown=minecraft:minecraft luckperms-config/config.yml /server/plugins/LuckPerms/config.yml
COPY --chown=minecraft:minecraft luckperms-config/yaml-storage/ /server/plugins/LuckPerms/yaml-storage/

# Copy lobby world (Winter Lobby BW — 1.8-compatible)
COPY --chown=minecraft:minecraft lobby/ /server/lobby/

# Copy arena maps (BedWars1058 will manage these)
COPY --chown=minecraft:minecraft world/maps/ /server/maps/

# Copy ops.json
COPY --chown=minecraft:minecraft ops.json /server/ops.json

RUN chmod +x /server/start.sh

# Build-time version marker — forces /data refresh when image changes
RUN echo "build-$(date +%s)" > /server/.image-version

# Create persistent data directory (mount Railway volume at /data)
RUN mkdir -p /data && chown minecraft:minecraft /data

# Expose Minecraft + file manager ports
EXPOSE 25565 8080

# Run as root so we can fix volume permissions at startup, then java runs as minecraft
# (Railway volume mounts override build-time ownership)
COPY --chown=root:root entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD bash -c 'echo > /dev/tcp/127.0.0.1/25565' 2>/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
