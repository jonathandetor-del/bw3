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
import com.andrei1058.bedwars.api.command.ParentCommand;
import com.andrei1058.bedwars.api.command.SubCommand;
import com.andrei1058.bedwars.commands.bedwars.MainCommand;
import com.andrei1058.bedwars.configuration.Permissions;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Location;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Command: /bw lobbynpc <add|remove|list>
 *
 * Usage:
 *   /bw lobbynpc add <group> <skin> - Spawn a lobby NPC with player skin
 *   /bw lobbynpc remove              - Remove the nearest lobby NPC within 3 blocks
 *   /bw lobbynpc list                - List all spawned lobby NPCs
 *
 * Supported groups: Solo, Doubles, 3v3v3v3, 4v4v4v4 (or any custom arena group)
 */
public class CmdLobbyNPC extends SubCommand {

    public CmdLobbyNPC(ParentCommand parent, String name) {
        super(parent, name);
        setPriority(13);
        showInList(true);
        setPermission(Permissions.PERMISSION_LOBBY_NPC);
        setDisplayInfo(MainCommand.createTC(
                "§6 ▪ §7/" + MainCommand.getInstance().getName() + " lobbynpc §6<add/remove/list>",
                "/" + getParent().getName() + " " + getSubCommandName(),
                "§fManage lobby NPCs for BedWars.\n§f/bw lobbynpc add <group> <skin> - Add NPC\n§f/bw lobbynpc remove - Remove nearest\n§f/bw lobbynpc list - List all"));
    }

    @Override
    public boolean execute(String[] args, CommandSender s) {
        if (s instanceof ConsoleCommandSender) return false;
        Player p = (Player) s;

        if (args.length < 1) {
            sendUsage(p);
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "add":
                return handleAdd(p, args);
            case "remove":
                return handleRemove(p);
            case "setskin":
                return handleSetSkin(p, args);
            case "list":
                return handleList(p);
            default:
                sendUsage(p);
                return true;
        }
    }

    private boolean handleAdd(Player p, String[] args) {
        if (args.length < 3) {
            p.sendMessage(ChatColor.RED + "Usage: /bw lobbynpc add <group> <skinName>");
            p.sendMessage(ChatColor.GRAY + "Groups: Solo, Doubles, 3v3v3v3, 4v4v4v4");
            p.sendMessage(ChatColor.GRAY + "Skin: Any Minecraft player name (e.g. Notch)");
            return true;
        }

        String group = args[1];
        String skinName = args[2];

        // Validate group exists in config or is a known standard group
        List<String> validGroups = BedWars.config.getYml().getStringList("arenaGroups");
        List<String> knownGroups = Arrays.asList("Solo", "Doubles", "3v3v3v3", "4v4v4v4", "Default");
        boolean valid = false;
        for (String g : validGroups) {
            if (g.equalsIgnoreCase(group)) {
                valid = true;
                group = g;
                break;
            }
        }
        if (!valid) {
            for (String g : knownGroups) {
                if (g.equalsIgnoreCase(group)) {
                    valid = true;
                    group = g;
                    break;
                }
            }
        }

        if (!valid) {
            p.sendMessage(ChatColor.RED + "Warning: Group '" + group + "' is not in arenaGroups config.");
            p.sendMessage(ChatColor.YELLOW + "Creating NPC anyway. Make sure arenas use this group name.");
        }

        p.sendMessage(ChatColor.YELLOW + "Fetching skin for " + skinName + "...");

        // Capture location at command time (player may move during async fetch)
        final Location spawnLoc = p.getLocation().clone();
        final String finalGroup = group;

        // Fetch skin asynchronously to avoid blocking the main thread
        Bukkit.getScheduler().runTaskAsynchronously(BedWars.plugin, () -> {
            String[] skin = PlayerNPC.fetchSkin(skinName);

            // Spawn NPC on the main thread
            Bukkit.getScheduler().runTask(BedWars.plugin, () -> {
                if (!p.isOnline()) return;

                if (skin == null) {
                    p.sendMessage(ChatColor.RED + "Could not fetch skin for '" + skinName + "'. Using default skin.");
                    LobbyNPCManager.spawnNPC(spawnLoc, finalGroup, skinName, null, null);
                } else {
                    LobbyNPCManager.spawnNPC(spawnLoc, finalGroup, skinName, skin[0], skin[1]);
                }

                p.sendMessage(ChatColor.GREEN + "Lobby NPC for " + ChatColor.YELLOW + finalGroup
                        + ChatColor.GREEN + " spawned with skin: " + ChatColor.YELLOW + skinName);
            });
        });
        return true;
    }

    private boolean handleRemove(Player p) {
        PlayerNPC nearest = LobbyNPCManager.getNearestNPC(p.getLocation(), 3.0);
        if (nearest == null) {
            p.sendMessage(ChatColor.RED + "No lobby NPC found within 3 blocks. Stand closer to one.");
            return true;
        }

        LobbyNPCManager.removeNPC(nearest.getEntityId());
        p.sendMessage(ChatColor.GREEN + "Lobby NPC removed!");
        return true;
    }

    private boolean handleSetSkin(Player p, String[] args) {
        if (args.length < 2) {
            p.sendMessage(ChatColor.RED + "Usage: /bw lobbynpc setskin <skinName>");
            p.sendMessage(ChatColor.GRAY + "Stand within 3 blocks of the NPC you want to change.");
            return true;
        }

        PlayerNPC nearest = LobbyNPCManager.getNearestNPC(p.getLocation(), 3.0);
        if (nearest == null) {
            p.sendMessage(ChatColor.RED + "No lobby NPC found within 3 blocks. Stand closer to one.");
            return true;
        }

        String newSkin = args[1];
        p.sendMessage(ChatColor.YELLOW + "Fetching skin for " + newSkin + "...");

        final int oldEntityId = nearest.getEntityId();

        Bukkit.getScheduler().runTaskAsynchronously(BedWars.plugin, () -> {
            String[] skin = PlayerNPC.fetchSkin(newSkin);

            Bukkit.getScheduler().runTask(BedWars.plugin, () -> {
                if (!p.isOnline()) return;

                // Get the current NPC data before removing
                PlayerNPC current = LobbyNPCManager.getNPCByEntityId(oldEntityId);
                if (current == null) {
                    p.sendMessage(ChatColor.RED + "NPC no longer exists.");
                    return;
                }

                Location loc = current.getLocation();
                String group = current.getGroup();

                // Remove old NPC
                LobbyNPCManager.removeNPC(oldEntityId);

                // Spawn new one with new skin at same location
                if (skin == null) {
                    p.sendMessage(ChatColor.RED + "Could not fetch skin for '" + newSkin + "'. Using default skin.");
                    LobbyNPCManager.spawnNPC(loc, group, newSkin, null, null);
                } else {
                    LobbyNPCManager.spawnNPC(loc, group, newSkin, skin[0], skin[1]);
                }

                p.sendMessage(ChatColor.GREEN + "NPC skin changed to " + ChatColor.YELLOW + newSkin + ChatColor.GREEN + "!");
            });
        });
        return true;
    }

    private boolean handleList(Player p) {
        p.sendMessage(ChatColor.GOLD + "=== Lobby NPCs ===");
        // Simply iterate through the stored config entries
        List<String> stored = BedWars.config.getYml().getStringList("lobby-npc-locations");
        if (stored == null || stored.isEmpty()) {
            p.sendMessage(ChatColor.GRAY + "No lobby NPCs configured.");
            return true;
        }

        int i = 1;
        for (String entry : stored) {
            String[] parts = entry.split(",");
            if (parts.length >= 8) {
                String world = parts[5];
                String group = parts[6];
                String skin = parts[7];
                String coords = String.format("%.1f, %.1f, %.1f",
                        Double.parseDouble(parts[0]),
                        Double.parseDouble(parts[1]),
                        Double.parseDouble(parts[2]));
                p.sendMessage(ChatColor.YELLOW + "" + i + ". " + ChatColor.WHITE + group
                        + ChatColor.GRAY + " [" + skin + "] at " + coords + " (" + world + ")");
            }
            i++;
        }
        return true;
    }

    private void sendUsage(Player p) {
        p.sendMessage(ChatColor.GOLD + "=== Lobby NPC Commands ===");
        p.sendMessage(ChatColor.YELLOW + "/bw lobbynpc add <group> <skin>" + ChatColor.GRAY + " - Spawn NPC with player skin");
        p.sendMessage(ChatColor.YELLOW + "/bw lobbynpc remove" + ChatColor.GRAY + " - Remove nearest NPC (< 3 blocks)");
        p.sendMessage(ChatColor.YELLOW + "/bw lobbynpc setskin <skin>" + ChatColor.GRAY + " - Change skin of nearest NPC");
        p.sendMessage(ChatColor.YELLOW + "/bw lobbynpc list" + ChatColor.GRAY + " - List all lobby NPCs");
        p.sendMessage("");
        p.sendMessage(ChatColor.GRAY + "Groups: Solo, Doubles, 3v3v3v3, 4v4v4v4");
        p.sendMessage(ChatColor.GRAY + "Skin: Any Minecraft player name");
    }

    @Override
    public List<String> getTabComplete() {
        List<String> tab = new ArrayList<>();
        tab.add("add");
        tab.add("remove");
        tab.add("setskin");
        tab.add("list");
        return tab;
    }

    @Override
    public boolean canSee(CommandSender s, com.andrei1058.bedwars.api.BedWars api) {
        if (s instanceof ConsoleCommandSender) return false;
        return hasPermission(s);
    }
}
