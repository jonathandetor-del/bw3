package com.andrei1058.bedwars.commands.party;

import com.andrei1058.bedwars.BedWars;
import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.arena.Arena;
import com.andrei1058.bedwars.support.party.Internal;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Sound;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

import java.util.Map;

public class RulesCommand extends BukkitCommand {

    private static final String[] CIRCLED_NUMBERS = {
            "\u2460", "\u2461", "\u2462", "\u2463", "\u2464",
            "\u2465", "\u2466", "\u2467", "\u2468", "\u2469"
    };

    private final Type type;
    private final int ruleNumber;

    public enum Type {
        SET, REMOVE, VIEW
    }

    public RulesCommand(String name, Type type, int ruleNumber) {
        super(name);
        this.type = type;
        this.ruleNumber = ruleNumber;
    }

    @Override
    public boolean execute(CommandSender s, String st, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Player p = (Player) s;

        if (type == Type.VIEW) {
            handleView(p);
            return true;
        }

        // SET or REMOVE — must be party leader with private game
        if (!BedWars.getParty().hasParty(p)) {
            p.sendMessage(ChatColor.RED + "You must be in a party to use this command!");
            return true;
        }
        if (!BedWars.getParty().getOwner(p).equals(p)) {
            p.sendMessage(ChatColor.RED + "Only the party leader can set rules!");
            return true;
        }

        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        if (pd == null) {
            p.sendMessage(ChatColor.RED + "Party data not found!");
            return true;
        }
        if (!pd.isPrivateGame()) {
            p.sendMessage(ChatColor.RED + "You must enable private game first! Use " + ChatColor.YELLOW + "/party private");
            return true;
        }

        if (type == Type.SET) {
            if (args.length == 0) {
                p.sendMessage(ChatColor.RED + "Usage: /rule" + ruleNumber + " <rule text>");
                return true;
            }
            String ruleText = String.join(" ", args);
            pd.setRule(ruleNumber, ruleText);
            p.sendMessage(ChatColor.GOLD + "\u2726 " + ChatColor.YELLOW + "Rule #" + ruleNumber + " set: " + ChatColor.WHITE + ruleText);
        } else if (type == Type.REMOVE) {
            if (pd.getRules().containsKey(ruleNumber)) {
                pd.removeRule(ruleNumber);
                p.sendMessage(ChatColor.GOLD + "\u2726 " + ChatColor.YELLOW + "Rule #" + ruleNumber + " removed.");
            } else {
                p.sendMessage(ChatColor.RED + "Rule #" + ruleNumber + " is not set.");
            }
        }
        return true;
    }

    private void handleView(Player p) {
        // Check if player is in an arena — look for party data from arena players
        IArena arena = Arena.getArenaByPlayer(p);
        Internal.PartyData pd = null;

        if (arena != null) {
            // Find the party that owns this private game
            for (Internal.PartyData party : Internal.getParties()) {
                if (party.isPrivateGame() && party.hasRules()) {
                    Player owner = party.getOwner();
                    if (arena.getPlayers().contains(owner) || arena.getSpectators().contains(owner)) {
                        pd = party;
                        break;
                    }
                    // Check party members too
                    for (Player member : BedWars.getParty().getMembers(owner)) {
                        if (arena.getPlayers().contains(member) || arena.getSpectators().contains(member)) {
                            pd = party;
                            break;
                        }
                    }
                    if (pd != null) break;
                }
            }
        }

        // Fallback: check player's own party
        if (pd == null) {
            pd = Internal.getPartyDataByPlayer(p);
        }

        if (pd == null || !pd.hasRules()) {
            p.sendMessage(ChatColor.RED + "No rules set for this game.");
            return;
        }

        displayRules(p, pd);
    }

    public static void displayRules(Player p, Internal.PartyData pd) {
        if (pd == null || !pd.hasRules()) return;

        p.sendMessage("");
        p.sendMessage(ChatColor.GOLD + "" + ChatColor.BOLD + "  \u2605 " + ChatColor.YELLOW + "" + ChatColor.BOLD + "PRIVATE GAME RULES" + ChatColor.GOLD + "" + ChatColor.BOLD + " \u2605");
        p.sendMessage(ChatColor.DARK_GRAY + "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

        for (Map.Entry<Integer, String> entry : pd.getRules().entrySet()) {
            int num = entry.getKey();
            String circle = (num >= 1 && num <= 10) ? CIRCLED_NUMBERS[num - 1] : String.valueOf(num);
            p.sendMessage(ChatColor.GOLD + "  " + circle + " " + ChatColor.WHITE + entry.getValue());
        }

        p.sendMessage(ChatColor.DARK_GRAY + "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
        p.sendMessage("");

        // Play firework sound 3 times with staggered delays
        Bukkit.getScheduler().runTask(BedWars.plugin, () -> {
            p.playSound(p.getLocation(), Sound.FIREWORK_LAUNCH, 0.8f, 1.2f);
        });
        Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
            p.playSound(p.getLocation(), Sound.FIREWORK_LAUNCH, 0.8f, 1.0f);
        }, 5L);
        Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
            p.playSound(p.getLocation(), Sound.FIREWORK_LAUNCH, 0.8f, 0.8f);
        }, 10L);
    }

    public static void displayRulesToAll(IArena arena) {
        // Find the private game party in this arena
        Internal.PartyData pd = null;
        for (Internal.PartyData party : Internal.getParties()) {
            if (party.isPrivateGame() && party.hasRules()) {
                Player owner = party.getOwner();
                if (arena.getPlayers().contains(owner) || arena.getSpectators().contains(owner)) {
                    pd = party;
                    break;
                }
                for (Player member : BedWars.getParty().getMembers(owner)) {
                    if (arena.getPlayers().contains(member) || arena.getSpectators().contains(member)) {
                        pd = party;
                        break;
                    }
                }
                if (pd != null) break;
            }
        }

        if (pd == null || !pd.hasRules()) return;

        final Internal.PartyData finalPd = pd;
        for (Player player : arena.getPlayers()) {
            displayRules(player, finalPd);
        }
        for (Player spec : arena.getSpectators()) {
            displayRules(spec, finalPd);
        }
    }
}
