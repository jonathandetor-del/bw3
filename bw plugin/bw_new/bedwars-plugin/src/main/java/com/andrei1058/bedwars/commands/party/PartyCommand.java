/*
 * BedWars1058 - A bed wars mini-game.
 * Copyright (C) 2021 Andrei Dascălu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Contact e-mail: andrew.dascalu@gmail.com
 */

package com.andrei1058.bedwars.commands.party;

import com.andrei1058.bedwars.BedWars;
import com.andrei1058.bedwars.api.arena.GameState;
import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.api.language.Messages;
import com.andrei1058.bedwars.arena.Arena;
import net.md_5.bungee.api.chat.ClickEvent;
import net.md_5.bungee.api.chat.TextComponent;
import org.bukkit.Bukkit;
import org.bukkit.Sound;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.List;
import java.util.UUID;

import static com.andrei1058.bedwars.BedWars.getParty;
import static com.andrei1058.bedwars.api.language.Language.getList;
import static com.andrei1058.bedwars.api.language.Language.getMsg;

public class PartyCommand extends BukkitCommand {

    public PartyCommand(String name) {
        super(name);
    }

    //owner, target
    private static HashMap<UUID, UUID> partySessionRequest = new HashMap<>();
    private static final HashMap<UUID, Long> warpCooldowns = new HashMap<>();
    private static final long WARP_COOLDOWN_MS = 3000L;

    @Override
    public boolean execute(CommandSender s, String c, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Player p = (Player) s;
        if (args.length == 0 || args[0].equalsIgnoreCase("help")) {
            sendPartyCmds(p);
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "invite":
                if (args.length == 1) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_USAGE));
                    return true;
                }
                if (getParty().hasParty(p) && !getParty().isOwner(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
                    return true;
                }
                if (Bukkit.getPlayer(args[1]) != null && Bukkit.getPlayer(args[1]).isOnline()) {
                    if (p == Bukkit.getPlayer(args[1])) {
                        p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_DENIED_CANNOT_INVITE_YOURSELF));
                        return true;
                    }
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_SENT).replace("{playername}", p.getName()).replace("{player}", args[1]));
                    TextComponent tc = new TextComponent(getMsg(p, Messages.COMMAND_PARTY_INVITE_SENT_TARGET_RECEIVE_MSG).replace("{player}", p.getName()));
                    tc.setClickEvent(new ClickEvent(ClickEvent.Action.RUN_COMMAND, "/party accept " + p.getName()));
                    Bukkit.getPlayer(args[1]).spigot().sendMessage(tc);
                    if (partySessionRequest.containsKey(p.getUniqueId())) {
                        partySessionRequest.replace(p.getUniqueId(), Bukkit.getPlayer(args[1]).getUniqueId());
                    } else {
                        partySessionRequest.put(p.getUniqueId(), Bukkit.getPlayer(args[1]).getUniqueId());
                    }
                } else {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_DENIED_PLAYER_OFFLINE).replace("{player}", args[1]));
                }
                break;
            case "accept":
                if (args.length < 2) {
                    return true;
                }
                if (getParty().hasParty(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_ACCEPT_DENIED_ALREADY_IN_PARTY));
                    return true;
                }
                if (Bukkit.getPlayer(args[1]) == null || !Bukkit.getPlayer(args[1]).isOnline()) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_DENIED_PLAYER_OFFLINE).replace("{player}", args[1]));
                    return true;
                }
                if (!partySessionRequest.containsKey(Bukkit.getPlayer(args[1]).getUniqueId())) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_ACCEPT_DENIED_NO_INVITE));
                    return true;
                }
                if (partySessionRequest.get(Bukkit.getPlayer(args[1]).getUniqueId()).equals(p.getUniqueId())) {
                    partySessionRequest.remove(Bukkit.getPlayer(args[1]).getUniqueId());
                    if (getParty().hasParty(Bukkit.getPlayer(args[1]))) {
                        getParty().addMember(Bukkit.getPlayer(args[1]), p);
                        for (Player on : getParty().getMembers(Bukkit.getPlayer(args[1]))) {
                            on.sendMessage(getMsg(p, Messages.COMMAND_PARTY_ACCEPT_SUCCESS).replace("{playername}", p.getName()).replace("{player}", p.getDisplayName()));
                        }
                    } else {
                        getParty().createParty(Bukkit.getPlayer(args[1]), p);
                        for (Player on : getParty().getMembers(Bukkit.getPlayer(args[1]))) {
                            on.sendMessage(getMsg(p, Messages.COMMAND_PARTY_ACCEPT_SUCCESS).replace("{playername}", p.getName()).replace("{player}", p.getDisplayName()));
                        }
                    }
                } else {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_ACCEPT_DENIED_NO_INVITE));
                }
                break;
            case "leave":
                if (!getParty().hasParty(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
                    return true;
                }
                if (getParty().isOwner(p)) {
                    List<Player> members = getParty().getMembers(p);
                    if (members.size() <= 1) {
                        getParty().disband(p);
                    } else {
                        Player newOwner = null;
                        for (Player mem : members) {
                            if (!mem.equals(p)) {
                                newOwner = mem;
                                break;
                            }
                        }
                        if (newOwner != null) {
                            getParty().promote(p, newOwner);
                            for (Player mem : getParty().getMembers(newOwner)) {
                                mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_PROMOTE_NEW_OWNER).replace("{player}", newOwner.getName()));
                            }
                            getParty().removeFromParty(p);
                        }
                    }
                } else {
                    getParty().removeFromParty(p);
                }
                break;
            case "disband":
                if (!getParty().hasParty(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
                    return true;
                }
                if (!getParty().isOwner(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
                    return true;
                }
                getParty().disband(p);
                break;
            case "kick":
            case "remove":
                if (args.length == 1) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_USAGE));
                    return true;
                }
                if (getParty().hasParty(p) && !getParty().isOwner(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
                    return true;
                }
                Player target = Bukkit.getPlayer(args[1]);
                if (target == null) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_DENIED_TARGET_NOT_PARTY_MEMBER).replace("{player}", args[1]));
                    return true;
                }
                if (!getParty().isMember(p, target)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_DENIED_TARGET_NOT_PARTY_MEMBER).replace("{player}", args[1]));
                    return true;
                }
                getParty().removePlayer(p, target);
                break;
            case "transfer":
            case "promote":
                if (!getParty().hasParty(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
                    return true;
                } else if (!getParty().isOwner(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
                    return true;
                }
                if (args.length == 1){
                    this.sendPartyCmds(p);
                    return true;
                }
                Player target1 = Bukkit.getPlayer(args[1]);
                if (!getParty().isMember(p, target1)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_DENIED_TARGET_NOT_PARTY_MEMBER).replace("{player}", args[1]));
                    return true;
                }
                getParty().promote(p, target1);
                for (Player p1 : getParty().getMembers(p)) {
                    if (p1.equals(p)) {
                        p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_SUCCESS).replace("{player}", args[1]));
                    } else if (p1.equals(target1)) {
                        p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_OWNER));
                    } else {
                        p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_NEW_OWNER).replace("{player}", args[1]));
                    }
                }
                break;
            case "info" :
            case "list":
                if (!getParty().hasParty(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
                    return true;
                }
                Player owner = getParty().getOwner(p);
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INFO_OWNER).replace("{owner}", owner.getName()));
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INFO_PLAYERS));
                for (Player p1 : getParty().getMembers(owner)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INFO_PLAYER).replace("{player}", p1.getName()));
                }
                break;
            case "warp":
                if (!getParty().hasParty(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
                    return true;
                }
                if (!getParty().isOwner(p)) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
                    return true;
                }
                // Cooldown check
                long now = System.currentTimeMillis();
                Long lastWarp = warpCooldowns.get(p.getUniqueId());
                if (lastWarp != null && now - lastWarp < WARP_COOLDOWN_MS) {
                    long remaining = (WARP_COOLDOWN_MS - (now - lastWarp)) / 1000 + 1;
                    p.sendMessage("\u00A79Party \u00A78> \u00A7cWarp is on cooldown! Wait " + remaining + "s.");
                    return true;
                }
                IArena ownerArena = Arena.getArenaByPlayer(p);
                if (ownerArena == null) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_WARP_NOT_IN_ARENA));
                    return true;
                }
                boolean isPlaying = (ownerArena.getStatus() == GameState.playing);
                boolean isWaiting = (ownerArena.getStatus() == GameState.waiting || ownerArena.getStatus() == GameState.starting);
                if (!isPlaying && !isWaiting) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_WARP_NOT_IN_ARENA));
                    return true;
                }
                // Gather eligible members (skip owner, skip those already in the same arena)
                List<Player> members = getParty().getMembers(p);
                int neededSlots = 0;
                for (Player mem : members) {
                    if (mem == p) continue;
                    IArena memArena = Arena.getArenaByPlayer(mem);
                    if (memArena == ownerArena) continue;
                    neededSlots++;
                }
                // Capacity check for waiting/starting arenas (all-or-none)
                if (isWaiting && neededSlots > 0) {
                    int available = ownerArena.getMaxPlayers() - ownerArena.getPlayers().size();
                    if (neededSlots > available) {
                        p.sendMessage("\u00A79Party \u00A78> \u00A7cNot enough space! Need " + neededSlots + " slots but only " + available + " available.");
                        return true;
                    }
                }
                // Set cooldown
                warpCooldowns.put(p.getUniqueId(), now);
                // Warp all members
                Sound warpSound = Sound.valueOf(BedWars.getForCurrentVersion("ENDERMAN_TELEPORT", "ENTITY_ENDERMAN_TELEPORT", "ENTITY_ENDERMAN_TELEPORT"));
                for (Player mem : members) {
                    if (mem == p) continue;
                    IArena memArena = Arena.getArenaByPlayer(mem);
                    if (memArena == ownerArena) continue;
                    // Remove from current arena if any
                    if (memArena != null) {
                        if (memArena.isPlayer(mem)) {
                            memArena.removePlayer(mem, false);
                        } else if (memArena.isSpectator(mem)) {
                            memArena.removeSpectator(mem, false);
                        }
                    }
                    if (isWaiting) {
                        ownerArena.addPlayer(mem, true);
                    } else {
                        // Playing — join as spectator
                        ownerArena.addSpectator(mem, false, null);
                    }
                    mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_WARP_WARPED).replace("{owner}", p.getName()));
                    mem.playSound(mem.getLocation(), warpSound, 1f, 1f);
                }
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_WARP_SUCCESS));
                p.playSound(p.getLocation(), warpSound, 1f, 1f);
                break;
            default:
                sendPartyCmds(p);
                break;
        }
        return false;
    }

    private void sendPartyCmds(Player p) {
        for (String s : getList(p, Messages.COMMAND_PARTY_HELP)) {
            p.sendMessage(s);
        }
    }
}
