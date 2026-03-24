package com.andrei1058.bedwars.commands.party;

import com.andrei1058.bedwars.api.language.Messages;
import com.andrei1058.bedwars.support.party.Internal;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

import static com.andrei1058.bedwars.BedWars.getParty;
import static com.andrei1058.bedwars.api.language.Language.getMsg;

public class ChatModeCommand extends BukkitCommand {

    public ChatModeCommand(String name) {
        super(name);
    }

    @Override
    public boolean execute(CommandSender s, String c, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Player p = (Player) s;

        if (args.length == 0) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_CHAT_USAGE));
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "p":
            case "party":
                if (!getParty().hasParty(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
                    return true;
                }
                Internal.setChatMode(p, Internal.ChatMode.PARTY);
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_CHAT_MODE_PARTY));
                break;
            case "a":
            case "all":
                Internal.setChatMode(p, Internal.ChatMode.ALL);
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_CHAT_MODE_ALL));
                break;
            default:
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_CHAT_USAGE));
                break;
        }
        return true;
    }
}
