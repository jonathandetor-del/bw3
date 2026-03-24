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
import com.andrei1058.bedwars.api.arena.GameState;
import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.api.language.Language;
import com.andrei1058.bedwars.api.language.Messages;
import com.andrei1058.bedwars.arena.Arena;
import com.andrei1058.bedwars.configuration.Sounds;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.*;

/**
 * GUI for selecting a specific map within an arena group.
 * Opened on right-click of a lobby NPC.
 */
public class MapSelectorGUI {

    /** Custom InventoryHolder to identify this GUI and store page state */
    public static class MapSelectorHolder implements InventoryHolder {
        private final String group;
        private final int page;

        public MapSelectorHolder(String group, int page) {
            this.group = group;
            this.page = page;
        }

        public String getGroup() {
            return group;
        }

        public int getPage() {
            return page;
        }

        @Override
        public Inventory getInventory() {
            return null;
        }
    }

    private static final Map<UUID, Long> cooldown = new HashMap<>();

    /** Max arenas per page (using 54-slot inventory, center slots = 28 max) */
    private static final int[] ARENA_SLOTS = {
            10, 11, 12, 13, 14, 15, 16,
            19, 20, 21, 22, 23, 24, 25,
            28, 29, 30, 31, 32, 33, 34,
            37, 38, 39, 40, 41, 42, 43
    };
    private static final int ARENAS_PER_PAGE = ARENA_SLOTS.length;

    /**
     * Open the map selector GUI for a specific arena group at page 0.
     */
    public static void open(Player player, String group) {
        open(player, group, 0);
    }

    /**
     * Open the map selector GUI for a specific arena group at a specific page.
     */
    public static void open(Player player, String group, int page) {
        // Anti-spam: 500ms cooldown
        long now = System.currentTimeMillis();
        if (cooldown.getOrDefault(player.getUniqueId(), 0L) > now) return;
        cooldown.put(player.getUniqueId(), now + 500L);

        // Get arenas in this group, sorted (waiting/starting first)
        List<IArena> arenas = new ArrayList<>();
        for (IArena a : Arena.getArenas()) {
            if (a.getGroup().equalsIgnoreCase(group)) {
                arenas.add(a);
            }
        }
        arenas = Arena.getSorted(arenas);

        int totalArenas = arenas.size();
        int totalPages = Math.max(1, (int) Math.ceil((double) totalArenas / ARENAS_PER_PAGE));
        if (page < 0) page = 0;
        if (page >= totalPages) page = totalPages - 1;

        // Calculate which arenas to show on this page
        int startIdx = page * ARENAS_PER_PAGE;
        int endIdx = Math.min(startIdx + ARENAS_PER_PAGE, totalArenas);
        int arenasOnPage = endIdx - startIdx;

        // Size: fit arenas into rows, always use 54 for pagination consistency
        int size;
        if (totalPages > 1) {
            size = 54; // Always 54 when paginated (need bottom row for nav)
        } else if (arenasOnPage <= 7) {
            size = 36; // 4 rows: border + arenas + border + nav
        } else if (arenasOnPage <= 14) {
            size = 45;
        } else {
            size = 54;
        }

        String title = ChatColor.translateAlternateColorCodes('&',
                "&8Bed Wars " + group);
        if (totalPages > 1) {
            String pageStr = " (" + (page + 1) + "/" + totalPages + ")";
            if ((title + pageStr).length() > 32) {
                title = title.substring(0, 32 - pageStr.length());
            }
            title = title + pageStr;
        }
        if (title.length() > 32) {
            title = title.substring(0, 32);
        }

        MapSelectorHolder holder = new MapSelectorHolder(group, page);
        Inventory inv = Bukkit.createInventory(holder, size, title);

        // Fill all slots with gray stained glass panes
        ItemStack filler = new ItemStack(Material.STAINED_GLASS_PANE, 1, (short) 7);
        ItemMeta fillerMeta = filler.getItemMeta();
        if (fillerMeta != null) {
            fillerMeta.setDisplayName(" ");
            filler.setItemMeta(fillerMeta);
        }
        filler = BedWars.nms.addCustomData(filler, "LOBBY_MAP_FILLER");
        for (int i = 0; i < size; i++) {
            inv.setItem(i, filler);
        }

        // Place arena items
        for (int i = 0; i < arenasOnPage && i < ARENA_SLOTS.length; i++) {
            int slot = ARENA_SLOTS[i];
            if (slot >= size) break;
            IArena arena = arenas.get(startIdx + i);
            ItemStack item = createArenaItem(player, arena);
            item = BedWars.nms.addCustomData(item, "LOBBY_MAP_SELECT=" + arena.getArenaName());
            inv.setItem(slot, item);
        }

        // If no arenas, place a barrier in center
        if (arenas.isEmpty()) {
            ItemStack noArenas = new ItemStack(Material.BARRIER);
            ItemMeta meta = noArenas.getItemMeta();
            if (meta != null) {
                meta.setDisplayName(ChatColor.RED + "No maps available");
                meta.setLore(Collections.singletonList(ChatColor.GRAY + "No arenas found for " + group));
                noArenas.setItemMeta(meta);
            }
            inv.setItem(13, noArenas);
        }

        // Bottom row navigation
        int bottomRowStart = size - 9;

        // Close button (barrier) in bottom-center
        ItemStack closeBtn = new ItemStack(Material.BARRIER);
        ItemMeta closeMeta = closeBtn.getItemMeta();
        if (closeMeta != null) {
            closeMeta.setDisplayName(ChatColor.translateAlternateColorCodes('&', "&cClose"));
            closeBtn.setItemMeta(closeMeta);
        }
        closeBtn = BedWars.nms.addCustomData(closeBtn, "LOBBY_MAP_CLOSE");
        inv.setItem(bottomRowStart + 4, closeBtn); // Center of bottom row

        // Previous page arrow (left side of bottom row)
        if (page > 0) {
            ItemStack prevBtn = new ItemStack(Material.ARROW);
            ItemMeta prevMeta = prevBtn.getItemMeta();
            if (prevMeta != null) {
                prevMeta.setDisplayName(ChatColor.translateAlternateColorCodes('&',
                        "&a\u2190 Previous Page"));
                prevBtn.setItemMeta(prevMeta);
            }
            prevBtn = BedWars.nms.addCustomData(prevBtn, "LOBBY_MAP_PREV");
            inv.setItem(bottomRowStart, prevBtn);
        }

        // Next page arrow (right side of bottom row)
        if (page < totalPages - 1) {
            ItemStack nextBtn = new ItemStack(Material.ARROW);
            ItemMeta nextMeta = nextBtn.getItemMeta();
            if (nextMeta != null) {
                nextMeta.setDisplayName(ChatColor.translateAlternateColorCodes('&',
                        "&aNext Page \u2192"));
                nextBtn.setItemMeta(nextMeta);
            }
            nextBtn = BedWars.nms.addCustomData(nextBtn, "LOBBY_MAP_NEXT");
            inv.setItem(bottomRowStart + 8, nextBtn);
        }

        player.openInventory(inv);
        Sounds.playSound("arena-selector-open", player);
    }

    /**
     * Handle a click on a map item in the selector GUI.
     */
    public static void handleClick(Player player, String arenaName) {
        IArena arena = Arena.getArenaByName(arenaName);
        if (arena == null) {
            player.sendMessage(ChatColor.RED + "This arena is no longer available.");
            player.closeInventory();
            return;
        }

        GameState status = arena.getStatus();
        if (status == GameState.waiting || status == GameState.starting) {
            if (arena.addPlayer(player, false)) {
                Sounds.playSound("join-allowed", player);
            } else {
                player.sendMessage(Language.getMsg(player, Messages.COMMAND_JOIN_NO_EMPTY_FOUND));
                Sounds.playSound("join-denied", player);
            }
        } else if (status == GameState.playing) {
            // Offer spectating
            if (arena.addSpectator(player, false, null)) {
                Sounds.playSound("spectate-allowed", player);
            } else {
                player.sendMessage(ChatColor.RED + "Cannot spectate this arena.");
                Sounds.playSound("spectate-denied", player);
            }
        } else {
            player.sendMessage(ChatColor.RED + "This arena is restarting.");
            Sounds.playSound("join-denied", player);
        }

        player.closeInventory();
    }

    private static ItemStack createArenaItem(Player player, IArena arena) {
        boolean available = (arena.getStatus() == GameState.waiting || arena.getStatus() == GameState.starting)
                && arena.getPlayers().size() < arena.getMaxPlayers();

        ItemStack item;
        if (available) {
            // White/available: eye of ender (like the white icons in screenshot)
            item = new ItemStack(Material.EYE_OF_ENDER, 1);
        } else {
            // Red/busy: magma cream (red icon like in screenshot)
            item = new ItemStack(Material.MAGMA_CREAM, 1);
        }

        ItemMeta meta = item.getItemMeta();
        if (meta == null) return item;

        // Status info
        String statusColor;
        String statusText;
        switch (arena.getStatus()) {
            case waiting:
                statusColor = "&a";
                statusText = "Waiting";
                break;
            case starting:
                statusColor = "&e";
                statusText = "Starting";
                break;
            case playing:
                statusColor = "&c";
                statusText = "In Game";
                break;
            default:
                statusColor = "&7";
                statusText = "Restarting";
                break;
        }

        // Display name: green for available, red for busy
        if (available) {
            meta.setDisplayName(ChatColor.translateAlternateColorCodes('&',
                    "&a" + arena.getDisplayName()));
        } else {
            meta.setDisplayName(ChatColor.translateAlternateColorCodes('&',
                    "&c" + arena.getDisplayName()));
        }

        List<String> lore = new ArrayList<>();
        lore.add(ChatColor.translateAlternateColorCodes('&',
                "&7Players: &f" + arena.getPlayers().size() + "&7/&f" + arena.getMaxPlayers()));
        lore.add(ChatColor.translateAlternateColorCodes('&',
                "&7Status: " + statusColor + statusText));
        lore.add("");

        if (available) {
            lore.add(ChatColor.translateAlternateColorCodes('&', "&eClick to join!"));
        } else if (arena.getStatus() == GameState.playing) {
            lore.add(ChatColor.translateAlternateColorCodes('&', "&eClick to spectate"));
        } else if (arena.getPlayers().size() >= arena.getMaxPlayers()) {
            lore.add(ChatColor.translateAlternateColorCodes('&', "&cArena is full!"));
        } else {
            lore.add(ChatColor.translateAlternateColorCodes('&', "&cUnavailable"));
        }

        meta.setLore(lore);

        // Enchant glow for starting arenas
        if (arena.getStatus() == GameState.starting) {
            meta.addEnchant(Enchantment.LURE, 1, true);
            meta.addItemFlags(ItemFlag.HIDE_ENCHANTS);
        }
        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES);

        item.setItemMeta(meta);
        return item;
    }
}
