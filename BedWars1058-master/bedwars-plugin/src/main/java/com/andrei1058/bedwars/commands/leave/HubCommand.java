package com.andrei1058.bedwars.commands.leave;

import org.bukkit.Bukkit;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

import java.util.Arrays;

public class HubCommand extends BukkitCommand {

    public HubCommand(String name) {
        super(name);
        setAliases(Arrays.asList("lobby", "l"));
    }

    @Override
    public boolean execute(CommandSender s, String st, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Bukkit.dispatchCommand((Player) s, "bw leave");
        return true;
    }
}
