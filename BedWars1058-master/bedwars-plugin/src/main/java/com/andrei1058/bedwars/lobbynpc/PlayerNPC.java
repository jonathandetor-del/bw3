/*
 * BedWars1058 - A bed wars mini-game.
 * Copyright (C) 2021 Andrei Dascălu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Contact e-mail: andrew.dascalu@gmail.com
 */

package com.andrei1058.bedwars.lobbynpc;

import com.andrei1058.bedwars.BedWars;
import com.mojang.authlib.GameProfile;
import com.mojang.authlib.properties.Property;
import net.minecraft.server.v1_8_R3.*;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.craftbukkit.v1_8_R3.CraftServer;
import org.bukkit.craftbukkit.v1_8_R3.CraftWorld;
import org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer;
import org.bukkit.entity.Player;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Represents a packet-based fake player NPC with a custom skin.
 * Uses NMS 1.8 packets - no real server entity is created.
 */
public class PlayerNPC {

    private static final Map<Integer, PlayerNPC> NPC_BY_ENTITY_ID = new ConcurrentHashMap<>();

    private final UUID uuid;
    private final GameProfile profile;
    private final Location location;
    private final String group;
    private final String skinName;
    private final String texture;
    private final String signature;
    private final EntityPlayer entityPlayer;

    public PlayerNPC(Location location, String group, String skinName, String texture, String signature) {
        this.uuid = UUID.randomUUID();
        this.location = location.clone();
        this.group = group;
        this.skinName = skinName;
        this.texture = texture;
        this.signature = signature;

        // Create GameProfile with skin
        this.profile = new GameProfile(uuid, " ");
        if (texture != null && signature != null) {
            profile.getProperties().put("textures", new Property("textures", texture, signature));
        }

        // Create NMS EntityPlayer (not added to any world - packet-only)
        MinecraftServer server = ((CraftServer) Bukkit.getServer()).getServer();
        WorldServer world = ((CraftWorld) location.getWorld()).getHandle();
        this.entityPlayer = new EntityPlayer(server, world, profile, new PlayerInteractManager(world));
        this.entityPlayer.setLocation(
                location.getX(), location.getY(), location.getZ(),
                location.getYaw(), location.getPitch());

        // Enable all skin layers (byte index 10 in 1.8)
        this.entityPlayer.getDataWatcher().watch(10, (byte) 0xFF);

        NPC_BY_ENTITY_ID.put(entityPlayer.getId(), this);
    }

    /**
     * Send spawn packets to a specific player.
     * Order: ADD_PLAYER -> (delay) -> NamedEntitySpawn + HeadRotation -> (delay) -> REMOVE_PLAYER from tab
     */
    public void spawn(Player player) {
        if (!player.isOnline()) return;
        PlayerConnection conn = ((CraftPlayer) player).getHandle().playerConnection;

        // Step 1: Add to tab list (client needs this to know about the profile/skin)
        conn.sendPacket(new PacketPlayOutPlayerInfo(
                PacketPlayOutPlayerInfo.EnumPlayerInfoAction.ADD_PLAYER, entityPlayer));

        // Step 2: Spawn entity after short delay (lets client download skin texture)
        Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
            if (!player.isOnline()) return;
            PlayerConnection c = ((CraftPlayer) player).getHandle().playerConnection;
            c.sendPacket(new PacketPlayOutNamedEntitySpawn(entityPlayer));
            c.sendPacket(new PacketPlayOutEntityHeadRotation(entityPlayer,
                    (byte) ((int) (location.getYaw() * 256.0F / 360.0F))));

            // Step 3: Remove from tab list after skin has loaded
            Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
                if (player.isOnline()) {
                    ((CraftPlayer) player).getHandle().playerConnection.sendPacket(
                            new PacketPlayOutPlayerInfo(
                                    PacketPlayOutPlayerInfo.EnumPlayerInfoAction.REMOVE_PLAYER,
                                    entityPlayer));
                }
            }, 40L);
        }, 2L);
    }

    /**
     * Send destroy packet to remove the NPC for a specific player.
     */
    public void destroy(Player player) {
        if (!player.isOnline()) return;
        ((CraftPlayer) player).getHandle().playerConnection.sendPacket(
                new PacketPlayOutEntityDestroy(entityPlayer.getId()));
    }

    /**
     * Spawn this NPC for all online players in the same world.
     */
    public void spawnToAll() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (p.getWorld().equals(location.getWorld())) {
                spawn(p);
            }
        }
    }

    /**
     * Remove this NPC for all online players and unregister it.
     */
    public void destroyForAll() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            destroy(p);
        }
        NPC_BY_ENTITY_ID.remove(entityPlayer.getId());
    }

    public int getEntityId() {
        return entityPlayer.getId();
    }

    public UUID getUUID() {
        return uuid;
    }

    public Location getLocation() {
        return location;
    }

    public String getGroup() {
        return group;
    }

    public String getSkinName() {
        return skinName;
    }

    public String getTexture() {
        return texture;
    }

    public String getSignature() {
        return signature;
    }

    public static PlayerNPC getByEntityId(int entityId) {
        return NPC_BY_ENTITY_ID.get(entityId);
    }

    public static Collection<PlayerNPC> getAll() {
        return NPC_BY_ENTITY_ID.values();
    }

    /**
     * Fetch skin textures for a player name.
     * Uses Mojang API (name->uuid, then uuid->profile with textures).
     * The sessionserver response is JSON with a properties array containing objects.
     * @return [texture, signature] or null if fetch fails.
     */
    public static String[] fetchSkin(String playerName) {
        try {
            // Step 1: Name -> UUID via Mojang API
            URL url = new URL("https://api.mojang.com/users/profiles/minecraft/"
                    + URLEncoder.encode(playerName, "UTF-8"));
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "BedWars1058-NPC/1.0");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                BedWars.plugin.getLogger().warning("Mojang name->UUID API returned " + responseCode + " for " + playerName);
                return null;
            }
            String resp = readResponse(conn);
            String id = extractJsonValue(resp, "id");
            if (id == null || id.isEmpty()) {
                BedWars.plugin.getLogger().warning("Could not parse UUID from Mojang response for " + playerName);
                return null;
            }

            // Step 2: UUID -> Profile with textures (signed)
            URL profileUrl = new URL(
                    "https://sessionserver.mojang.com/session/minecraft/profile/" + id + "?unsigned=false");
            HttpURLConnection profileConn = (HttpURLConnection) profileUrl.openConnection();
            profileConn.setRequestMethod("GET");
            profileConn.setRequestProperty("User-Agent", "BedWars1058-NPC/1.0");
            profileConn.setConnectTimeout(10000);
            profileConn.setReadTimeout(10000);

            int profileResponseCode = profileConn.getResponseCode();
            if (profileResponseCode != 200) {
                BedWars.plugin.getLogger().warning("Mojang session API returned " + profileResponseCode + " for UUID " + id);
                return null;
            }
            String profileResp = readResponse(profileConn);

            // Parse the "value" and "signature" from properties array
            // The JSON looks like: {"properties":[{"name":"textures","value":"...","signature":"..."}]}
            String texture = extractPropertyField(profileResp, "value");
            String signature = extractPropertyField(profileResp, "signature");

            if (texture != null && signature != null && !texture.isEmpty() && !signature.isEmpty()) {
                return new String[]{texture, signature};
            }

            BedWars.plugin.getLogger().warning("Could not extract texture/signature from profile response for " + playerName);
        } catch (Exception e) {
            BedWars.plugin.getLogger().warning("Skin fetch error for " + playerName + ": " + e.getMessage());
        }
        return null;
    }

    private static String readResponse(HttpURLConnection conn) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        }
    }

    /**
     * Extract a simple JSON string value by key. Works for flat objects like {"id":"abc","name":"def"}.
     */
    private static String extractJsonValue(String json, String key) {
        // Handle both "key":"value" and "key" : "value"
        String search = "\"" + key + "\"";
        int idx = json.indexOf(search);
        if (idx == -1) return null;
        // Find the colon after the key
        int colonIdx = json.indexOf(':', idx + search.length());
        if (colonIdx == -1) return null;
        // Find the opening quote of the value
        int quoteStart = json.indexOf('"', colonIdx + 1);
        if (quoteStart == -1) return null;
        // Find the closing quote of the value
        int quoteEnd = json.indexOf('"', quoteStart + 1);
        if (quoteEnd == -1) return null;
        return json.substring(quoteStart + 1, quoteEnd);
    }

    /**
     * Extract a field from the first object in the "properties" array.
     * Handles: {"properties":[{"name":"textures","value":"BASE64...","signature":"BASE64..."}]}
     */
    private static String extractPropertyField(String json, String fieldName) {
        // Find the properties array
        int propsIdx = json.indexOf("\"properties\"");
        if (propsIdx == -1) return null;
        // Find the opening bracket of the array
        int arrayStart = json.indexOf('[', propsIdx);
        if (arrayStart == -1) return null;
        // Find the first object in the array
        int objStart = json.indexOf('{', arrayStart);
        if (objStart == -1) return null;
        // Find the end of this object (handle nested content by counting braces)
        int depth = 0;
        int objEnd = -1;
        for (int i = objStart; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '{') depth++;
            else if (c == '}') {
                depth--;
                if (depth == 0) {
                    objEnd = i + 1;
                    break;
                }
            }
        }
        if (objEnd == -1) return null;
        String obj = json.substring(objStart, objEnd);
        return extractJsonValue(obj, fieldName);
    }
}
