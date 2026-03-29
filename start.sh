#!/bin/bash
# ============================================================
# start.sh — FlamePaper 1.8.8 BedWars Server Startup Script
# Optimized JVM flags (Aikar's flags adapted for containers)
# ============================================================

# ---- Clean old logs to prevent volume bloat ----
if [ -d /data/logs ]; then
    echo "Cleaning old logs..."
    find /data/logs -name '*.log.gz' -mtime +1 -delete 2>/dev/null
    find /data/logs -name '*.log' ! -name 'latest.log' -mtime +1 -delete 2>/dev/null
    # Truncate latest.log if it's over 50MB
    if [ -f /data/logs/latest.log ] && [ $(stat -c%s /data/logs/latest.log 2>/dev/null || echo 0) -gt 52428800 ]; then
        echo "" > /data/logs/latest.log
    fi
fi

# ---- Persistent data: copy from image to volume ----
# Uses a version marker to detect when the image has changed.
# Player data, plugin databases, etc. in /data are preserved;
# server files (jar, configs, plugins, worlds) are always refreshed.
SERVER_DIR="/server"
IMAGE_VERSION=$(cat /server/.image-version 2>/dev/null || echo "unknown")
DATA_VERSION=$(cat /data/.image-version 2>/dev/null || echo "none")

import_arena_maps() {
    mode="$1"
    mkdir -p /data/plugins/BedWars1058/Arenas
    declare -A imported_map_names
    imported_count=0

    # Search both /server/maps (from Docker image) and /data/maps (from uploaded world.rar)
    for search_root in /server/maps /data/maps; do
        [ -d "$search_root" ] || continue
        echo "Scanning $search_root for arena map worlds..."

        while IFS= read -r -d '' level_file; do
            map_dir="$(dirname "$level_file")"
            raw_name="$(basename "$map_dir")"
            map_name="$(echo "$raw_name" | tr '[:upper:]' '[:lower:]')"
            world_target_dir="/data/$map_name"

            # Avoid accidental collisions if two nested maps share a name.
            if [ -n "${imported_map_names[$map_name]}" ]; then
                echo "Skipped duplicate arena map name: $map_name (from $map_dir)"
                continue
            fi
            imported_map_names[$map_name]=1

            if [ ! -d "$world_target_dir" ]; then
                cp -a "$map_dir" "$world_target_dir"
                echo "Imported missing world folder for map: $map_name"
                imported_count=$((imported_count + 1))
            fi
        done < <(find "$search_root" -type f -name 'level.dat' -print0)
    done

    echo "Arena import ($mode) complete: $imported_count map worlds copied to /data/."
}

sync_server_runtime_files() {
    mkdir -p /data/plugins

    # Always update server binary and startup script from image.
    cp -f /server/server.jar /data/server.jar
    cp -f /server/start.sh /data/start.sh
    chmod +x /data/start.sh

    # All plugins, configs, worlds, and scripts are managed via the panel.

    # Always update LuckPerms config from image (needs MySQL env var injection)
    mkdir -p /data/plugins/LuckPerms
    cp -f /server/plugins/LuckPerms/config.yml /data/plugins/LuckPerms/config.yml
    echo "Updated LuckPerms config from image"
    # Inject MySQL connection details from Railway addon env vars
    LP_CFG="/data/plugins/LuckPerms/config.yml"
    if [ -n "$MYSQLHOST" ]; then
        sed -i "s|LUCKPERMS_DB_HOST|${MYSQLHOST}|g" "$LP_CFG"
        sed -i "s|LUCKPERMS_DB_PORT|${MYSQLPORT:-3306}|g" "$LP_CFG"
        sed -i "s|LUCKPERMS_DB_NAME|${MYSQLDATABASE:-railway}|g" "$LP_CFG"
        sed -i "s|LUCKPERMS_DB_USER|${MYSQLUSER:-root}|g" "$LP_CFG"
        sed -i "s|LUCKPERMS_DB_PASS|${MYSQLPASSWORD}|g" "$LP_CFG"
        echo "Injected MySQL connection details into LuckPerms config"
    else
        echo "WARNING: MYSQLHOST not set — LuckPerms MySQL will fail. Add a Railway MySQL addon."
    fi
}

upsert_sound_block() {
    file="$1"
    key="$2"
    sound="$3"
    volume="$4"
    pitch="$5"
    tmp_file="${file}.tmp.$$"

    awk -v key="$key" -v sound="$sound" -v volume="$volume" -v pitch="$pitch" '
        BEGIN { found = 0; in_block = 0 }
        function print_block() {
            print key ":"
            print "  sound: " sound
            print "  volume: " volume
            print "  pitch: " pitch
        }
        {
            if (in_block == 1) {
                if ($0 ~ /^[^[:space:]#][^:]*:[[:space:]]*($|#)/) {
                    in_block = 0
                    print $0
                    next
                }
                next
            }

            if ($0 ~ ("^" key ":[[:space:]]*($|#)")) {
                found = 1
                in_block = 1
                print_block()
                next
            }

            print $0
        }
        END {
            if (found == 0) {
                print ""
                print_block()
            }
        }
    ' "$file" > "$tmp_file" && mv "$tmp_file" "$file"
}

remove_yaml_top_level_block() {
    file="$1"
    key="$2"
    tmp_file="${file}.tmp.$$"

    awk -v key="$key" '
        BEGIN { in_block = 0; removed = 0 }
        {
            if (in_block == 1) {
                if ($0 ~ /^[^[:space:]#][^:]*:[[:space:]]*($|#)/) {
                    in_block = 0
                    print $0
                }
                next
            }

            if ($0 ~ ("^" key ":[[:space:]]*($|#)")) {
                in_block = 1
                removed = 1
                next
            }

            print $0
        }
    ' "$file" > "$tmp_file" && mv "$tmp_file" "$file"
}

patch_bedwars_config_migrations() {
    config_file="/data/plugins/BedWars1058/config.yml"

    # Ensure config.yml exists (plugin will fill in defaults on startup)
    if [ ! -f "$config_file" ]; then
        mkdir -p "$(dirname "$config_file")"
        touch "$config_file"
        echo "Created empty BedWars config.yml for pre-seeding"
    fi

    # Migration is opt-in to avoid deleting newly created NPC entries on every boot.
    # Set RESET_BEDWARS_NPCS=true only when you intentionally want to clear old NPC format.
    if [ "${RESET_BEDWARS_NPCS:-false}" = "true" ]; then
        remove_yaml_top_level_block "$config_file" "lobby-npc-locations"
        echo "RESET_BEDWARS_NPCS=true -> removed BedWars lobby-npc-locations block"
    fi

    # Remove old melee-knockback section so the updated plugin regenerates with new fields.
    remove_yaml_top_level_block "$config_file" "melee-knockback"
    echo "Removed melee-knockback section from BedWars config (plugin will regenerate defaults)"

    # Remove server-ip override so the value from the seeded config is preserved
    # (m160bw config sets this to the correct domain)
    sed -i 's|format-restarting-list: false|format-restarting-list: true|' "$config_file"
    echo "Enabled BedWars player-list formatting for all game states"

    # Update allowed-commands whitelist to include hub/lobby/l
    # First remove any existing multi-line list items under allowed-commands (- item lines)
    # then replace the header with an inline array
    sed -i '/^allowed-commands:/,/^[^ -]/{/^allowed-commands:/!{/^- /d;/^  - /d}}' "$config_file"
    sed -i "s|^allowed-commands:.*|allowed-commands: [shout, bw, leave, hub, lobby, l]|" "$config_file"
    echo "Updated allowed-commands whitelist"

    # Delete shop.yml only once so the plugin regenerates updated defaults.
    # After the first delete, a marker prevents repeated deletions on future boots.
    shop_file="/data/plugins/BedWars1058/shop.yml"
    shop_marker="/data/plugins/BedWars1058/.shop-reset-v1"
    if [ -f "$shop_file" ] && [ ! -f "$shop_marker" ]; then
        rm -f "$shop_file"
        touch "$shop_marker"
        echo "Deleted shop.yml (one-time reset) — plugin will regenerate with updated defaults"
    fi

    # Lobby location from m160bw: X=-39.54, Y=72.0, Z=0.47, Yaw=-87.65, Pitch=-4.98, World=world
    if ! grep -q "^lobbyLoc:" "$config_file"; then
        echo 'lobbyLoc: "-39.54,72.0,0.47,-87.65,-4.98,world"' >> "$config_file"
        echo "Set BedWars lobby location"
    else
        sed -i 's|^lobbyLoc:.*|lobbyLoc: "-39.54,72.0,0.47,-87.65,-4.98,world"|' "$config_file"
        echo "Updated BedWars lobby location"
    fi
}

patch_bedwars_sounds() {
    sounds_file="/data/plugins/BedWars1058/sounds.yml"
    if [ ! -f "$sounds_file" ]; then
        return
    fi

        # Force a 1.8.8-valid Hypixel-like buy sound (xp orb pickup with brighter pitch).
        upsert_sound_block "$sounds_file" "shop-bought" "ORB_PICKUP" "1" "1.5"
        upsert_sound_block "$sounds_file" "shop-buy" "ORB_PICKUP" "1" "1.5"
        upsert_sound_block "$sounds_file" "bought" "ORB_PICKUP" "1" "1.5"
        # BedWars1058 exact keys (from ConfigPath / Sounds):
        # game-countdown-others, game-countdown-s5..1, game-countdown-start
        upsert_sound_block "$sounds_file" "game-countdown-others" "NOTE_STICKS" "1" "1"
        upsert_sound_block "$sounds_file" "game-countdown-s5" "ORB_PICKUP" "1" "0.7"
        upsert_sound_block "$sounds_file" "game-countdown-s4" "ORB_PICKUP" "1" "0.8"
        upsert_sound_block "$sounds_file" "game-countdown-s3" "ORB_PICKUP" "1" "1.0"
        upsert_sound_block "$sounds_file" "game-countdown-s2" "ORB_PICKUP" "1" "1.2"
        upsert_sound_block "$sounds_file" "game-countdown-s1" "ORB_PICKUP" "1" "2.0"
        # Must use sound NONE to mute. BedWars forces volume/pitch <= 0 back to 1.
        upsert_sound_block "$sounds_file" "game-countdown-start" "NONE" "1" "1"
        echo "Patched BedWars sounds to Hypixel-like preset (buy + countdown)"
}

patch_bedwars_messages() {
    lang_dir="/data/plugins/BedWars1058/Languages"
    lang_file="$lang_dir/messages_en.yml"
    mkdir -p "$lang_dir"
    # Only seed the messages file if it doesn't exist yet.
    # This preserves any manual edits or plugin-generated defaults across redeployments.
    if [ -f "$lang_file" ]; then
        echo "BedWars messages_en.yml already exists — preserving existing file"
        return
    fi
    cat > "$lang_file" <<'LANGEOF'
format-papi-player-team: "{TeamColor}"
format-chat-team: "{level}{team}{playername}&f: {message}"
format-chat-global: "{level}&6[SHOUT] {team}{playername}&f: {message}"
format-chat-waiting: "{level}{teamColor}{playername}&f: {message}"
format-chat-spectator: "{level}&7[SPECTATOR] {playername}&f: {message}"
format-tab:
  lobby:
    prefix:
      - "{vPrefix}"
    suffix:
      - " {level}"
  waiting:
    player:
      prefix:
        - "{teamColor}"
      suffix:
        - ""
    spectator:
      prefix:
        - "&7Spectator "
      suffix:
        - ""
  starting:
    player:
      prefix:
        - "{teamColor}"
      suffix:
        - ""
    spectator:
      prefix:
        - "&7Spectator "
      suffix:
        - ""
  playing:
    alive:
      prefix:
        - "{teamColor}"
      suffix:
        - " {level}"
    eliminated:
      prefix:
        - "&f&oSpectator "
      suffix:
        - " &c&oEliminated"
    spectator:
      prefix:
        - "&7Spectator "
      suffix:
        - " {level}"
  restarting:
    winner-alive:
      prefix:
        - "{teamColor}"
      suffix:
        - " {level}"
    winner-dead:
      prefix:
        - "{teamColor}"
      suffix:
        - " {level}"
    loser:
      prefix:
        - "{teamColor}"
      suffix:
        - " {level}"
    spectator:
      prefix:
        - "&7Spectator "
      suffix:
        - ""
LANGEOF
    echo "Seeded BedWars messages_en.yml (first boot — chat + tab format overrides)"
}

# ---- Auto-extract arena map zips uploaded via File Browser ----
# Upload a zip containing arena world folders to /data/ and it will be extracted on next restart.
# After extraction the zip is renamed to .zip.done so it won't be extracted again.
# Handles both flat zips (airshow/, amazon/...) and wrapped zips (m160bw/airshow/, m160bw/amazon/...).
extract_uploaded_archives() {
    # Clean up any stuck temp dirs from previous failed extractions
    for stale in /data/.archive-extract-*; do
        [ -d "$stale" ] || continue
        echo "Cleaning stuck temp dir: $stale"
        chmod -R u+rwX "$stale" 2>/dev/null
        rm -rf "$stale" 2>/dev/null
    done

    for archive in /data/*.zip /data/*.rar; do
        [ -f "$archive" ] || continue
        # Skip non-arena files (File Browser db, etc.)
        case "$(basename "$archive")" in
            .filebrowser.*|filebrowser.*) continue ;;
        esac
        echo "Found uploaded archive: $archive — extracting..."
        tmpdir="/data/.archive-extract-$$"
        rm -rf "$tmpdir" 2>/dev/null
        mkdir -p "$tmpdir"
        case "$archive" in
            *.zip) unzip -o -q "$archive" -d "$tmpdir" ;;
            *.rar) bsdtar xf "$archive" -C "$tmpdir" ;;
        esac
        if [ $? -eq 0 ]; then
            # If archive extracted into a single subfolder, move contents up
            entries=$(ls "$tmpdir" 2>/dev/null)
            entry_count=$(echo "$entries" | wc -w)
            single_dir="$tmpdir/$entries"
            if [ "$entry_count" -eq 1 ] && [ -d "$single_dir" ]; then
                echo "Detected wrapper folder '$entries' — moving contents up to /data/"
                cp -a "$single_dir"/* /data/ 2>/dev/null || true
                cp -a "$single_dir"/.* /data/ 2>/dev/null || true
            else
                cp -a "$tmpdir"/* /data/ 2>/dev/null || true
            fi
            chmod -R u+rwX "$tmpdir" 2>/dev/null
            rm -rf "$tmpdir"
            mv "$archive" "${archive}.done"
            echo "Extracted and renamed to ${archive}.done"
        else
            chmod -R u+rwX "$tmpdir" 2>/dev/null
            rm -rf "$tmpdir"
            echo "WARNING: Failed to extract $archive"
        fi
    done
}

if [ -d /data ] && [ -w /data ]; then
    extract_uploaded_archives
    if [ "$IMAGE_VERSION" != "$DATA_VERSION" ]; then
        echo "Updating /data from image (image=$IMAGE_VERSION, data=$DATA_VERSION)..."
        # Update jars/binaries while preserving existing runtime settings and worlds.
        sync_server_runtime_files
        # Import missing map templates/worlds without overwriting existing ones.
        import_arena_maps refresh
        cp /server/.image-version /data/.image-version
        echo "Copy complete."
    else
        echo "Data is up to date (version=$DATA_VERSION)."
    fi
    # Always ensure missing arena maps are present on persistent volume.
    import_arena_maps ensure
    # Apply BedWars config migrations on persistent config files.
    patch_bedwars_config_migrations
    # Always enforce live BedWars sound key on persistent config.
    patch_bedwars_sounds
    # Seed BedWars messages with chat format overrides (remove team name labels).
    patch_bedwars_messages
    SERVER_DIR="/data"
else
    echo "WARNING: /data is not writable or missing — running from /server (no persistence)."
fi

cd "$SERVER_DIR"

# Built-in web file manager (File Browser)
FILE_MANAGER_PORT="${FILE_MANAGER_PORT:-8081}"
FILE_MANAGER_USERNAME="${FILE_MANAGER_USERNAME:-admin}"
FILE_MANAGER_PASSWORD="${FILE_MANAGER_PASSWORD:-adminadmin123}"
FILE_MANAGER_DB="${FILE_MANAGER_DB:-/data/.filebrowser.db}"

if command -v filebrowser >/dev/null 2>&1; then
    mkdir -p "$(dirname "$FILE_MANAGER_DB")"
    # Force re-init DB so root path updates from /server to /data
    rm -f "$FILE_MANAGER_DB"
    if [ ! -f "$FILE_MANAGER_DB" ]; then
        filebrowser config init \
            -a 0.0.0.0 \
            -p "$FILE_MANAGER_PORT" \
            -r /data \
            --baseurl /files \
            -d "$FILE_MANAGER_DB" >/dev/null 2>&1 || true
        filebrowser users add "$FILE_MANAGER_USERNAME" "$FILE_MANAGER_PASSWORD" --perm.admin -d "$FILE_MANAGER_DB" >/dev/null 2>&1 || true
        echo "File manager DB initialized with default admin user"
    fi
    filebrowser \
        -a 0.0.0.0 \
        -p "$FILE_MANAGER_PORT" \
        -r /data \
        --baseurl /files \
        -d "$FILE_MANAGER_DB" >/tmp/filebrowser.log 2>&1 &
    echo "File manager started on port ${FILE_MANAGER_PORT} (user: ${FILE_MANAGER_USERNAME})"
else
    echo "File manager binary not found; skipping file manager startup"
fi

# Web console (ttyd + mcrcon) — accessible at /console
CONSOLE_USERNAME="${FILE_MANAGER_USERNAME}"
CONSOLE_PASSWORD="${FILE_MANAGER_PASSWORD}"
if command -v ttyd >/dev/null 2>&1; then
    ttyd -p 7681 -b /console \
        -c "${CONSOLE_USERNAME}:${CONSOLE_PASSWORD}" \
        /server/console.sh >/tmp/ttyd.log 2>&1 &
    echo "Web console started (ttyd) — /console"
fi

# Nginx reverse proxy — combines file manager + console on port 8080
if command -v nginx >/dev/null 2>&1; then
    nginx -g 'daemon on;' >/tmp/nginx-startup.log 2>&1
    if [ $? -eq 0 ]; then
        echo "Nginx reverse proxy started on port 8080"
    else
        echo "WARNING: nginx failed to start — see /tmp/nginx-startup.log"
        cat /tmp/nginx-startup.log 2>/dev/null
    fi
fi

# Server management panel (Node.js) — auto-restart on crash
if command -v node >/dev/null 2>&1 && [ -f /server/panel/server.cjs ]; then
    (
        while true; do
            echo "[panel] Starting panel..."
            cd /server/panel && node server.cjs 2>&1 | tee /tmp/panel.log
            EXIT_CODE=$?
            echo "[panel] Panel exited with code $EXIT_CODE — restarting in 3s..."
            sleep 3
        done
    ) &
    echo "Server panel started on port 3000 (with auto-restart)"
    cd "$SERVER_DIR"
fi

# Railway TCP proxy forwards external traffic to port 25565.
# Always bind to 25565 regardless of Railway's PORT env var.
MINECRAFT_PORT=25565

# Memory — use MEMORY env var, default 8G
# Railway Pro plans can go higher; adjust via Railway dashboard env vars
MEMORY="${MEMORY:-8G}"

echo "============================================"
echo " Starting FlamePaper 1.8.8 BedWars Server"
echo " Memory: ${MEMORY}"
echo " Port: ${MINECRAFT_PORT}"
echo " Data dir: $(pwd)"
echo "============================================"

# Gamerules for permanent daytime are set in-game once:
#   /gamerule doDaylightCycle false
#   /gamerule doWeatherCycle false
#   /time set 6000
# They persist in the world save automatically.

# Aikar's JVM Flags — adapted for containers
exec java \
    -Xms${MEMORY} \
    -Xmx${MEMORY} \
    -XX:+UseG1GC \
    -XX:+ParallelRefProcEnabled \
    -XX:MaxGCPauseMillis=100 \
    -XX:+UnlockExperimentalVMOptions \
    -XX:+DisableExplicitGC \
    -XX:+AlwaysPreTouch \
    -XX:G1NewSizePercent=30 \
    -XX:G1MaxNewSizePercent=40 \
    -XX:G1HeapRegionSize=8M \
    -XX:G1ReservePercent=20 \
    -XX:G1HeapWastePercent=5 \
    -XX:G1MixedGCCountTarget=4 \
    -XX:InitiatingHeapOccupancyPercent=15 \
    -XX:G1MixedGCLiveThresholdPercent=90 \
    -XX:G1RSetUpdatingPauseTimePercent=5 \
    -XX:SurvivorRatio=32 \
    -XX:+PerfDisableSharedMem \
    -XX:MaxTenuringThreshold=1 \
    -Djava.net.preferIPv4Stack=true \
    -Dusing.aikars.flags=https://mcflags.emc.gs \
    -Daikars.new.flags=true \
    -Dcom.mojang.eula.agree=true \
    -jar /server/server.jar \
    --nojline
