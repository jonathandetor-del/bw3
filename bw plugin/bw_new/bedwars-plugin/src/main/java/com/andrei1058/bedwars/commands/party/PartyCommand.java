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
import com.andrei1058.bedwars.sidebar.SidebarService;
import com.andrei1058.bedwars.support.party.Internal;
import io.netty.buffer.Unpooled;
import net.md_5.bungee.api.chat.ClickEvent;
import net.md_5.bungee.api.chat.TextComponent;
import net.minecraft.server.v1_8_R3.EntityPlayer;
import net.minecraft.server.v1_8_R3.NBTTagCompound;
import net.minecraft.server.v1_8_R3.NBTTagList;
import net.minecraft.server.v1_8_R3.NBTTagString;
import net.minecraft.server.v1_8_R3.PacketDataSerializer;
import net.minecraft.server.v1_8_R3.PacketPlayOutCustomPayload;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.defaults.BukkitCommand;
import org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer;
import org.bukkit.craftbukkit.v1_8_R3.inventory.CraftItemStack;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.BookMeta;

import java.util.*;

import static com.andrei1058.bedwars.BedWars.getParty;
import static com.andrei1058.bedwars.api.language.Language.getList;
import static com.andrei1058.bedwars.api.language.Language.getMsg;

public class PartyCommand extends BukkitCommand {

    public PartyCommand(String name) {
        super(name);
    }

    // inviter UUID → (target UUID → expiry timestamp) invite tracking
    private static final Map<UUID, Map<UUID, Long>> partyInvites = new HashMap<>();
    private static final long INVITE_EXPIRY_MS = 120_000L; // 120 seconds
    private static final HashMap<UUID, Long> warpCooldowns = new HashMap<>();
    private static final long WARP_COOLDOWN_MS = 3000L;

    // Poll tracking: poll ID → (answer index → set of voters)
    private static final Map<UUID, Map<Integer, Set<UUID>>> activePolls = new HashMap<>();
    private static final Map<UUID, String[]> activePollAnswers = new HashMap<>();
    private static final Map<UUID, String> activePollQuestions = new HashMap<>();

    @Override
    public boolean execute(CommandSender s, String c, String[] args) {
        if (s instanceof ConsoleCommandSender) return true;
        Player p = (Player) s;

        // /pl → treat as /party list
        if (getName().equalsIgnoreCase("pl")) {
            handleList(p);
            return true;
        }

        if (args.length == 0 || args[0].equalsIgnoreCase("help") || args[0].equalsIgnoreCase("info")) {
            sendPartyCmds(p);
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "invite":
                handleInvite(p, args);
                break;
            case "accept":
                handleAccept(p, args);
                break;
            case "leave":
                handleLeave(p);
                break;
            case "disband":
                handleDisband(p);
                break;
            case "kick":
            case "remove":
                handleKick(p, args);
                break;
            case "transfer":
                handleTransfer(p, args);
                break;
            case "promote":
                handlePromote(p, args);
                break;
            case "demote":
                handleDemote(p, args);
                break;
            case "list":
                handleList(p);
                break;
            case "warp":
                handleWarp(p);
                break;
            case "mute":
                handleMute(p);
                break;
            case "private":
                handlePrivateGame(p);
                break;
            case "poll":
                handlePoll(p, args);
                break;
            case "setting":
                handleSetting(p, args);
                break;
            case "open":
                handleOpen(p, args);
                break;
            case "join":
                handleJoin(p, args);
                break;
            case "chat":
                handleChat(p, args);
                break;
            case "kickoffline":
                handleKickOffline(p);
                break;
            case "pollvote":
                handlePollVote(p, args);
                break;
            default:
                sendPartyCmds(p);
                break;
        }
        return false;
    }

    // ========== INVITE (multi-player support) ==========
    private void handleInvite(Player p, String[] args) {
        if (args.length == 1) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_USAGE));
            return;
        }
        // Permission: owner, moderator, or allInvite
        if (getParty().hasParty(p) && !getParty().isOwner(p)) {
            Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
            if (pd != null && !pd.isAllInvite() && !pd.getModerators().contains(p)) {
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
                return;
            }
        }
        // Loop through all player names to invite
        for (int i = 1; i < args.length; i++) {
            String targetName = args[i];
            Player target = Bukkit.getPlayer(targetName);
            if (target != null && target.isOnline()) {
                if (target == p) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_DENIED_CANNOT_INVITE_YOURSELF));
                    continue;
                }
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_SENT).replace("{playername}", p.getName()).replace("{player}", targetName));
                TextComponent tc = new TextComponent(getMsg(p, Messages.COMMAND_PARTY_INVITE_SENT_TARGET_RECEIVE_MSG).replace("{player}", p.getName()));
                tc.setClickEvent(new ClickEvent(ClickEvent.Action.RUN_COMMAND, "/party accept " + p.getName()));
                target.spigot().sendMessage(tc);
                target.sendMessage("\u00A79Party \u00A78> \u00A7eYou have 120 seconds to accept.");
                partyInvites.computeIfAbsent(p.getUniqueId(), k -> new HashMap<>())
                        .put(target.getUniqueId(), System.currentTimeMillis() + INVITE_EXPIRY_MS);
            } else {
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_DENIED_PLAYER_OFFLINE).replace("{player}", targetName));
            }
        }
    }

    // ========== ACCEPT ==========
    private void handleAccept(Player p, String[] args) {
        if (args.length < 2) return;
        Player inviter = Bukkit.getPlayer(args[1]);
        if (inviter == null || !inviter.isOnline()) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_DENIED_PLAYER_OFFLINE).replace("{player}", args[1]));
            return;
        }

        long now = System.currentTimeMillis();

        // Direct lookup: inviter has a pending invite for this player
        UUID actualInviterUUID = null;
        Map<UUID, Long> inviterTargets = partyInvites.get(inviter.getUniqueId());
        if (inviterTargets != null) {
            Long expiry = inviterTargets.get(p.getUniqueId());
            if (expiry != null) {
                if (expiry > now) {
                    actualInviterUUID = inviter.getUniqueId();
                } else {
                    inviterTargets.remove(p.getUniqueId()); // expired
                }
            }
        }

        // Fallback: the player typed the party owner's name but a member sent the invite.
        if (actualInviterUUID == null && getParty().hasParty(inviter)) {
            for (Map.Entry<UUID, Map<UUID, Long>> entry : partyInvites.entrySet()) {
                Long expiry = entry.getValue().get(p.getUniqueId());
                if (expiry != null && expiry > now) {
                    Player candidate = Bukkit.getPlayer(entry.getKey());
                    if (candidate != null && getParty().hasParty(candidate)) {
                        Player candidateOwner = getParty().getOwner(candidate);
                        if (candidateOwner != null && candidateOwner.equals(inviter)) {
                            actualInviterUUID = entry.getKey();
                            break;
                        }
                    }
                } else if (expiry != null) {
                    entry.getValue().remove(p.getUniqueId()); // expired, clean up
                }
            }
        }

        if (actualInviterUUID == null) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_ACCEPT_DENIED_NO_INVITE));
            return;
        }

        // Remove the accepted invite
        Map<UUID, Long> targets = partyInvites.get(actualInviterUUID);
        if (targets != null) {
            targets.remove(p.getUniqueId());
            if (targets.isEmpty()) partyInvites.remove(actualInviterUUID);
        }

        // Auto-leave current party before joining (Hypixel behavior)
        if (getParty().hasParty(p)) {
            getParty().removeFromParty(p);
        }

        Player realInviter = Bukkit.getPlayer(actualInviterUUID);
        if (realInviter == null) realInviter = inviter;

        if (getParty().hasParty(realInviter)) {
            Player owner = getParty().getOwner(realInviter);
            if (owner == null) owner = realInviter;
            getParty().addMember(owner, p);
            for (Player on : getParty().getMembers(owner)) {
                on.sendMessage(getMsg(p, Messages.COMMAND_PARTY_ACCEPT_SUCCESS).replace("{playername}", p.getName()).replace("{player}", p.getDisplayName()));
            }
        } else {
            getParty().createParty(realInviter, p);
            for (Player on : getParty().getMembers(realInviter)) {
                on.sendMessage(getMsg(p, Messages.COMMAND_PARTY_ACCEPT_SUCCESS).replace("{playername}", p.getName()).replace("{player}", p.getDisplayName()));
            }
        }
    }

    // ========== LEAVE ==========
    private void handleLeave(Player p) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        if (getParty().isOwner(p)) {
            List<Player> members = getParty().getMembers(p);
            if (members.size() <= 1) {
                getParty().disband(p);
            } else {
                // Transfer to a moderator first, else random member
                Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
                Player newOwner = null;
                if (pd != null) {
                    for (Player mod : pd.getModerators()) {
                        if (mod != p && members.contains(mod)) {
                            newOwner = mod;
                            break;
                        }
                    }
                }
                if (newOwner == null) {
                    for (Player mem : members) {
                        if (!mem.equals(p)) {
                            newOwner = mem;
                            break;
                        }
                    }
                }
                if (newOwner != null) {
                    getParty().promote(p, newOwner);
                    if (pd != null) pd.getModerators().remove(newOwner);
                    for (Player mem : getParty().getMembers(newOwner)) {
                        mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_PROMOTE_NEW_OWNER).replace("{player}", newOwner.getName()));
                    }
                    getParty().removeFromParty(p);
                } else {
                    getParty().disband(p);
                }
            }
        } else {
            getParty().removeFromParty(p);
        }
    }

    // ========== DISBAND ==========
    private void handleDisband(Player p) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        if (!getParty().isOwner(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        getParty().disband(p);
    }

    // ========== KICK / REMOVE ==========
    private void handleKick(Player p, String[] args) {
        if (args.length == 1) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_USAGE));
            return;
        }
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        // Owner or moderator can kick
        boolean isOwner = getParty().isOwner(p);
        boolean isMod = Internal.isModerator(p);
        if (!isOwner && !isMod) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        Player target = Bukkit.getPlayer(args[1]);
        if (target == null) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_DENIED_TARGET_NOT_PARTY_MEMBER).replace("{player}", args[1]));
            return;
        }
        // Mod can't kick owner or other mods
        if (isMod && !isOwner) {
            if (getParty().isOwner(target) || Internal.isModerator(target)) {
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
                return;
            }
        }
        Player owner = getParty().getOwner(p);
        if (owner == null || !getParty().isMember(owner, target)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_DENIED_TARGET_NOT_PARTY_MEMBER).replace("{player}", args[1]));
            return;
        }
        getParty().removePlayer(owner, target);
    }

    // ========== TRANSFER (direct owner transfer) ==========
    private void handleTransfer(Player p, String[] args) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        if (!getParty().isOwner(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        if (args.length == 1) {
            sendPartyCmds(p);
            return;
        }
        Player target = Bukkit.getPlayer(args[1]);
        if (target == null || !getParty().isMember(p, target)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_DENIED_TARGET_NOT_PARTY_MEMBER).replace("{player}", args[1]));
            return;
        }
        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        getParty().promote(p, target);
        if (pd != null) pd.getModerators().remove(target);
        for (Player p1 : getParty().getMembers(p)) {
            if (p1.equals(p)) {
                p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_SUCCESS).replace("{player}", args[1]));
            } else if (p1.equals(target)) {
                p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_OWNER));
            } else {
                p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_NEW_OWNER).replace("{player}", args[1]));
            }
        }
    }

    // ========== PROMOTE (member → mod, mod → owner) ==========
    private void handlePromote(Player p, String[] args) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        if (!getParty().isOwner(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        if (args.length == 1) {
            sendPartyCmds(p);
            return;
        }
        Player target = Bukkit.getPlayer(args[1]);
        if (target == null || !getParty().isMember(p, target)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_REMOVE_DENIED_TARGET_NOT_PARTY_MEMBER).replace("{player}", args[1]));
            return;
        }
        if (target.equals(p)) return;

        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        if (pd == null) return;

        if (pd.getModerators().contains(target)) {
            // Already mod → promote to owner (same as transfer)
            getParty().promote(p, target);
            pd.getModerators().remove(target);
            for (Player p1 : getParty().getMembers(p)) {
                if (p1.equals(p)) {
                    p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_SUCCESS).replace("{player}", args[1]));
                } else if (p1.equals(target)) {
                    p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_OWNER));
                } else {
                    p1.sendMessage(getMsg(p1, Messages.COMMAND_PARTY_PROMOTE_NEW_OWNER).replace("{player}", args[1]));
                }
            }
        } else {
            // Member → moderator
            pd.getModerators().add(target);
            for (Player mem : getParty().getMembers(p)) {
                if (mem.equals(target)) {
                    mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_PROMOTED_TO_MOD));
                } else {
                    mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_PROMOTE_TO_MOD).replace("{player}", target.getName()));
                }
            }
        }
    }

    // ========== DEMOTE (mod → member) ==========
    private void handleDemote(Player p, String[] args) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        if (!getParty().isOwner(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        if (args.length == 1) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_DEMOTE_USAGE));
            return;
        }
        Player target = Bukkit.getPlayer(args[1]);
        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        if (pd == null || target == null || !pd.getModerators().contains(target)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_DEMOTE_NOT_MOD).replace("{player}", args[1]));
            return;
        }
        pd.getModerators().remove(target);
        for (Player mem : getParty().getMembers(p)) {
            mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_DEMOTE_SUCCESS).replace("{player}", target.getName()));
        }
    }

    // ========== LIST (Hypixel-style with Vault prefixes) ==========
    private void handleList(Player p) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        Player owner = getParty().getOwner(p);
        if (owner == null) return;
        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        if (pd == null) return;

        List<Player> members = getParty().getMembers(owner);
        Map<UUID, String> disconnected = Internal.getDisconnectedMembers(pd);
        int totalCount = members.size() + disconnected.size();

        p.sendMessage("");
        p.sendMessage("\u00A79Party Members \u00A77(" + totalCount + ")");
        p.sendMessage("");

        // Party Leader
        String leaderPrefix = BedWars.getChatSupport().getPrefix(owner);
        p.sendMessage("\u00A7eParty Leader: " + leaderPrefix + owner.getName() + " \u00A7a\u25CF");

        // Party Moderators
        if (!pd.getModerators().isEmpty()) {
            StringBuilder modLine = new StringBuilder("\u00A7eParty Moderators: ");
            for (Player mod : pd.getModerators()) {
                if (mod == owner) continue;
                String modPrefix = BedWars.getChatSupport().getPrefix(mod);
                modLine.append(modPrefix).append(mod.getName()).append(" \u00A7a\u25CF ");
            }
            p.sendMessage(modLine.toString().trim());
        }

        // Party Members (non-owner, non-mod online members)
        StringBuilder memLine = new StringBuilder("\u00A7eParty Members: ");
        boolean hasMembers = false;
        for (Player mem : members) {
            if (mem == owner || pd.getModerators().contains(mem)) continue;
            String memPrefix = BedWars.getChatSupport().getPrefix(mem);
            memLine.append(memPrefix).append(mem.getName()).append(" \u00A7a\u25CF ");
            hasMembers = true;
        }
        // Offline (grace period) members shown with red dot
        for (Map.Entry<UUID, String> entry : disconnected.entrySet()) {
            memLine.append("\u00A77").append(entry.getValue()).append(" \u00A7c\u25CF ");
            hasMembers = true;
        }
        if (hasMembers) {
            p.sendMessage(memLine.toString().trim());
        }
        p.sendMessage("");
    }

    // ========== WARP ==========
    private void handleWarp(Player p) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        if (!getParty().isOwner(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        long now = System.currentTimeMillis();
        Long lastWarp = warpCooldowns.get(p.getUniqueId());
        if (lastWarp != null && now - lastWarp < WARP_COOLDOWN_MS) {
            long remaining = (WARP_COOLDOWN_MS - (now - lastWarp)) / 1000 + 1;
            p.sendMessage("\u00A79Party \u00A78> \u00A7cWarp is on cooldown! Wait " + remaining + "s.");
            return;
        }
        IArena ownerArena = Arena.getArenaByPlayer(p);
        warpCooldowns.put(p.getUniqueId(), now);
        Sound warpSound = Sound.valueOf(BedWars.getForCurrentVersion("ENDERMAN_TELEPORT", "ENTITY_ENDERMAN_TELEPORT", "ENTITY_ENDERMAN_TELEPORT"));

        // Leader is in lobby — warp all members to lobby
        if (ownerArena == null) {
            Location lobby = BedWars.config.getConfigLoc("lobbyLoc");
            if (lobby == null) {
                p.sendMessage("\u00A79Party \u00A78> \u00A7cLobby location is not set.");
                return;
            }
            List<Player> members = getParty().getMembers(p);
            for (Player mem : members) {
                if (mem == p) continue;
                IArena memArena = Arena.getArenaByPlayer(mem);
                if (memArena != null) {
                    if (memArena.isPlayer(mem)) {
                        memArena.removePlayer(mem, false);
                    } else if (memArena.isSpectator(mem)) {
                        memArena.removeSpectator(mem, false);
                    }
                }
                mem.teleport(lobby);
                mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_WARP_WARPED).replace("{owner}", p.getName()));
                mem.playSound(mem.getLocation(), warpSound, 1f, 1f);
            }
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_WARP_SUCCESS));
            p.playSound(p.getLocation(), warpSound, 1f, 1f);
            return;
        }

        // Leader is in an arena
        boolean isPlaying = (ownerArena.getStatus() == GameState.playing);
        boolean isWaiting = (ownerArena.getStatus() == GameState.waiting || ownerArena.getStatus() == GameState.starting);
        if (!isPlaying && !isWaiting) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_WARP_NOT_IN_ARENA));
            return;
        }
        List<Player> members = getParty().getMembers(p);
        int neededSlots = 0;
        for (Player mem : members) {
            if (mem == p) continue;
            IArena memArena = Arena.getArenaByPlayer(mem);
            if (memArena == ownerArena) continue;
            neededSlots++;
        }
        if (isWaiting && neededSlots > 0) {
            int available = ownerArena.getMaxPlayers() - ownerArena.getPlayers().size();
            if (neededSlots > available) {
                p.sendMessage("\u00A79Party \u00A78> \u00A7cNot enough space! Need " + neededSlots + " slots but only " + available + " available.");
                return;
            }
        }
        int warped = 0;
        for (Player mem : members) {
            if (mem == p) continue;
            IArena memArena = Arena.getArenaByPlayer(mem);
            if (memArena == ownerArena) continue;
            if (memArena != null) {
                if (memArena.isPlayer(mem)) {
                    memArena.removePlayer(mem, false);
                } else if (memArena.isSpectator(mem)) {
                    memArena.removeSpectator(mem, false);
                }
            }
            boolean added;
            if (isWaiting) {
                added = ownerArena.addPlayer(mem, true);
            } else {
                added = ownerArena.addSpectator(mem, false, null);
            }
            if (added) {
                warped++;
                // Delayed scoreboard refresh to ensure arena sidebar takes effect
                final Player target = mem;
                Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
                    if (target.isOnline() && Arena.getArenaByPlayer(target) == ownerArena) {
                        SidebarService.getInstance().giveSidebar(target, ownerArena, false);
                    }
                }, 5L);
                mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_WARP_WARPED).replace("{owner}", p.getName()));
                mem.playSound(mem.getLocation(), warpSound, 1f, 1f);
            }
        }
        if (warped > 0) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_WARP_SUCCESS));
            p.playSound(p.getLocation(), warpSound, 1f, 1f);
        } else {
            p.sendMessage("\u00A79Party \u00A78> \u00A7cNo party members could be warped.");
        }
    }

    // ========== MUTE ==========
    private void handleMute(Player p) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        boolean isOwner = getParty().isOwner(p);
        boolean isMod = Internal.isModerator(p);
        if (!isOwner && !isMod) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        if (pd == null) return;
        pd.setMuted(!pd.isMuted());
        String msg = pd.isMuted() ? getMsg(p, Messages.COMMAND_PARTY_MUTE_ENABLED) : getMsg(p, Messages.COMMAND_PARTY_MUTE_DISABLED);
        for (Player mem : getParty().getMembers(p)) {
            mem.sendMessage(msg);
        }
    }

    // ========== PRIVATE GAME (MVP+ only) ==========
    private void handlePrivateGame(Player p) {
        if (!p.hasPermission("bw.party.private")) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_PRIVATE_NO_PERM));
            return;
        }
        if (!getParty().hasParty(p)) {
            getParty().createParty(p);
        }
        if (!getParty().isOwner(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        if (pd == null) return;
        pd.setPrivateGame(!pd.isPrivateGame());
        String status = pd.isPrivateGame() ? "\u00A7aenabled" : "\u00A7cdisabled";
        String prefix = BedWars.getChatSupport().getPrefix(p);
        String toggleMsg = getMsg(p, Messages.COMMAND_PARTY_PRIVATE_TOGGLE)
                .replace("{prefix}", prefix)
                .replace("{player}", p.getName())
                .replace("{status}", status);
        for (Player mem : getParty().getMembers(p)) {
            mem.sendMessage(toggleMsg);
        }
    }

    // ========== POLL ==========
    private void handlePoll(Player p, String[] args) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        if (args.length < 2) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_POLL_USAGE));
            return;
        }
        // Join all args after "poll" and split by /
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i < args.length; i++) {
            if (i > 1) sb.append(" ");
            sb.append(args[i]);
        }
        String[] parts = sb.toString().split("/");
        if (parts.length < 3) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_POLL_USAGE));
            return;
        }
        String question = parts[0].trim();
        String[] answers = new String[parts.length - 1];
        for (int i = 1; i < parts.length; i++) {
            answers[i - 1] = parts[i].trim();
        }

        UUID pollId = UUID.randomUUID();
        Map<Integer, Set<UUID>> votes = new HashMap<>();
        for (int i = 0; i < answers.length; i++) {
            votes.put(i, new HashSet<>());
        }
        activePolls.put(pollId, votes);
        activePollAnswers.put(pollId, answers);
        activePollQuestions.put(pollId, question);

        Player owner = getParty().getOwner(p);
        List<Player> members = getParty().getMembers(owner);
        for (Player mem : members) {
            mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_POLL_QUESTION)
                    .replace("{player}", p.getName()).replace("{question}", question));
            for (int i = 0; i < answers.length; i++) {
                TextComponent tc = new TextComponent(getMsg(mem, Messages.COMMAND_PARTY_POLL_ANSWER)
                        .replace("{number}", String.valueOf(i + 1)).replace("{answer}", answers[i]));
                tc.setClickEvent(new ClickEvent(ClickEvent.Action.RUN_COMMAND, "/party pollvote " + pollId + " " + i));
                mem.spigot().sendMessage(tc);
            }
        }

        // Auto-close poll after 30 seconds
        Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> closePoll(pollId, owner), 600L);
    }

    private void closePoll(UUID pollId, Player owner) {
        Map<Integer, Set<UUID>> votes = activePolls.remove(pollId);
        String[] answers = activePollAnswers.remove(pollId);
        String question = activePollQuestions.remove(pollId);
        if (votes == null || answers == null || question == null) return;
        if (!getParty().hasParty(owner)) return;

        List<Player> members = getParty().getMembers(owner);
        if (members == null) return;

        StringBuilder result = new StringBuilder("\u00A79Party \u00A78> \u00A7ePoll results for \u00A7a" + question + "\u00A7e:");
        for (int i = 0; i < answers.length; i++) {
            Set<UUID> voters = votes.getOrDefault(i, Collections.emptySet());
            result.append("\n  \u00A7e").append(i + 1).append(". \u00A7b").append(answers[i]).append(" \u00A77- \u00A7a").append(voters.size()).append(" vote(s)");
        }
        String resultStr = result.toString();
        for (Player mem : members) {
            mem.sendMessage(resultStr);
        }
    }

    // ========== SETTING ==========
    private void handleSetting(Player p, String[] args) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        if (!getParty().isOwner(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        if (args.length == 1) {
            for (String line : getList(p, Messages.COMMAND_PARTY_SETTING_HELP)) {
                p.sendMessage(line);
            }
            return;
        }
        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        if (pd == null) return;

        if (args[1].equalsIgnoreCase("allinvite")) {
            pd.setAllInvite(!pd.isAllInvite());
            String msg = pd.isAllInvite() ? getMsg(p, Messages.COMMAND_PARTY_SETTING_ALLINVITE_ON) : getMsg(p, Messages.COMMAND_PARTY_SETTING_ALLINVITE_OFF);
            for (Player mem : getParty().getMembers(p)) {
                mem.sendMessage(msg);
            }
        } else if (args[1].equalsIgnoreCase("public")) {
            handleOpen(p, args);
        } else if (args[1].equalsIgnoreCase("private")) {
            if (pd.isOpenParty()) {
                pd.setOpenParty(false);
                pd.setMaxSize(0);
                String msg = getMsg(p, Messages.COMMAND_PARTY_CLOSED);
                for (Player mem : getParty().getMembers(p)) {
                    mem.sendMessage(msg);
                }
            } else {
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_CLOSED));
            }
        } else {
            for (String line : getList(p, Messages.COMMAND_PARTY_SETTING_HELP)) {
                p.sendMessage(line);
            }
        }
    }

    // ========== CHAT (alias for /pc) ==========
    private void handleChat(Player p, String[] args) {
        if (args.length < 2) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_CHAT_USAGE));
            return;
        }
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        StringBuilder msg = new StringBuilder();
        for (int i = 1; i < args.length; i++) {
            if (i > 1) msg.append(" ");
            msg.append(args[i]);
        }
        Internal.sendPartyChatMessage(p, msg.toString());
    }

    // ========== KICKOFFLINE ==========
    private void handleKickOffline(Player p) {
        if (!getParty().hasParty(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_GENERAL_DENIED_NOT_IN_PARTY));
            return;
        }
        boolean isOwner = getParty().isOwner(p);
        boolean isMod = Internal.isModerator(p);
        if (!isOwner && !isMod) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }
        Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
        if (pd == null) return;
        int count = Internal.kickOfflineMembers(pd);
        if (count > 0) {
            for (Player mem : getParty().getMembers(p)) {
                mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_KICKOFFLINE_SUCCESS).replace("{count}", String.valueOf(count)));
            }
        } else {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_KICKOFFLINE_NONE));
        }
    }

    // ========== POLL VOTE (internal command, triggered by click) ==========
    private static void handlePollVote(Player p, String[] args) {
        if (args.length < 3) return;
        try {
            UUID pollId = UUID.fromString(args[1]);
            int answerIdx = Integer.parseInt(args[2]);
            Map<Integer, Set<UUID>> votes = activePolls.get(pollId);
            if (votes == null) {
                p.sendMessage("\u00A79Party \u00A78> \u00A7cThis poll has ended.");
                return;
            }
            // Remove previous vote
            for (Set<UUID> voters : votes.values()) {
                voters.remove(p.getUniqueId());
            }
            Set<UUID> voters = votes.get(answerIdx);
            if (voters != null) {
                voters.add(p.getUniqueId());
                String[] answers = activePollAnswers.get(pollId);
                if (answers != null && answerIdx < answers.length) {
                    p.sendMessage("\u00A79Party \u00A78> \u00A7aYou voted for: \u00A7b" + answers[answerIdx]);
                }
            }
        } catch (Exception ignored) {
        }
    }

    // ========== OPEN (public party) ==========
    private void handleOpen(Player p, String[] args) {
        // /party open <size> — set the party as open with a max size (called from book click or direct)
        // Check for size argument: could be args[1] (from /party open 12) or args[2] (from /party setting public 12)
        String sizeArg = null;
        if (args.length >= 3 && args[0].equalsIgnoreCase("setting")) {
            sizeArg = args[2];
        } else if (args.length >= 2 && args[0].equalsIgnoreCase("open")) {
            sizeArg = args[1];
        }

        if (sizeArg != null) {
            int maxSize;
            try {
                maxSize = Integer.parseInt(sizeArg);
                if (maxSize < 2 || maxSize > 100) {
                    p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_OPEN_SELECT_SIZE));
                    return;
                }
            } catch (NumberFormatException e) {
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_OPEN_SELECT_SIZE));
                return;
            }

            if (!getParty().hasParty(p)) {
                getParty().createParty(p);
            }
            if (!getParty().isOwner(p)) {
                p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
                return;
            }

            Internal.PartyData pd = Internal.getPartyDataByPlayer(p);
            if (pd == null) return;

            pd.setOpenParty(true);
            pd.setMaxSize(maxSize);
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_OPEN_CREATED).replace("{player}", p.getName()));
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_OPEN_CAPPED).replace("{max}", String.valueOf(maxSize)));
            return;
        }

        // No size argument: show book GUI for size selection
        if (!getParty().hasParty(p)) {
            getParty().createParty(p);
        }
        if (!getParty().isOwner(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INSUFFICIENT_PERMISSIONS));
            return;
        }

        openPartySizeBook(p);
    }

    // ========== JOIN (public party) ==========
    private void handleJoin(Player p, String[] args) {
        if (args.length < 2) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_JOIN_USAGE));
            return;
        }

        Player target = Bukkit.getPlayer(args[1]);
        if (target == null) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_DENIED_PLAYER_OFFLINE).replace("{player}", args[1]));
            return;
        }

        if (target.equals(p)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_INVITE_DENIED_CANNOT_INVITE_YOURSELF));
            return;
        }

        if (!getParty().hasParty(target)) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_JOIN_DENIED_NOT_OPEN));
            return;
        }

        Internal.PartyData pd = Internal.getPartyDataByPlayer(target);
        if (pd == null || !pd.isOpenParty()) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_JOIN_DENIED_NOT_OPEN));
            return;
        }

        int currentSize = getParty().getMembers(pd.getOwner()).size();
        if (pd.getMaxSize() > 0 && currentSize >= pd.getMaxSize()) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_JOIN_DENIED_FULL));
            return;
        }

        // Auto-leave current party if in one
        if (getParty().hasParty(p)) {
            if (getParty().isOwner(p)) {
                getParty().disband(p);
            } else {
                getParty().removeFromParty(p);
            }
        }

        getParty().addMember(pd.getOwner(), p);
        String msg = getMsg(p, Messages.COMMAND_PARTY_JOIN_SUCCESS).replace("{player}", p.getName());
        for (Player mem : getParty().getMembers(pd.getOwner())) {
            mem.sendMessage(msg);
        }
    }

    // ========== BOOK GUI for party size selection ==========
    private void openPartySizeBook(Player p) {
        try {
            ItemStack book = new ItemStack(Material.WRITTEN_BOOK);
            BookMeta meta = (BookMeta) book.getItemMeta();
            meta.setTitle("Party");
            meta.setAuthor("Server");
            book.setItemMeta(meta);

            net.minecraft.server.v1_8_R3.ItemStack nmsBook = CraftItemStack.asNMSCopy(book);
            NBTTagCompound tag = nmsBook.getTag();
            if (tag == null) tag = new NBTTagCompound();

            NBTTagList pages = new NBTTagList();
            String pageJson = "{\"text\":\"Select the maximum number\\nof players for your party:\\n\\n\"," +
                    "\"extra\":[" +
                    "{\"text\":\"> 12\\n\\n\",\"color\":\"dark_green\",\"bold\":true,\"clickEvent\":{\"action\":\"run_command\",\"value\":\"/party open 12\"}}," +
                    "{\"text\":\"> 16\\n\\n\",\"color\":\"dark_green\",\"bold\":true,\"clickEvent\":{\"action\":\"run_command\",\"value\":\"/party open 16\"}}," +
                    "{\"text\":\"> 24\\n\\n\",\"color\":\"dark_green\",\"bold\":true,\"clickEvent\":{\"action\":\"run_command\",\"value\":\"/party open 24\"}}," +
                    "{\"text\":\"> Custom\",\"color\":\"dark_green\",\"bold\":true,\"clickEvent\":{\"action\":\"suggest_command\",\"value\":\"/party open \"}}" +
                    "]}";
            pages.add(new NBTTagString(pageJson));
            tag.set("pages", pages);
            tag.setString("title", "Party");
            tag.setString("author", "Server");
            nmsBook.setTag(tag);

            ItemStack oldItem = p.getItemInHand();
            p.setItemInHand(CraftItemStack.asBukkitCopy(nmsBook));

            EntityPlayer ep = ((CraftPlayer) p).getHandle();
            ep.playerConnection.sendPacket(new PacketPlayOutCustomPayload("MC|BOpen", new PacketDataSerializer(Unpooled.buffer())));

            p.setItemInHand(oldItem);
        } catch (Exception e) {
            // Fallback: use clickable chat messages
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_OPEN_SELECT_SIZE));
            TextComponent opt12 = new TextComponent("\u00A72\u00A7l> 12");
            opt12.setClickEvent(new ClickEvent(ClickEvent.Action.RUN_COMMAND, "/party open 12"));
            TextComponent opt16 = new TextComponent("\u00A72\u00A7l> 16");
            opt16.setClickEvent(new ClickEvent(ClickEvent.Action.RUN_COMMAND, "/party open 16"));
            TextComponent opt24 = new TextComponent("\u00A72\u00A7l> 24");
            opt24.setClickEvent(new ClickEvent(ClickEvent.Action.RUN_COMMAND, "/party open 24"));
            TextComponent optCustom = new TextComponent("\u00A72\u00A7l> Custom");
            optCustom.setClickEvent(new ClickEvent(ClickEvent.Action.SUGGEST_COMMAND, "/party open "));
            p.spigot().sendMessage(opt12);
            p.spigot().sendMessage(opt16);
            p.spigot().sendMessage(opt24);
            p.spigot().sendMessage(optCustom);
        }
    }

    // ========== HELP ==========
    private void sendPartyCmds(Player p) {
        for (String line : getList(p, Messages.COMMAND_PARTY_HELP)) {
            p.sendMessage(line);
        }
    }

    /**
     * Called from the main execute for the hidden pollvote subcommand.
     */
    public static boolean handlePollVoteCommand(CommandSender s, String[] args) {
        if (s instanceof Player) {
            handlePollVote((Player) s, args);
            return true;
        }
        return false;
    }
}
