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
import com.andrei1058.bedwars.api.configuration.ConfigPath;
import com.andrei1058.bedwars.arena.Arena;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Location;
import org.bukkit.entity.ArmorStand;
import org.bukkit.entity.Player;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages built-in lobby NPCs (packet-based player skins) for BedWars game mode selection.
 * Uses NMS packets to spawn fake player entities with custom skins.
 * No Citizens dependency required.
 */
public class LobbyNPCManager {

    /** Maps PlayerNPC entity ID -> NPC instance */
    private static final Map<Integer, PlayerNPC> npcMap = new ConcurrentHashMap<>();

    /** Maps PlayerNPC entity ID -> hologram armor stands */
    private static final Map<Integer, List<ArmorStand>> npcHolograms = new ConcurrentHashMap<>();

    /** Display names for known groups */
    private static final Map<String, String> GROUP_DISPLAY = new LinkedHashMap<>();

    static {
        GROUP_DISPLAY.put("Solo", "&eBed Wars &7- &aSolo");
        GROUP_DISPLAY.put("Doubles", "&eBed Wars &7- &aDoubles");
        GROUP_DISPLAY.put("3v3v3v3", "&eBed Wars &7- &a3v3v3v3");
        GROUP_DISPLAY.put("4v4v4v4", "&eBed Wars &7- &a4v4v4v4");
    }

    /**
     * Spawn a lobby NPC at the given location with a player skin.
     */
    public static PlayerNPC spawnNPC(Location loc, String group, String skinName, String texture, String signature) {
        PlayerNPC npc = new PlayerNPC(loc, group, skinName, texture, signature);
        int id = npc.getEntityId();
        npcMap.put(id, npc);

        // Create hologram lines above the NPC
        // Player entity is ~1.8 blocks tall. ArmorStand small=true with marker=true has ~0 height.
        // Name tags render ~0.3 above the armor stand position.
        // So for a player at Y, top of head is Y+1.8, we want text above that.
        List<ArmorStand> holos = new ArrayList<>();
        String displayName = GROUP_DISPLAY.getOrDefault(group, "&eBed Wars &7- &a" + group);

        holos.add(createHologram(loc.clone().add(0, 2.55, 0),
                ChatColor.translateAlternateColorCodes('&', displayName)));

        int playerCount = Arena.getPlayers(group);
        holos.add(createHologram(loc.clone().add(0, 2.3, 0),
                ChatColor.translateAlternateColorCodes('&', "&7Players: &f" + playerCount)));

        holos.add(createHologram(loc.clone().add(0, 2.05, 0),
                ChatColor.translateAlternateColorCodes('&', "&eLeft-Click &7to Quick Join")));

        holos.add(createHologram(loc.clone().add(0, 1.8, 0),
                ChatColor.translateAlternateColorCodes('&', "&eRight-Click &7to Choose Map")));

        npcHolograms.put(id, holos);

        // Send spawn packets to all online players in the same world
        npc.spawnToAll();

        // Save to config
        saveNPCToConfig(loc, group, skinName, texture, signature);

        return npc;
    }

    /**
     * Remove a lobby NPC by entity ID.
     */
    public static boolean removeNPC(int entityId) {
        PlayerNPC npc = npcMap.remove(entityId);
        if (npc == null) return false;

        npc.destroyForAll();

        List<ArmorStand> holos = npcHolograms.remove(entityId);
        if (holos != null) {
            for (ArmorStand as : holos) {
                if (as != null && !as.isDead()) as.remove();
            }
        }

        removeNPCFromConfig(npc);
        return true;
    }

    /**
     * Get the arena group for an NPC by entity ID.
     */
    public static String getGroup(int entityId) {
        PlayerNPC npc = npcMap.get(entityId);
        return npc != null ? npc.getGroup() : null;
    }

    /**
     * Send all NPC spawn packets to a player (called on join).
     */
    public static void sendNPCsToPlayer(Player player) {
        for (PlayerNPC npc : npcMap.values()) {
            if (player.getWorld().equals(npc.getLocation().getWorld())) {
                npc.spawn(player);
            }
        }
    }

    /**
     * Refresh all NPC hologram player counts.
     */
    public static void refreshHolograms() {
        for (Map.Entry<Integer, PlayerNPC> entry : npcMap.entrySet()) {
            int id = entry.getKey();
            String group = entry.getValue().getGroup();
            List<ArmorStand> holos = npcHolograms.get(id);
            if (holos == null || holos.size() < 2) continue;

            ArmorStand countLine = holos.get(1);
            if (countLine != null && !countLine.isDead()) {
                int playerCount = Arena.getPlayers(group);
                countLine.setCustomName(ChatColor.translateAlternateColorCodes('&',
                        "&7Players: &f" + playerCount));
            }
        }
    }

    /**
     * Load all saved NPCs on server startup.
     * Config format: x,y,z,yaw,pitch,world,group,skinName,texture,signature
     */
    public static void loadNPCs() {
        List<String> stored = BedWars.config.getYml().getStringList(ConfigPath.GENERAL_CONFIGURATION_LOBBY_NPC_STORAGE);
        if (stored == null || stored.isEmpty()) return;

        for (String data : stored) {
            String[] parts = data.split(",");
            if (parts.length < 10) {
                if (parts.length >= 7) {
                    BedWars.plugin.getLogger().warning("Old NPC format detected, please re-create NPC: " + data);
                }
                continue;
            }

            try {
                double x = Double.parseDouble(parts[0]);
                double y = Double.parseDouble(parts[1]);
                double z = Double.parseDouble(parts[2]);
                float yaw = Float.parseFloat(parts[3]);
                float pitch = Float.parseFloat(parts[4]);
                String worldName = parts[5];
                String group = parts[6];
                String skinName = parts[7];
                String texture = "none".equals(parts[8]) ? null : parts[8];
                String signature = "none".equals(parts[9]) ? null : parts[9];

                if (Bukkit.getWorld(worldName) == null) {
                    BedWars.plugin.getLogger().warning("Lobby NPC world '" + worldName + "' not loaded, skipping.");
                    continue;
                }

                Location loc = new Location(Bukkit.getWorld(worldName), x, y, z, yaw, pitch);
                // Don't call saveNPCToConfig again - spawn directly
                PlayerNPC npc = new PlayerNPC(loc, group, skinName, texture, signature);
                int id = npc.getEntityId();
                npcMap.put(id, npc);

                // Create holograms
                List<ArmorStand> holos = new ArrayList<>();
                String displayText = GROUP_DISPLAY.getOrDefault(group, "&eBed Wars &7- &a" + group);
                holos.add(createHologram(loc.clone().add(0, 2.55, 0),
                        ChatColor.translateAlternateColorCodes('&', displayText)));
                holos.add(createHologram(loc.clone().add(0, 2.3, 0),
                        ChatColor.translateAlternateColorCodes('&', "&7Players: &f" + Arena.getPlayers(group))));
                holos.add(createHologram(loc.clone().add(0, 2.05, 0),
                        ChatColor.translateAlternateColorCodes('&', "&eLeft-Click &7to Quick Join")));
                holos.add(createHologram(loc.clone().add(0, 1.8, 0),
                        ChatColor.translateAlternateColorCodes('&', "&eRight-Click &7to Choose Map")));
                npcHolograms.put(id, holos);

                // Spawn to all online players
                npc.spawnToAll();
            } catch (NumberFormatException e) {
                BedWars.plugin.getLogger().warning("Invalid lobby NPC config entry: " + data);
            }
        }

        BedWars.plugin.getLogger().info("Loaded " + npcMap.size() + " lobby NPCs.");
    }

    /**
     * Despawn all lobby NPCs (on plugin disable).
     */
    public static void despawnAll() {
        for (PlayerNPC npc : npcMap.values()) {
            npc.destroyForAll();
        }
        for (List<ArmorStand> holos : npcHolograms.values()) {
            for (ArmorStand as : holos) {
                if (as != null && !as.isDead()) as.remove();
            }
        }
        npcMap.clear();
        npcHolograms.clear();
    }

    /**
     * Find the nearest lobby NPC to a location.
     */
    public static PlayerNPC getNearestNPC(Location loc, double radius) {
        if (loc.getWorld() == null) return null;
        PlayerNPC nearest = null;
        double nearestDist = radius * radius;
        for (PlayerNPC npc : npcMap.values()) {
            if (!npc.getLocation().getWorld().equals(loc.getWorld())) continue;
            double dist = npc.getLocation().distanceSquared(loc);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = npc;
            }
        }
        return nearest;
    }

    /**
     * Get all registered NPCs.
     */
    public static Collection<PlayerNPC> getAllNPCs() {
        return npcMap.values();
    }

    /**
     * Get an NPC by its entity ID.
     */
    public static PlayerNPC getNPCByEntityId(int entityId) {
        return npcMap.get(entityId);
    }

    private static ArmorStand createHologram(Location loc, String text) {
        ArmorStand as = loc.getWorld().spawn(loc, ArmorStand.class);
        as.setGravity(false);
        as.setVisible(false);
        as.setCustomNameVisible(true);
        as.setCustomName(text);
        as.setMarker(true);
        as.setSmall(true);
        return as;
    }

    private static void saveNPCToConfig(Location loc, String group, String skinName, String texture, String signature) {
        List<String> stored = new ArrayList<>(
                BedWars.config.getYml().getStringList(ConfigPath.GENERAL_CONFIGURATION_LOBBY_NPC_STORAGE));
        // Format: x,y,z,yaw,pitch,world,group,skinName,texture,signature
        String tex = texture != null ? texture : "none";
        String sig = signature != null ? signature : "none";
        String entry = loc.getX() + "," + loc.getY() + "," + loc.getZ() + ","
                + loc.getYaw() + "," + loc.getPitch() + ","
                + loc.getWorld().getName() + "," + group + "," + skinName + "," + tex + "," + sig;
        stored.add(entry);
        BedWars.config.set(ConfigPath.GENERAL_CONFIGURATION_LOBBY_NPC_STORAGE, stored);
    }

    private static void removeNPCFromConfig(PlayerNPC npc) {
        List<String> stored = new ArrayList<>(
                BedWars.config.getYml().getStringList(ConfigPath.GENERAL_CONFIGURATION_LOBBY_NPC_STORAGE));
        Location loc = npc.getLocation();
        stored.removeIf(entry -> {
            String[] parts = entry.split(",");
            if (parts.length < 7) return false;
            try {
                double x = Double.parseDouble(parts[0]);
                double y = Double.parseDouble(parts[1]);
                double z = Double.parseDouble(parts[2]);
                return Math.abs(x - loc.getX()) < 0.01
                        && Math.abs(y - loc.getY()) < 0.01
                        && Math.abs(z - loc.getZ()) < 0.01;
            } catch (NumberFormatException e) {
                return false;
            }
        });
        BedWars.config.set(ConfigPath.GENERAL_CONFIGURATION_LOBBY_NPC_STORAGE, stored);
    }

    /**
     * Start the hologram refresh task (runs every 3 seconds).
     */
    public static void startRefreshTask() {
        Bukkit.getScheduler().runTaskTimer(BedWars.plugin, LobbyNPCManager::refreshHolograms, 60L, 60L);
    }
}
