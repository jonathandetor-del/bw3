package com.andrei1058.bedwars.arena.team;

import com.andrei1058.bedwars.BedWars;
import com.andrei1058.bedwars.api.arena.GameState;
import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.api.arena.team.ITeam;
import com.andrei1058.bedwars.api.arena.team.TeamColor;
import com.andrei1058.bedwars.arena.Arena;
import com.andrei1058.bedwars.sidebar.SidebarService;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import static com.andrei1058.bedwars.BedWars.nms;

/**
 * Team selector compass for the waiting lobby.
 * Players right-click a compass to open a GUI showing all teams with colored wool.
 * Selected team preferences are honored by the team assigner at game start.
 */
public class TeamSelectorGUI implements Listener {

    private static final String GUI_TITLE = "§8Team Selector";
    private static final String COMPASS_TAG = "TEAM_SELECTOR";

    // player UUID -> preferred team name
    private static final ConcurrentHashMap<UUID, String> teamPreferences = new ConcurrentHashMap<>();

    /**
     * Get the preferred team name for a player, or null if none.
     */
    public static String getPreference(UUID uuid) {
        return teamPreferences.get(uuid);
    }

    /**
     * Clear preference when player leaves arena.
     */
    public static void clearPreference(UUID uuid) {
        teamPreferences.remove(uuid);
    }

    /**
     * Create the compass item for the waiting lobby.
     */
    public static ItemStack createCompassItem() {
        ItemStack compass = new ItemStack(Material.COMPASS, 1);
        ItemMeta meta = compass.getItemMeta();
        if (meta != null) {
            meta.setDisplayName("§aTeam Selector §7(Right Click)");
            meta.setLore(Arrays.asList("§7Right-click to choose", "§7your preferred team!"));
            meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES);
            compass.setItemMeta(meta);
        }
        // Tag it so we can identify it
        compass = nms.addCustomData(compass, COMPASS_TAG);
        return compass;
    }

    @EventHandler
    public void onCompassInteract(PlayerInteractEvent e) {
        if (e.getAction() != Action.RIGHT_CLICK_AIR && e.getAction() != Action.RIGHT_CLICK_BLOCK) return;
        Player p = e.getPlayer();
        ItemStack item = nms.getItemInHand(p);
        if (item == null || item.getType() != Material.COMPASS) return;
        if (!nms.isCustomBedWarsItem(item)) return;
        if (!nms.getCustomData(item).equals(COMPASS_TAG)) return;

        e.setCancelled(true);

        IArena arena = Arena.getArenaByPlayer(p);
        if (arena == null) return;
        if (arena.getStatus() != GameState.waiting && arena.getStatus() != GameState.starting) return;

        openGUI(p, arena);
    }

    private void openGUI(Player player, IArena arena) {
        List<ITeam> teams = arena.getTeams();
        int size = ((teams.size() + 8) / 9) * 9; // round up to multiple of 9
        if (size < 9) size = 9;
        if (size > 54) size = 54;

        Inventory inv = Bukkit.createInventory(null, size, GUI_TITLE);

        String currentPref = teamPreferences.get(player.getUniqueId());

        for (int i = 0; i < teams.size() && i < 54; i++) {
            ITeam team = teams.get(i);
            ItemStack wool = createTeamWool(team, arena, currentPref);
            inv.setItem(i, wool);
        }

        player.openInventory(inv);
    }

    private ItemStack createTeamWool(ITeam team, IArena arena, String currentPref) {
        TeamColor color = team.getColor();
        short data = TeamColor.itemColor(color);

        ItemStack wool = nms.createItemStack(
                BedWars.getForCurrentVersion("WOOL", "WOOL", "WHITE_WOOL"),
                1, data);

        // For 1.13+, use dyed wool
        try {
            String colorName = color.dye().name().toUpperCase();
            Material dyed = Material.matchMaterial(colorName + "_WOOL");
            if (dyed != null) {
                wool = new ItemStack(dyed, 1);
            }
        } catch (Exception ignored) {}

        ItemMeta meta = wool.getItemMeta();
        if (meta != null) {
            String teamDisplayName = color.chat() + team.getName();
            boolean isSelected = team.getName().equals(currentPref);

            meta.setDisplayName(teamDisplayName + (isSelected ? " §a✔" : ""));

            List<String> lore = new ArrayList<>();
            // Count how many players selected this team
            int selectedCount = 0;
            for (Player p : arena.getPlayers()) {
                if (team.getName().equals(teamPreferences.get(p.getUniqueId()))) {
                    selectedCount++;
                }
            }
            lore.add("§7Players selected: §f" + selectedCount + "/" + arena.getMaxInTeam());
            if (isSelected) {
                lore.add("");
                lore.add("§aCurrently selected!");
                lore.add("§eClick to deselect");
            } else {
                int capacity = arena.getMaxInTeam();
                if (selectedCount >= capacity) {
                    lore.add("");
                    lore.add("§cTeam is full!");
                } else {
                    lore.add("");
                    lore.add("§eClick to select!");
                }
            }
            meta.setLore(lore);
            meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES);
            wool.setItemMeta(meta);
        }
        return wool;
    }

    @EventHandler
    public void onGUIClick(InventoryClickEvent e) {
        if (e.getView().getTitle() == null) return;
        if (!e.getView().getTitle().equals(GUI_TITLE)) return;

        e.setCancelled(true);

        if (e.getCurrentItem() == null || e.getCurrentItem().getType() == Material.AIR) return;
        if (!(e.getWhoClicked() instanceof Player)) return;

        Player player = (Player) e.getWhoClicked();
        IArena arena = Arena.getArenaByPlayer(player);
        if (arena == null) {
            player.closeInventory();
            return;
        }
        if (arena.getStatus() != GameState.waiting && arena.getStatus() != GameState.starting) {
            player.closeInventory();
            return;
        }

        int slot = e.getRawSlot();
        List<ITeam> teams = arena.getTeams();
        if (slot < 0 || slot >= teams.size()) return;

        ITeam selectedTeam = teams.get(slot);
        UUID uuid = player.getUniqueId();
        String currentPref = teamPreferences.get(uuid);

        if (selectedTeam.getName().equals(currentPref)) {
            // Deselect
            teamPreferences.remove(uuid);
            player.sendMessage("§eTeam deselected! §7You will be auto-assigned.");
        } else {
            // Check capacity
            int selectedCount = 0;
            for (Player p : arena.getPlayers()) {
                if (p.getUniqueId().equals(uuid)) continue;
                if (selectedTeam.getName().equals(teamPreferences.get(p.getUniqueId()))) {
                    selectedCount++;
                }
            }
            if (selectedCount >= arena.getMaxInTeam()) {
                player.sendMessage("§cThat team is full!");
            } else {
                teamPreferences.put(uuid, selectedTeam.getName());
                player.sendMessage("§aYou selected: " + selectedTeam.getColor().chat() + selectedTeam.getName() + "§a!");
            }
        }

        // Refresh GUI
        openGUI(player, arena);

        // Refresh tab list so team color updates immediately
        SidebarService.getInstance().refreshTabForPlayer(arena, player);
    }
}
