package com.andrei1058.bedwars.commands;

import com.andrei1058.bedwars.listeners.HypixelKnockback;
import org.bukkit.command.CommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

import java.util.Set;
import java.util.UUID;

public class PvPDebugCommand extends BukkitCommand {

    public PvPDebugCommand(String name) {
        super(name);
        setDescription("Toggle PvP debug messages");
    }

    @Override
    public boolean execute(CommandSender sender, String label, String[] args) {
        if (!(sender instanceof Player)) return true;
        if (!sender.hasPermission("bw.pvpdebug")) {
            sender.sendMessage("\u00a7cNo permission.");
            return true;
        }

        Player p = (Player) sender;
        UUID uuid = p.getUniqueId();
        Set<UUID> debugPlayers = HypixelKnockback.getDebugPlayers();

        if (debugPlayers.contains(uuid)) {
            debugPlayers.remove(uuid);
            p.sendMessage("\u00a7cPvP debug OFF");
        } else {
            debugPlayers.add(uuid);
            p.sendMessage("\u00a7aPvP debug ON \u00a77- hit someone to see combat data");
        }
        return true;
    }
}
