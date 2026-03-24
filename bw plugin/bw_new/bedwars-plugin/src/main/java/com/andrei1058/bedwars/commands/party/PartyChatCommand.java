package com.andrei1058.bedwars.commands.party;

import com.andrei1058.bedwars.api.language.Messages;
import com.andrei1058.bedwars.support.party.Internal;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

import static com.andrei1058.bedwars.BedWars.getParty;
import static com.andrei1058.bedwars.api.language.Language.getMsg;

public class PartyChatCommand extends BukkitCommand {

    public PartyChatCommand(String name) {
        super(name);
    }

    @Override
    public boolean execute(CommandSender s, String c, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Player p = (Player) s;

        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return true;
        }

        if (args.length == 0) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_CHAT_USAGE));
            return true;
        }

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < args.length; i++) {
            if (i > 0) sb.append(" ");
            sb.append(args[i]);
        }

        Internal.sendPartyChatMessage(p, sb.toString());
        return true;
    }
}
