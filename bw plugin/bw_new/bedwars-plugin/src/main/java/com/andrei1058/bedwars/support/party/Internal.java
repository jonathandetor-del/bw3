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

package com.andrei1058.bedwars.support.party;

import com.andrei1058.bedwars.BedWars;
import com.andrei1058.bedwars.api.language.Messages;
import com.andrei1058.bedwars.api.party.Party;
import org.bukkit.Bukkit;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;
import org.jetbrains.annotations.Contract;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import static com.andrei1058.bedwars.BedWars.getParty;
import static com.andrei1058.bedwars.api.language.Language.getMsg;

public class Internal implements Party {
    private static final List<Internal.PartyData> parties = new ArrayList<>();

    private static final Map<UUID, ChatMode> chatModes = new ConcurrentHashMap<>();

    // Disconnect grace period maps
    private static final Map<UUID, BukkitTask> reconnectTasks = new ConcurrentHashMap<>();
    private static final Map<UUID, PartyData> disconnectedPartyMap = new ConcurrentHashMap<>();
    private static final Map<UUID, String> disconnectedNames = new ConcurrentHashMap<>();

    private static final long RECONNECT_GRACE_TICKS = 6000L; // 5 minutes

    public enum ChatMode {
        ALL, PARTY
    }

    @Override
    public boolean hasParty(Player p) {
        for (PartyData party : getParties()) {
            if (party.members.contains(p)) return true;
        }
        return false;
    }

    @Override
    public int partySize(Player p) {
        for (PartyData party : getParties()) {
            if (party.members.contains(p)) {
                return party.members.size();
            }
        }
        return 0;
    }

    @Override
    public boolean isOwner(Player p) {
        for (PartyData party : getParties()) {
            if (party.members.contains(p)) {
                if (party.owner == p) return true;
            }
        }
        return false;
    }

    @Override
    public List<Player> getMembers(Player owner) {
        for (PartyData party : getParties()) {
            if (party.members.contains(owner)) {
                return party.members;
            }
        }
        return null;
    }

    @Override
    public void createParty(Player owner, Player... members) {
        PartyData p = new PartyData(owner);
        p.addMember(owner);
        for (Player mem : members) {
            p.addMember(mem);
        }
    }

    @Override
    public void addMember(Player owner, Player member) {
        if (owner == null || member == null) return;
        Internal.PartyData p = getPartyData(owner);
        if (p == null) return;
        p.addMember(member);
    }

    @Override
    public void removeFromParty(Player member) {
        for (PartyData p : new ArrayList<>(getParties())) {
            if (p.owner == member) {
                // Owner leaving: auto-promote if any other members remain
                if (p.members.size() > 1) {
                    // Prefer a moderator for promotion
                    Player newOwner = null;
                    for (Player mod : p.moderators) {
                        if (mod != member && p.members.contains(mod)) {
                            newOwner = mod;
                            break;
                        }
                    }
                    if (newOwner == null) {
                        for (Player mem : p.members) {
                            if (mem != member) {
                                newOwner = mem;
                                break;
                            }
                        }
                    }
                    if (newOwner != null) {
                        p.owner = newOwner;
                        p.moderators.remove(newOwner);
                        p.moderators.remove(member);
                        p.members.remove(member);
                        chatModes.remove(member.getUniqueId());
                        for (Player mem : p.members) {
                            mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_PROMOTE_NEW_OWNER).replace("{player}", newOwner.getName()));
                            mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_LEAVE_SUCCESS).replace("{playername}", member.getName()).replace("{player}", member.getDisplayName()));
                        }
                        return;
                    }
                }
                disband(member);
            } else if (p.members.contains(member)) {
                for (Player mem : p.members) {
                    mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_LEAVE_SUCCESS).replace("{playername}", member.getName()).replace("{player}", member.getDisplayName()));
                }
                p.members.remove(member);
                p.moderators.remove(member);
                chatModes.remove(member.getUniqueId());
                /* Party persists with 1 member (Hypixel style) */
                return;
            }
        }
    }

    @Override
    public void disband(Player owner) {
        Internal.PartyData pa = getPartyData(owner);
        if (pa == null) return;
        for (Player p : pa.members) {
            p.sendMessage(getMsg(p, Messages.COMMAND_PARTY_DISBAND_SUCCESS));
            chatModes.remove(p.getUniqueId());
        }
        // Cancel any pending reconnect tasks for this party
        cancelReconnectTasksForParty(pa);
        pa.members.clear();
        Internal.parties.remove(pa);
    }

    @Override
    public boolean isMember(Player owner, Player check) {
        for (PartyData p : parties) {
            if (p.owner == owner) {
                if (p.members.contains(check)) return true;
            }
        }
        return false;
    }

    @Override
    public void removePlayer(Player owner, Player target) {
        PartyData p = getPartyData(owner);
        if (p != null) {
            if (p.members.contains(target)) {
                for (Player mem : p.members) {
                    mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_REMOVE_SUCCESS).replace("{player}", target.getName()));
                }
                p.members.remove(target);
                p.moderators.remove(target);
                chatModes.remove(target.getUniqueId());
                /* Party persists with 1 member (Hypixel style) */
            }
        }
    }

    @Override
    public Player getOwner(Player member) {
        for (Internal.PartyData party : Internal.getParties()) {
            if (party.members.contains(member)) {
                return party.owner;
            }
        }
        return null;
    }

    @Override
    public void promote(@NotNull Player owner, @NotNull Player target) {
        PartyData p = getPartyData(owner);
        if (p != null) {
            p.owner = target;
        }
    }

    @Override
    public boolean isInternal() {
        return true;
    }

    // --- Chat mode management ---

    public static ChatMode getChatMode(Player p) {
        return chatModes.getOrDefault(p.getUniqueId(), ChatMode.ALL);
    }

    public static void setChatMode(Player p, ChatMode mode) {
        if (mode == ChatMode.ALL) {
            chatModes.remove(p.getUniqueId());
        } else {
            chatModes.put(p.getUniqueId(), mode);
        }
    }

    public static void cleanupPlayer(UUID uuid) {
        chatModes.remove(uuid);
    }

    // --- Disconnect grace period management ---

    /**
     * Handle a player quitting the server. Implements 5-minute grace period
     * instead of immediate party removal.
     */
    public static void handlePlayerQuit(Player p) {
        if (!getParty().hasParty(p)) return;

        UUID uuid = p.getUniqueId();
        String playerName = p.getName();
        Player owner = getParty().getOwner(p);
        if (owner == null) return;

        // Find the PartyData
        PartyData party = null;
        for (PartyData pd : parties) {
            if (pd.members.contains(p)) {
                party = pd;
                break;
            }
        }
        if (party == null) return;

        boolean isLeader = (party.owner == p);

        // If leader disconnects: auto-promote (prefer moderator) 
        if (isLeader) {
            Player newOwner = null;
            // Prefer a moderator
            for (Player mod : party.moderators) {
                if (mod != p && party.members.contains(mod)) {
                    newOwner = mod;
                    break;
                }
            }
            if (newOwner == null) {
                for (Player mem : party.members) {
                    if (mem != p) {
                        newOwner = mem;
                        break;
                    }
                }
            }
            if (newOwner == null) {
                // Only the owner — disband, no grace
                getParty().disband(p);
                chatModes.remove(uuid);
                return;
            }
            // Promote new owner
            party.owner = newOwner;
            party.moderators.remove(newOwner);
            for (Player mem : party.members) {
                if (mem != p) {
                    mem.sendMessage(getMsg(mem, Messages.COMMAND_PARTY_PROMOTE_NEW_OWNER).replace("{player}", newOwner.getName()));
                }
            }
        }

        // Remove the Player object from members (prevents stale reference)
        party.members.remove(p);
        chatModes.remove(uuid);

        // Store disconnect info for grace period (party persists with 1 member)
        final PartyData partyRef = party;
        disconnectedPartyMap.put(uuid, partyRef);
        disconnectedNames.put(uuid, playerName);

        // Notify party members
        for (Player mem : partyRef.members) {
            mem.sendMessage("\u00A79Party \u00A78> \u00A7e" + playerName + " has left the server. They have 5 minutes to rejoin.");
        }

        // Schedule removal after 5 minutes
        BukkitTask task = Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
            reconnectTasks.remove(uuid);
            PartyData pd = disconnectedPartyMap.remove(uuid);
            String name = disconnectedNames.remove(uuid);
            if (pd == null || name == null) return;

            // Party may have been disbanded in the meantime
            if (!parties.contains(pd)) return;

            // Notify remaining members
            for (Player mem : pd.members) {
                mem.sendMessage("\u00A79Party \u00A78> \u00A7c" + name + " was removed from the party (disconnected).");
            }

            /* Party persists with 1 member (Hypixel style) */
        }, RECONNECT_GRACE_TICKS);

        reconnectTasks.put(uuid, task);
    }

    /**
     * Handle a player rejoining the server. If they have a grace period active,
     * restore them to their party.
     * @return true if the player was reconnected to a party
     */
    public static boolean handleReconnect(Player p) {
        UUID uuid = p.getUniqueId();
        PartyData party = disconnectedPartyMap.remove(uuid);
        String name = disconnectedNames.remove(uuid);
        if (party == null) return false;

        // Cancel the scheduled removal task
        BukkitTask task = reconnectTasks.remove(uuid);
        if (task != null) {
            task.cancel();
        }

        // Party may have been disbanded while disconnected
        if (!parties.contains(party)) return false;

        // Re-add the player to the party
        party.members.add(p);

        // Notify all party members
        for (Player mem : party.members) {
            mem.sendMessage("\u00A79Party \u00A78> \u00A7a" + p.getName() + " has rejoined the party.");
        }

        return true;
    }

    /**
     * Check if a UUID belongs to a disconnected party member in grace period.
     */
    public static boolean isDisconnected(UUID uuid) {
        return disconnectedPartyMap.containsKey(uuid);
    }

    /**
     * Cancel all reconnect tasks — called on server shutdown.
     */
    public static void cancelAllReconnectTasks() {
        for (BukkitTask task : reconnectTasks.values()) {
            task.cancel();
        }
        reconnectTasks.clear();
        disconnectedPartyMap.clear();
        disconnectedNames.clear();
    }

    /**
     * Cancel reconnect tasks for members of a specific party (used when disbanding).
     */
    private static void cancelReconnectTasksForParty(PartyData party) {
        Iterator<Map.Entry<UUID, PartyData>> it = disconnectedPartyMap.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<UUID, PartyData> entry = it.next();
            if (entry.getValue() == party) {
                UUID uuid = entry.getKey();
                BukkitTask task = reconnectTasks.remove(uuid);
                if (task != null) task.cancel();
                disconnectedNames.remove(uuid);
                it.remove();
            }
        }
    }

    /**
     * Send a party chat message from sender to all party members.
     * Handles mention highlighting and ping sound.
     */
    public static void sendPartyChatMessage(Player sender, String rawMessage) {
        if (!getParty().hasParty(sender)) return;
        Player owner = getParty().getOwner(sender);
        if (owner == null) return;
        List<Player> members = getParty().getMembers(owner);
        if (members == null) return;

        // Mute check: if party is muted, only owner, mods, and staff can chat
        PartyData pd = getPartyDataByPlayer(sender);
        if (pd != null && pd.isMuted()) {
            if (pd.owner != sender && !pd.moderators.contains(sender)
                    && !sender.hasPermission("bw.party.mute.bypass")) {
                sender.sendMessage("\u00A79Party \u00A78> \u00A7cThe party is currently muted.");
                return;
            }
        }

        String prefix = "\u00A79Party \u00A78> \u00A7a" + sender.getName() + "\u00A7f: ";
        Sound pingSound;
        try {
            pingSound = Sound.valueOf(BedWars.getForCurrentVersion("ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP"));
        } catch (IllegalArgumentException e) {
            pingSound = null;
        }

        for (Player member : members) {
            String msg = rawMessage;
            boolean mentioned = false;
            // Check if this member's name is mentioned in the message
            if (!member.equals(sender)) {
                String name = member.getName();
                int idx = msg.toLowerCase().indexOf(name.toLowerCase());
                if (idx >= 0) {
                    mentioned = true;
                    msg = msg.substring(0, idx) + "\u00A7e" + msg.substring(idx, idx + name.length()) + "\u00A7f" + msg.substring(idx + name.length());
                }
            }
            member.sendMessage(prefix + msg);
            if (mentioned && pingSound != null) {
                member.playSound(member.getLocation(), pingSound, 1.0f, 1.5f);
            }
        }
    }

    @Nullable
    private PartyData getPartyData(Player owner) {
        for (PartyData p : getParties()) {
            if (p.getOwner() == owner) return p;
        }
        return null;
    }

    @NotNull
    @Contract(pure = true)
    public static List<PartyData> getParties() {
        return Collections.unmodifiableList(parties);
    }

    /**
     * Check if a player is a moderator in their party.
     */
    public static boolean isModerator(Player p) {
        for (PartyData pd : parties) {
            if (pd.members.contains(p)) {
                return pd.moderators.contains(p);
            }
        }
        return false;
    }

    /**
     * Get the PartyData for any member (not just owner).
     */
    public static PartyData getPartyDataByPlayer(Player p) {
        for (PartyData pd : parties) {
            if (pd.members.contains(p)) {
                return pd;
            }
        }
        return null;
    }

    /**
     * Get disconnected party members for a party.
     */
    public static Map<UUID, String> getDisconnectedMembers(PartyData party) {
        Map<UUID, String> result = new LinkedHashMap<>();
        for (Map.Entry<UUID, PartyData> entry : disconnectedPartyMap.entrySet()) {
            if (entry.getValue() == party) {
                String name = disconnectedNames.get(entry.getKey());
                if (name != null) result.put(entry.getKey(), name);
            }
        }
        return result;
    }

    /**
     * Remove all disconnected (grace-period) members from a party.
     * @return number of members removed
     */
    public static int kickOfflineMembers(PartyData party) {
        int count = 0;
        Iterator<Map.Entry<UUID, PartyData>> it = disconnectedPartyMap.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<UUID, PartyData> entry = it.next();
            if (entry.getValue() == party) {
                UUID uuid = entry.getKey();
                BukkitTask task = reconnectTasks.remove(uuid);
                if (task != null) task.cancel();
                disconnectedNames.remove(uuid);
                it.remove();
                count++;
            }
        }
        return count;
    }

    public static class PartyData {

        private List<Player> members = new ArrayList<>();
        private Set<Player> moderators = new HashSet<>();
        private Player owner;
        private boolean allInvite = false;
        private boolean privateGame = false;
        private boolean muted = false;
        private boolean openParty = false;
        private int maxSize = 0;

        public PartyData(Player p) {
            owner = p;
            Internal.parties.add(this);
        }

        public Player getOwner() {
            return owner;
        }

        void addMember(Player p) {
            members.add(p);
        }

        public Set<Player> getModerators() {
            return moderators;
        }

        public boolean isAllInvite() {
            return allInvite;
        }

        public void setAllInvite(boolean allInvite) {
            this.allInvite = allInvite;
        }

        public boolean isPrivateGame() {
            return privateGame;
        }

        public void setPrivateGame(boolean privateGame) {
            this.privateGame = privateGame;
        }

        public boolean isMuted() {
            return muted;
        }

        public void setMuted(boolean muted) {
            this.muted = muted;
        }

        public boolean isOpenParty() {
            return openParty;
        }

        public void setOpenParty(boolean openParty) {
            this.openParty = openParty;
        }

        public int getMaxSize() {
            return maxSize;
        }

        public void setMaxSize(int maxSize) {
            this.maxSize = maxSize;
        }
    }
}
