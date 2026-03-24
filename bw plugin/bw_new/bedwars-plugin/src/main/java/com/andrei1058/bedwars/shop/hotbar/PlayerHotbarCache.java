package com.andrei1058.bedwars.shop.hotbar;

import com.andrei1058.bedwars.BedWars;
import com.andrei1058.bedwars.api.language.Language;
import com.andrei1058.bedwars.api.language.Messages;
import com.andrei1058.bedwars.shop.ShopManager;
import com.andrei1058.bedwars.shop.quickbuy.PlayerQuickBuyCache;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import static com.andrei1058.bedwars.BedWars.nms;

public class PlayerHotbarCache {

    private static final ConcurrentHashMap<UUID, PlayerHotbarCache> caches = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<UUID, String> selectedCategory = new ConcurrentHashMap<>();

    public static final List<UUID> hotbarViewers = new ArrayList<>();

    public static final String[] CATEGORIES = {
            "sword", "blocks", "pickaxe", "axe", "bow", "shears", "potions", "utility"
    };

    public static final Set<String> DUAL_SLOT_CATEGORIES = new HashSet<>(Arrays.asList("blocks", "utility"));

    private final UUID player;
    private final Map<String, Integer> preferences = new HashMap<>();
    private boolean loaded = false;

    public PlayerHotbarCache(Player player) {
        this.player = player.getUniqueId();
        caches.put(this.player, this);
        Bukkit.getScheduler().runTaskAsynchronously(BedWars.plugin, () -> {
            Map<String, Integer> data = BedWars.getRemoteDatabase().getHotbarPreferences(this.player);
            if (data != null) {
                preferences.putAll(data);
            }
            loaded = true;
        });
    }

    public Map<String, Integer> getPreferences() {
        return preferences;
    }

    public int getPreferredSlot(String category) {
        return preferences.getOrDefault(category, -1);
    }

    public void setPreference(String category, int slot) {
        if (slot < 0) {
            preferences.remove(category);
            preferences.remove(category + "2");
            return;
        }

        // Remove any OTHER category (primary or secondary) from this slot
        preferences.entrySet().removeIf(e -> {
            if (e.getValue() != slot) return false;
            String key = e.getKey();
            String baseKey = key.endsWith("2") ? key.substring(0, key.length() - 1) : key;
            return !baseKey.equals(category);
        });

        if (DUAL_SLOT_CATEGORIES.contains(category)) {
            String secondaryKey = category + "2";
            int primary = preferences.getOrDefault(category, -1);
            int secondary = preferences.getOrDefault(secondaryKey, -1);

            if (primary == slot || secondary == slot) return;

            if (primary < 0) {
                preferences.put(category, slot);
            } else if (secondary < 0) {
                preferences.put(secondaryKey, slot);
            } else {
                preferences.put(secondaryKey, slot);
            }
        } else {
            preferences.put(category, slot);
        }
    }

    public List<Integer> getPreferredSlots(String category) {
        List<Integer> slots = new ArrayList<>();
        int primary = preferences.getOrDefault(category, -1);
        if (primary >= 0) slots.add(primary);
        if (DUAL_SLOT_CATEGORIES.contains(category)) {
            int secondary = preferences.getOrDefault(category + "2", -1);
            if (secondary >= 0) slots.add(secondary);
        }
        return slots;
    }

    public void saveToDb() {
        Bukkit.getScheduler().runTaskAsynchronously(BedWars.plugin,
                () -> BedWars.getRemoteDatabase().saveHotbarPreferences(player, preferences));
    }

    public void destroy() {
        saveToDb();
        caches.remove(player);
        selectedCategory.remove(player);
        hotbarViewers.remove(player);
    }

    public static PlayerHotbarCache getCache(UUID uuid) {
        return caches.getOrDefault(uuid, null);
    }

    public static String getItemCategory(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return null;
        String name = item.getType().name();
        if (name.contains("PICKAXE")) return "pickaxe";
        if (nms.isSword(item)) return "sword";
        if (nms.isAxe(item)) return "axe";
        if (item.getType() == Material.BOW) return "bow";
        if (item.getType() == Material.SHEARS) return "shears";
        if (item.getType() == Material.POTION) return "potions";
        if (item.getType().isBlock() && item.getType() != Material.TNT) return "blocks";
        return "utility";
    }

    public static int getPreferredSlotForItem(Player player, ItemStack item) {
        PlayerHotbarCache cache = getCache(player.getUniqueId());
        if (cache == null || !cache.loaded) return -1;
        String category = getItemCategory(item);
        if (category == null) return -1;
        return cache.getPreferredSlot(category);
    }

    public static List<Integer> getPreferredSlotsForItem(Player player, ItemStack item) {
        PlayerHotbarCache cache = getCache(player.getUniqueId());
        if (cache == null || !cache.loaded) return Collections.emptyList();
        String category = getItemCategory(item);
        if (category == null) return Collections.emptyList();
        return cache.getPreferredSlots(category);
    }

    public static void openGUI(Player player) {
        PlayerHotbarCache cache = getCache(player.getUniqueId());
        if (cache == null) return;

        Inventory inv = Bukkit.createInventory(null, 36,
                Language.getMsg(player, Messages.HOTBAR_MANAGER_TITLE));

        // Row 0 (slots 0-7): Category icons, slot 8: back arrow
        inv.setItem(0, makeCategoryIcon("sword", player, BedWars.getForCurrentVersion("WOOD_SWORD", "WOOD_SWORD", "WOODEN_SWORD"), 0));
        inv.setItem(1, makeCategoryIcon("blocks", player, BedWars.getForCurrentVersion("STAINED_CLAY", "STAINED_CLAY", "ORANGE_TERRACOTTA"), 1));
        inv.setItem(2, makeCategoryIcon("pickaxe", player, BedWars.getForCurrentVersion("WOOD_PICKAXE", "WOOD_PICKAXE", "WOODEN_PICKAXE"), 0));
        inv.setItem(3, makeCategoryIcon("axe", player, BedWars.getForCurrentVersion("WOOD_AXE", "WOOD_AXE", "WOODEN_AXE"), 0));
        inv.setItem(4, makeCategoryIcon("bow", player, "BOW", 0));
        inv.setItem(5, makeCategoryIcon("shears", player, "SHEARS", 0));
        inv.setItem(6, makeCategoryIcon("potions", player, "POTION", 0));
        inv.setItem(7, makeCategoryIcon("utility", player, "TNT", 0));

        // Back arrow
        ItemStack backArrow = nms.createItemStack("ARROW", 1, (short) 0);
        ItemMeta backMeta = backArrow.getItemMeta();
        if (backMeta != null) {
            backMeta.setDisplayName("§aGo Back");
            backMeta.setLore(Collections.singletonList("§7Click to return to the shop"));
            backArrow.setItemMeta(backMeta);
        }
        inv.setItem(8, backArrow);

        // Row 1 (slots 9-17): Separator
        ItemStack sep = nms.createItemStack(BedWars.getForCurrentVersion("STAINED_GLASS_PANE", "STAINED_GLASS_PANE", "GRAY_STAINED_GLASS_PANE"), 1, (short) 7);
        ItemMeta sepMeta = sep.getItemMeta();
        if (sepMeta != null) {
            sepMeta.setDisplayName(" ");
            sep.setItemMeta(sepMeta);
        }
        for (int i = 9; i <= 17; i++) {
            inv.setItem(i, sep.clone());
        }

        // Row 2 (slots 18-26): Hotbar slots 0-8
        for (int slot = 0; slot <= 8; slot++) {
            inv.setItem(18 + slot, makeHotbarSlotIcon(cache, slot, player));
        }

        // Row 3: barrier for reset at slot 35
        ItemStack barrier = nms.createItemStack("BARRIER", 1, (short) 0);
        ItemMeta barrierMeta = barrier.getItemMeta();
        if (barrierMeta != null) {
            barrierMeta.setDisplayName("§cReset Hotbar Preferences");
            barrierMeta.setLore(Collections.singletonList("§7Click to reset all preferences"));
            barrier.setItemMeta(barrierMeta);
        }
        inv.setItem(35, barrier);

        player.openInventory(inv);
        if (!hotbarViewers.contains(player.getUniqueId())) {
            hotbarViewers.add(player.getUniqueId());
        }
    }

    private static ItemStack makeCategoryIcon(String category, Player player, String material, int data) {
        ItemStack item = nms.createItemStack(material, 1, (short) data);
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            String displayName;
            switch (category) {
                case "sword": displayName = "§aSword"; break;
                case "blocks": displayName = "§aBlocks"; break;
                case "pickaxe": displayName = "§aPickaxe"; break;
                case "axe": displayName = "§aAxe"; break;
                case "bow": displayName = "§aBow"; break;
                case "shears": displayName = "§aShears"; break;
                case "potions": displayName = "§aPotions"; break;
                case "utility": displayName = "§aUtility"; break;
                default: displayName = "§a" + category; break;
            }
            meta.setDisplayName(displayName);
            List<String> lore = new ArrayList<>();
            lore.add("§7Click to select this category,");
            lore.add("§7then click a hotbar slot below.");

            PlayerHotbarCache cache = getCache(player.getUniqueId());
            if (cache != null) {
                List<Integer> slots = cache.getPreferredSlots(category);
                if (!slots.isEmpty()) {
                    lore.add("");
                    for (int s : slots) {
                        lore.add("§7Assigned to: §eSlot " + (s + 1));
                    }
                }
                if (DUAL_SLOT_CATEGORIES.contains(category) && slots.size() < 2) {
                    lore.add("§8(Supports 2 slots)");
                }
            }

            meta.setLore(lore);
            meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES);
            item.setItemMeta(meta);
        }
        return item;
    }

    private static ItemStack makeHotbarSlotIcon(PlayerHotbarCache cache, int slot, Player player) {
        String assignedCategory = null;
        for (Map.Entry<String, Integer> entry : cache.preferences.entrySet()) {
            if (entry.getValue() == slot) {
                String key = entry.getKey();
                assignedCategory = key.endsWith("2") ? key.substring(0, key.length() - 1) : key;
                break;
            }
        }

        ItemStack item;
        if (assignedCategory != null) {
            item = getCategoryItem(assignedCategory);
            ItemMeta meta = item.getItemMeta();
            if (meta != null) {
                meta.setDisplayName("§eSlot " + (slot + 1) + " §7- §a" + capitalize(assignedCategory));
                meta.setLore(Arrays.asList("§7Currently: §a" + capitalize(assignedCategory), "§7Click to assign selected category"));
                meta.addEnchant(Enchantment.ARROW_DAMAGE, 1, true);
                meta.addItemFlags(ItemFlag.HIDE_ENCHANTS, ItemFlag.HIDE_ATTRIBUTES);
                item.setItemMeta(meta);
            }
        } else {
            item = nms.createItemStack(BedWars.getForCurrentVersion("STAINED_GLASS_PANE", "STAINED_GLASS_PANE", "RED_STAINED_GLASS_PANE"), 1, (short) 14);
            ItemMeta meta = item.getItemMeta();
            if (meta != null) {
                meta.setDisplayName("§eSlot " + (slot + 1) + " §7- §cNone");
                meta.setLore(Arrays.asList("§7No category assigned", "§7Click to assign selected category"));
                item.setItemMeta(meta);
            }
        }
        return item;
    }

    private static ItemStack getCategoryItem(String category) {
        switch (category) {
            case "sword": return nms.createItemStack(BedWars.getForCurrentVersion("WOOD_SWORD", "WOOD_SWORD", "WOODEN_SWORD"), 1, (short) 0);
            case "blocks": return nms.createItemStack(BedWars.getForCurrentVersion("STAINED_CLAY", "STAINED_CLAY", "ORANGE_TERRACOTTA"), 1, (short) 1);
            case "pickaxe": return nms.createItemStack(BedWars.getForCurrentVersion("WOOD_PICKAXE", "WOOD_PICKAXE", "WOODEN_PICKAXE"), 1, (short) 0);
            case "axe": return nms.createItemStack(BedWars.getForCurrentVersion("WOOD_AXE", "WOOD_AXE", "WOODEN_AXE"), 1, (short) 0);
            case "bow": return nms.createItemStack("BOW", 1, (short) 0);
            case "shears": return nms.createItemStack("SHEARS", 1, (short) 0);
            case "potions": return nms.createItemStack("POTION", 1, (short) 0);
            case "utility": return nms.createItemStack("TNT", 1, (short) 0);
            default: return nms.createItemStack("BARRIER", 1, (short) 0);
        }
    }

    public static void handleClick(Player player, int slot) {
        UUID uuid = player.getUniqueId();
        PlayerHotbarCache cache = getCache(uuid);
        if (cache == null) return;

        // Clicked back arrow (slot 8)
        if (slot == 8) {
            hotbarViewers.remove(uuid);
            selectedCategory.remove(uuid);
            PlayerQuickBuyCache qbCache = PlayerQuickBuyCache.getQuickBuyCache(uuid);
            if (qbCache != null) {
                ShopManager.getShop().open(player, qbCache, false);
            } else {
                player.closeInventory();
            }
            return;
        }

        // Clicked a category in row 0 (slots 0-7)
        if (slot >= 0 && slot <= 7) {
            selectedCategory.put(uuid, CATEGORIES[slot]);
            openGUI(player);
            return;
        }

        // Clicked a hotbar slot in row 2 (slots 18-26)
        if (slot >= 18 && slot <= 26) {
            int hotbarSlot = slot - 18;
            String selected = selectedCategory.get(uuid);
            if (selected != null) {
                cache.setPreference(selected, hotbarSlot);
                selectedCategory.remove(uuid);
                openGUI(player);
            }
            return;
        }

        // Clicked barrier (slot 35) = reset all
        if (slot == 35) {
            cache.preferences.clear();
            selectedCategory.remove(uuid);
            openGUI(player);
        }
    }

    private static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }
}
