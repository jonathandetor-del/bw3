package com.andrei1058.bedwars.commands.hotbar;

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
        // Create a temporary cache if none exists (e.g. player is in lobby)
        if (PlayerHotbarCache.getCache(p.getUniqueId()) == null) {
            new PlayerHotbarCache(p);
        }
        PlayerHotbarCache.openWhenReady(p);
        return true;
    }
}
