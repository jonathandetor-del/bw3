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

package com.andrei1058.bedwars.listeners.joinhandler;

import com.andrei1058.bedwars.BedWars;
import com.andrei1058.bedwars.api.arena.GameState;
import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.arena.Arena;
import com.andrei1058.bedwars.arena.ReJoin;
import com.andrei1058.bedwars.sidebar.SidebarService;
import com.andrei1058.bedwars.support.paper.TeleportManager;
import com.andrei1058.bedwars.support.party.Internal;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

import static com.andrei1058.bedwars.BedWars.*;

public class JoinListenerMultiArena implements Listener {

    @EventHandler(priority = EventPriority.HIGH)
    public void onJoin(PlayerJoinEvent e) {
        e.setJoinMessage(null);
        final Player p = e.getPlayer();
        p.getInventory().setArmorContents(null);

        JoinHandlerCommon.displayCustomerDetails(p);

        // Show commands if player is op and there is no set arenas
        if (p.isOp()) {
            if (Arena.getArenas().isEmpty()) {
                p.performCommand(mainCmd);
            }
        }

        ReJoin reJoin = ReJoin.getPlayer(p);

        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            // Hide new player to players and spectators, and vice versa
            // Players from lobby will remain visible
            for (Player online : Bukkit.getOnlinePlayers()){
                if (Arena.isInArena(online)) {
                    BedWars.nms.spigotHidePlayer(online, p);
                    BedWars.nms.spigotHidePlayer(p, online);
                } else {
                    BedWars.nms.spigotShowPlayer(online, p);
                    BedWars.nms.spigotShowPlayer(p, online);
                }
            }

            // To prevent invisibility issues handle ReJoin after sending invisibility packets
            if (reJoin != null) {
                if (reJoin.canReJoin()) {
                    reJoin.reJoin(p);
                    return;
                }
                reJoin.destroy(false);
            }

            // Handle party reconnect (grace period)
            if (BedWars.getParty().isInternal()) {
                if (Internal.handleReconnect(p)) {
                    // Player reconnected to their party — check if leader is in an arena
                    Player owner = BedWars.getParty().getOwner(p);
                    if (owner != null && owner != p) {
                        IArena leaderArena = Arena.getArenaByPlayer(owner);
                        if (leaderArena != null) {
                            if (leaderArena.getStatus() == GameState.waiting || leaderArena.getStatus() == GameState.starting) {
                                // Auto-join the waiting/starting arena
                                if (leaderArena.getPlayers().size() < leaderArena.getMaxPlayers()) {
                                    leaderArena.addPlayer(p, true);
                                    p.sendMessage("\u00A79Party \u00A78> \u00A77Auto-joining your party leader's game...");
                                }
                            } else if (leaderArena.getStatus() == GameState.playing) {
                                // Auto-spectate the active game
                                leaderArena.addSpectator(p, false, null);
                                p.sendMessage("\u00A79Party \u00A78> \u00A77Your party leader is in a game. Joining as spectator...");
                            }
                        }
                    }
                }
            }
        }, 14L);

        if (reJoin != null && reJoin.canReJoin()) return;

        // Teleport to lobby location
        Location lobbyLocation = config.getConfigLoc("lobbyLoc");
        if (lobbyLocation != null && lobbyLocation.getWorld() != null) {
            TeleportManager.teleport(p, lobbyLocation);
        }

        // Send items
        Arena.sendLobbyCommandItems(p);

        SidebarService.getInstance().giveSidebar(p, null, true);

        p.setHealthScale(p.getMaxHealth());
        p.setExp(0);
        p.setHealthScale(20);
        p.setFoodLevel(20);
    }
}

