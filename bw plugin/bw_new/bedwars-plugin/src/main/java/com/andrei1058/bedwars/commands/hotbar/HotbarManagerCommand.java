package com.andrei1058.bedwars.commands.hotbar;

import com.andrei1058.bedwars.arena.Arena;
import com.andrei1058.bedwars.shop.hotbar.PlayerHotbarCache;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

public class HotbarManagerCommand extends BukkitCommand {

    public HotbarManagerCommand(String name) {
        super(name);
    }

    @Override
    public boolean execute(CommandSender s, String st, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Player p = (Player) s;
        if (Arena.getArenaByPlayer(p) == null) {
            p.sendMessage("§cYou must be in a game to use this command!");
            return true;
        }
        PlayerHotbarCache.openGUI(p);
        return true;
    }
}
