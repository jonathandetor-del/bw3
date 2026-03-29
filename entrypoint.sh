#!/bin/bash
# Fix Railway volume permissions (volume mounts as root)
if [ -d /data ]; then
    # Clean massive log files BEFORE chown to save time
    if [ -d /data/logs ]; then
        echo "Cleaning old log files from volume..."
        rm -f /data/logs/*.log.gz 2>/dev/null
        # Truncate any huge latest.log from previous Netty spam
        echo "" > /data/logs/latest.log 2>/dev/null
    fi
    # Remove stuck temp extraction dirs from previous failed runs
    rm -rf /data/.archive-extract-* 2>/dev/null
    chown -R minecraft:minecraft /data
    # Ensure minecraft user can read/write/traverse everything
    chmod -R u+rwX /data
fi

# Drop to minecraft user and run start.sh (preserve PATH for java)
exec su -s /bin/bash minecraft -c "export PATH='$PATH'; /server/start.sh"
