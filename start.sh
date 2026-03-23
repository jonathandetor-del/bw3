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
    if [ ! -d /server/maps ]; then
        return
    fi

    mkdir -p /data/plugins/BedWars1058/Arenas
    declare -A imported_map_names
    imported_count=0

    while IFS= read -r -d '' level_file; do
        map_dir="$(dirname "$level_file")"
        raw_name="$(basename "$map_dir")"
        map_name="$(echo "$raw_name" | tr '[:upper:]' '[:lower:]')"
        target_dir="/data/plugins/BedWars1058/Arenas/$map_name"
        world_target_dir="/data/$map_name"

        # Avoid accidental collisions if two nested maps share a name.
        if [ -n "${imported_map_names[$map_name]}" ]; then
            echo "Skipped duplicate arena map name: $map_name (from $map_dir)"
            continue
        fi
        imported_map_names[$map_name]=1

        if [ ! -d "$target_dir" ]; then
            cp -a "$map_dir" "$target_dir"
            if [ "$raw_name" != "$map_name" ]; then
                echo "Imported missing arena map: $raw_name -> $map_name"
            else
                echo "Imported missing arena map: $map_name"
            fi
            imported_count=$((imported_count + 1))
        fi

        if [ ! -d "$world_target_dir" ]; then
            cp -a "$map_dir" "$world_target_dir"
            echo "Imported missing world folder for map: $map_name"
        fi
    done < <(find /server/maps -type f -name 'level.dat' -print0)

    echo "Arena import ($mode) complete: $imported_count missing arena templates copied."
}

sync_server_runtime_files() {
    mkdir -p /data/plugins

    # Always update binaries/jars from image.
    cp -f /server/server.jar /data/server.jar
    cp -f /server/start.sh /data/start.sh
    chmod +x /data/start.sh
    for jar in /server/plugins/*.jar; do
        [ -f "$jar" ] || continue
        cp -f "$jar" /data/plugins/
    done

    # Keep existing runtime settings; only seed defaults when missing.
    # FlamePaper uses paper.yml (already handled above).

    # Always force-update server.properties (spawn coords, MOTD, etc.)
    if [ -f /server/server.properties ]; then
        cp -f /server/server.properties /data/server.properties
    fi

    for f in bukkit.yml spigot.yml paper.yml commands.yml eula.txt ops.json; do
        if [ -f "/server/$f" ] && [ ! -f "/data/$f" ]; then
            cp -a "/server/$f" "/data/$f"
        fi
    done

    # Always update Skript scripts from image (source code, not runtime data).
    if [ -d /server/plugins/Skript/scripts ]; then
        mkdir -p /data/plugins/Skript/scripts
        cp -f /server/plugins/Skript/scripts/*.sk /data/plugins/Skript/scripts/ 2>/dev/null || true
    fi

    # Always update AuthMe config from image (force-sync so forceLogin stays disabled).
    if [ -d /server/plugins/AuthMe ]; then
        mkdir -p /data/plugins/AuthMe
        cp -f /server/plugins/AuthMe/config.yml /data/plugins/AuthMe/config.yml 2>/dev/null || true
    fi

    # Always update FastLogin config from image (premium detection settings).
    if [ -d /server/plugins/FastLogin ]; then
        mkdir -p /data/plugins/FastLogin
        cp -f /server/plugins/FastLogin/config.yml /data/plugins/FastLogin/config.yml 2>/dev/null || true
    fi

    # Never overwrite existing lobby world to preserve spawn/settings.
    if [ -d /server/lobby ] && [ ! -d /data/lobby ]; then
        cp -a /server/lobby /data/lobby
        echo "Seeded missing lobby world from image."
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

    # Force server-ip to bistarwars.com (addDefault won't overwrite existing value)
    if grep -q "^server-ip:" "$config_file"; then
        sed -i 's|^server-ip:.*|server-ip: bistarwars.com|' "$config_file"
    else
        echo 'server-ip: bistarwars.com' >> "$config_file"
    fi
    echo "Set server-ip to bistarwars.com"

    # Enable BedWars tab formatting for all game states so format-tab in messages_en.yml is used.
    sed -i 's|format-waiting-list: false|format-waiting-list: true|' "$config_file"
    sed -i 's|format-starting-list: false|format-starting-list: true|' "$config_file"
    sed -i 's|format-playing-list: false|format-playing-list: true|' "$config_file"
    sed -i 's|format-restarting-list: false|format-restarting-list: true|' "$config_file"
    echo "Enabled BedWars player-list formatting for all game states"

    # Update allowed-commands whitelist to include hub/lobby/l
    # First remove any existing multi-line list items under allowed-commands (- item lines)
    # then replace the header with an inline array
    sed -i '/^allowed-commands:/,/^[^ -]/{/^allowed-commands:/!{/^- /d;/^  - /d}}' "$config_file"
    sed -i "s|^allowed-commands:.*|allowed-commands: [shout, bw, leave, hub, lobby, l]|" "$config_file"
    echo "Updated allowed-commands whitelist"

    # Force regenerate shop.yml so updated item defaults (prices, tiers, amounts) take effect.
    shop_file="/data/plugins/BedWars1058/shop.yml"
    if [ -f "$shop_file" ]; then
        rm -f "$shop_file"
        echo "Deleted shop.yml — plugin will regenerate with updated defaults"
    fi

    # Set lobby location (X=-33.357, Y=71.0, Z=1.544, Yaw=-91.6, Pitch=3.3, World=lobby)
    # Format: x,y,z,yaw,pitch,worldName
    if ! grep -q "^lobbyLoc:" "$config_file"; then
        echo 'lobbyLoc: "-33.357,71.0,1.544,-91.6,3.3,lobby"' >> "$config_file"
        echo "Set BedWars lobby location"
    else
        sed -i 's|^lobbyLoc:.*|lobbyLoc: "-33.357,71.0,1.544,-91.6,3.3,lobby"|' "$config_file"
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
    # Always re-seed the messages file with our format overrides.
    # BedWars fills in all other missing defaults when it loads.
    rm -f "$lang_file"
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
    echo "Seeded BedWars messages_en.yml with chat + tab format overrides"
}

if [ -d /data ] && [ -w /data ]; then
    if [ "$IMAGE_VERSION" != "$DATA_VERSION" ]; then
        echo "Updating /data from image (image=$IMAGE_VERSION, data=$DATA_VERSION)..."
        # Keep FastLogin premium cache by default so premium users stay auto-logged.
        # Set RESET_FASTLOGIN_DB=true only when you intentionally want to re-verify all players.
        if [ "${RESET_FASTLOGIN_DB:-false}" = "true" ]; then
            rm -f /data/plugins/FastLogin/FastLogin.db
            rm -f /data/plugins/FastLogin/*.db
            echo "RESET_FASTLOGIN_DB=true -> cleared FastLogin premium cache"
        fi
        # Remove old FastLogin.jar (replaced by FastLoginBukkit.jar)
        rm -f /data/plugins/FastLogin.jar
        # Clear old LuckPerms H2 database so it uses YAML storage
        rm -f /data/plugins/LuckPerms/*.db
        rm -f /data/plugins/LuckPerms/luckperms-h2*
        # Keep AuthMe registration database by default.
        # Set RESET_AUTHME_DB=true only when you intentionally want a full reset.
        if [ "${RESET_AUTHME_DB:-false}" = "true" ]; then
            rm -f /data/plugins/AuthMe/authme.db
            echo "RESET_AUTHME_DB=true -> cleared AuthMe database"
        fi
        # Update jars/binaries while preserving existing runtime settings and worlds.
        sync_server_runtime_files
        # Remove TAB plugin and its data (replaced by BedWars built-in tab formatting).
        rm -f /data/plugins/TAB\ v5.5.0.jar /data/plugins/TAB.jar
        rm -rf /data/plugins/TAB
        # Delete BedWars messages + shop so new defaults regenerate from updated jar.
        # config.yml is preserved to keep NPC locations and player-set preferences.
        rm -f /data/plugins/BedWars1058/Languages/messages_en.yml
        rm -f /data/plugins/BedWars1058/shop.yml
        echo "Cleaned TAB plugin + reset BedWars messages/shop for regeneration"
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
FILE_MANAGER_PORT="${FILE_MANAGER_PORT:-8080}"
FILE_MANAGER_USERNAME="${FILE_MANAGER_USERNAME:-admin}"
FILE_MANAGER_PASSWORD="${FILE_MANAGER_PASSWORD:-adminadmin123}"
FILE_MANAGER_DB="${FILE_MANAGER_DB:-/data/.filebrowser.db}"

if command -v filebrowser >/dev/null 2>&1; then
    mkdir -p "$(dirname "$FILE_MANAGER_DB")"
    if [ ! -f "$FILE_MANAGER_DB" ]; then
        filebrowser config init \
            -a 0.0.0.0 \
            -p "$FILE_MANAGER_PORT" \
            -r "$SERVER_DIR" \
            -d "$FILE_MANAGER_DB" >/dev/null 2>&1 || true
        filebrowser users add "$FILE_MANAGER_USERNAME" "$FILE_MANAGER_PASSWORD" --perm.admin -d "$FILE_MANAGER_DB" >/dev/null 2>&1 || true
        echo "File manager DB initialized with default admin user"
    fi
    filebrowser \
        -a 0.0.0.0 \
        -p "$FILE_MANAGER_PORT" \
        -r "$SERVER_DIR" \
        -d "$FILE_MANAGER_DB" >/tmp/filebrowser.log 2>&1 &
    echo "File manager started on port ${FILE_MANAGER_PORT} (user: ${FILE_MANAGER_USERNAME})"
else
    echo "File manager binary not found; skipping file manager startup"
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
