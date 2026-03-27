package com.andrei1058.bedwars.commands.party;

import com.andrei1058.bedwars.support.party.Internal;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

/**
 * /ac &lt;message&gt; — Send a message to global (all) chat,
 * bypassing party chat mode. Same as Hypixel's /ac.
 */
public class AllChatCommand extends BukkitCommand {

    public AllChatCommand(String name) {
        super(name);
        this.setDescription("Send a message to all chat (bypasses party chat mode)");
        this.setUsage("/ac <message>");
    }

    @Override
    public boolean execute(CommandSender s, String c, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Player p = (Player) s;

        if (args.length == 0) {
            p.sendMessage("\u00A7cUsage: /ac <message>");
            return true;
        }

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < args.length; i++) {
            if (i > 0) sb.append(" ");
            sb.append(args[i]);
        }

        // Temporarily switch to ALL chat mode, make the player chat, then restore
        Internal.ChatMode previous = Internal.getChatMode(p);
        Internal.setChatMode(p, Internal.ChatMode.ALL);
        p.chat(sb.toString());
        Internal.setChatMode(p, previous);
        return true;
    }
}
