package com.andrei1058.bedwars.commands;

import com.andrei1058.bedwars.listeners.chat.EmoteManager;
import org.bukkit.ChatColor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class EmotesCommand extends BukkitCommand {

    public EmotesCommand(String name) {
        super(name);
    }

    @Override
    public boolean execute(CommandSender s, String st, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Player p = (Player) s;

        List<Map.Entry<String, String>> entries = new ArrayList<>(EmoteManager.getEmotes().entrySet());

        p.sendMessage("");
        p.sendMessage(ChatColor.GOLD + "" + ChatColor.BOLD + "  \u2605 " + ChatColor.YELLOW + "" + ChatColor.BOLD + "CHAT EMOTES" + ChatColor.GOLD + "" + ChatColor.BOLD + " \u2605");
        p.sendMessage(ChatColor.DARK_GRAY + "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
        p.sendMessage(ChatColor.GRAY + "  Type these codes in chat to use emotes:");
        p.sendMessage("");

        // Display in 2-column layout
        for (int i = 0; i < entries.size(); i += 2) {
            Map.Entry<String, String> left = entries.get(i);
            String line = ChatColor.YELLOW + "  " + left.getKey() + " " + ChatColor.DARK_GRAY + "\u2192 " + left.getValue();

            if (i + 1 < entries.size()) {
                Map.Entry<String, String> right = entries.get(i + 1);
                line += ChatColor.DARK_GRAY + "    \u2502    " + ChatColor.YELLOW + right.getKey() + " " + ChatColor.DARK_GRAY + "\u2192 " + right.getValue();
            }
            p.sendMessage(line);
        }

        p.sendMessage("");
        p.sendMessage(ChatColor.DARK_GRAY + "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
        p.sendMessage("");
        return true;
    }
}
