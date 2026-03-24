#!/bin/bash
clear
echo "=========================================="
echo "   HellCore BedWars Server Console"
echo "=========================================="
echo ""
echo "  Type Minecraft commands directly."
echo "  Type 'exit' or Ctrl+C to disconnect."
echo ""
echo "  Connecting to server..."
echo ""

# Wait for RCON to be available (server may still be starting)
for i in $(seq 1 30); do
    if bash -c 'echo > /dev/tcp/127.0.0.1/25575' 2>/dev/null; then
        break
    fi
    echo "  Waiting for server to start... ($i/30)"
    sleep 2
done

exec mcrcon -H 127.0.0.1 -P 25575 -p "HellC0re_Rc0n2026!"