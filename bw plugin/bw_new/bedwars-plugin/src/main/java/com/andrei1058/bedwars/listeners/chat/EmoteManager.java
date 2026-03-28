package com.andrei1058.bedwars.listeners.chat;

import org.bukkit.ChatColor;

import java.util.LinkedHashMap;
import java.util.Map;

public class EmoteManager {

    private static final Map<String, String> EMOTES = new LinkedHashMap<>();

    static {
        // Hearts & Love
        EMOTES.put("<3", ChatColor.RED + "\u2764" + ChatColor.RESET);
        EMOTES.put(":heart:", ChatColor.RED + "\u2764" + ChatColor.RESET);
        EMOTES.put(":love:", ChatColor.LIGHT_PURPLE + "\u2665" + ChatColor.RESET);

        // Stars
        EMOTES.put(":star:", ChatColor.GOLD + "\u2605" + ChatColor.RESET);
        EMOTES.put(":star2:", ChatColor.YELLOW + "\u2606" + ChatColor.RESET);
        EMOTES.put(":sparkles:", ChatColor.AQUA + "\u2728" + ChatColor.RESET);

        // Faces
        EMOTES.put(":)", ChatColor.YELLOW + "\u263A" + ChatColor.RESET);
        EMOTES.put(":smile:", ChatColor.YELLOW + "\u263A" + ChatColor.RESET);
        EMOTES.put(":(", ChatColor.GRAY + "\u2639" + ChatColor.RESET);
        EMOTES.put(":sad:", ChatColor.GRAY + "\u2639" + ChatColor.RESET);
        EMOTES.put(":o", ChatColor.YELLOW + "\u25CB" + ChatColor.RESET);
        EMOTES.put(":surprised:", ChatColor.YELLOW + "\u25CB" + ChatColor.RESET);

        // Symbols
        EMOTES.put(":fire:", ChatColor.RED + "\u2739" + ChatColor.RESET);
        EMOTES.put(":skull:", ChatColor.DARK_GRAY + "\u2620" + ChatColor.RESET);
        EMOTES.put(":crown:", ChatColor.GOLD + "\u265A" + ChatColor.RESET);
        EMOTES.put(":sword:", ChatColor.GRAY + "\u2694" + ChatColor.RESET);
        EMOTES.put(":shield:", ChatColor.BLUE + "\u2748" + ChatColor.RESET);
        EMOTES.put(":diamond:", ChatColor.AQUA + "\u25C6" + ChatColor.RESET);
        EMOTES.put(":music:", ChatColor.LIGHT_PURPLE + "\u266B" + ChatColor.RESET);
        EMOTES.put(":note:", ChatColor.GREEN + "\u266A" + ChatColor.RESET);

        // Arrows & Pointers
        EMOTES.put(":arrow:", ChatColor.WHITE + "\u27A4" + ChatColor.RESET);
        EMOTES.put(":check:", ChatColor.GREEN + "\u2714" + ChatColor.RESET);
        EMOTES.put(":cross:", ChatColor.RED + "\u2716" + ChatColor.RESET);

        // Misc
        EMOTES.put(":sun:", ChatColor.YELLOW + "\u2600" + ChatColor.RESET);
        EMOTES.put(":moon:", ChatColor.DARK_PURPLE + "\u263D" + ChatColor.RESET);
        EMOTES.put(":snow:", ChatColor.WHITE + "\u2744" + ChatColor.RESET);
        EMOTES.put(":bolt:", ChatColor.YELLOW + "\u26A1" + ChatColor.RESET);
        EMOTES.put(":gg:", ChatColor.GOLD + "" + ChatColor.BOLD + "GG" + ChatColor.RESET);
        EMOTES.put(":ez:", ChatColor.RED + "" + ChatColor.BOLD + "EZ" + ChatColor.RESET);
    }

    public static String replaceEmotes(String message) {
        for (Map.Entry<String, String> entry : EMOTES.entrySet()) {
            if (message.contains(entry.getKey())) {
                message = message.replace(entry.getKey(), entry.getValue());
            }
        }
        return message;
    }

    public static Map<String, String> getEmotes() {
        return EMOTES;
    }
}
