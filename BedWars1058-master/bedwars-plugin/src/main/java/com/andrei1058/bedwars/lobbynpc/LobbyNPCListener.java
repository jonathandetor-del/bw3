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

package com.andrei1058.bedwars.lobbynpc;

import com.andrei1058.bedwars.BedWars;
import com.andrei1058.bedwars.api.language.Messages;
import com.andrei1058.bedwars.arena.Arena;
import com.andrei1058.bedwars.configuration.Sounds;
import io.netty.channel.Channel;
import io.netty.channel.ChannelDuplexHandler;
import io.netty.channel.ChannelHandlerContext;
import net.minecraft.server.v1_8_R3.NetworkManager;
import net.minecraft.server.v1_8_R3.PacketPlayInUseEntity;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.PlayerChangedWorldEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.inventory.ItemStack;

import java.lang.reflect.Field;

import static com.andrei1058.bedwars.api.language.Language.getMsg;

/**
 * Handles player interaction with lobby NPCs via Netty packet interception.
 * Also handles the map selector GUI clicks.
 */
public class LobbyNPCListener implements Listener {

    private static final String HANDLER_NAME = "bw_npc_handler";

    // Cached reflection fields for PacketPlayInUseEntity
    private static Field useEntityIdField;
    private static Field useEntityActionField;
    // Cached Channel field from NetworkManager
    private static Field channelField;
    private static boolean channelFieldSearched = false;

    static {
        try {
            useEntityIdField = PacketPlayInUseEntity.class.getDeclaredField("a");
            useEntityIdField.setAccessible(true);
        } catch (Exception e) {
            // Will be logged when first NPC interaction fails
        }
        try {
            useEntityActionField = PacketPlayInUseEntity.class.getDeclaredField("action");
            useEntityActionField.setAccessible(true);
        } catch (Exception e) {
            // Will be logged when first NPC interaction fails
        }
    }

    /**
     * On player join: send NPC spawn packets and inject Netty handler.
     */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
            if (player.isOnline()) {
                LobbyNPCManager.sendNPCsToPlayer(player);
                injectPlayer(player);
            }
        }, 10L);
    }

    /**
     * On player quit: remove Netty handler.
     */
    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        uninjectPlayer(event.getPlayer());
    }

    /**
     * Re-send NPC spawn packets when a player changes world (e.g. returns from arena to lobby).
     * The client forgets all entities from previous world.
     */
    @EventHandler
    public void onWorldChange(PlayerChangedWorldEvent event) {
        Player player = event.getPlayer();
        Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
            if (player.isOnline() && !Arena.isInArena(player)) {
                LobbyNPCManager.sendNPCsToPlayer(player);
            }
        }, 5L);
    }

    /**
     * Re-send NPC spawn packets after respawn (only if player is NOT in an active game).
     */
    @EventHandler
    public void onRespawn(PlayerRespawnEvent event) {
        Player player = event.getPlayer();
        Bukkit.getScheduler().runTaskLater(BedWars.plugin, () -> {
            if (player.isOnline() && !Arena.isInArena(player)) {
                LobbyNPCManager.sendNPCsToPlayer(player);
            }
        }, 5L);
    }

    /**
     * Inject a Netty channel handler to intercept PacketPlayInUseEntity for NPC clicks.
     */
    public static void injectPlayer(Player player) {
        try {
            Channel channel = getChannel(player);
            if (channel == null) return;
            if (channel.pipeline().get(HANDLER_NAME) != null) return;

            channel.pipeline().addBefore("packet_handler", HANDLER_NAME, new ChannelDuplexHandler() {
                @Override
                public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
                    if (msg instanceof PacketPlayInUseEntity && useEntityIdField != null) {
                        int entityId = useEntityIdField.getInt(msg);
                        PlayerNPC npc = PlayerNPC.getByEntityId(entityId);

                        if (npc != null) {
                            boolean isAttack = false;
                            if (useEntityActionField != null) {
                                Object action = useEntityActionField.get(msg);
                                isAttack = action != null && action.toString().equals("ATTACK");
                            }

                            final boolean attack = isAttack;
                            Bukkit.getScheduler().runTask(BedWars.plugin, () -> {
                                if (!player.isOnline()) return;
                                if (Arena.getArenaByPlayer(player) != null) return;

                                String group = npc.getGroup();
                                if (group == null) return;

                                if (attack) {
                                    if (!Arena.joinRandomFromGroup(player, group)) {
                                        player.sendMessage(getMsg(player, Messages.COMMAND_JOIN_NO_EMPTY_FOUND));
                                        Sounds.playSound("join-denied", player);
                                    } else {
                                        Sounds.playSound("join-allowed", player);
                                    }
                                } else {
                                    MapSelectorGUI.open(player, group);
                                }
                            });
                            return; // Don't pass fake entity packet to server
                        }
                    }
                    super.channelRead(ctx, msg);
                }
            });
        } catch (Exception e) {
            BedWars.plugin.getLogger().warning("Failed to inject NPC packet handler for " + player.getName());
        }
    }

    /**
     * Remove the Netty channel handler for a player.
     */
    public static void uninjectPlayer(Player player) {
        try {
            Channel channel = getChannel(player);
            if (channel == null) return;
            if (channel.pipeline().get(HANDLER_NAME) != null) {
                channel.pipeline().remove(HANDLER_NAME);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Get the Netty Channel from a player's NetworkManager via reflection.
     */
    private static Channel getChannel(Player player) {
        try {
            NetworkManager nm = ((CraftPlayer) player).getHandle().playerConnection.networkManager;

            if (!channelFieldSearched) {
                channelFieldSearched = true;
                for (Field f : NetworkManager.class.getDeclaredFields()) {
                    if (Channel.class.isAssignableFrom(f.getType())) {
                        f.setAccessible(true);
                        channelField = f;
                        break;
                    }
                }
            }

            return channelField != null ? (Channel) channelField.get(nm) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Handle clicks in the map selector GUI.
     */
    @EventHandler
    public void onMapSelectorClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player)) return;
        Player player = (Player) event.getWhoClicked();

        if (!(player.getOpenInventory().getTopInventory().getHolder()
                instanceof MapSelectorGUI.MapSelectorHolder)) return;

        event.setCancelled(true);

        ItemStack item = event.getCurrentItem();
        if (item == null || item.getType() == Material.AIR) return;
        if (!BedWars.nms.isCustomBedWarsItem(item)) return;

        String data = BedWars.nms.getCustomData(item);
        if (data == null) return;

        if (data.equals("LOBBY_MAP_CLOSE")) {
            player.closeInventory();
            return;
        }

        if (data.equals("LOBBY_MAP_FILLER")) return;

        if (data.equals("LOBBY_MAP_PREV") || data.equals("LOBBY_MAP_NEXT")) {
            MapSelectorGUI.MapSelectorHolder holder =
                    (MapSelectorGUI.MapSelectorHolder) player.getOpenInventory().getTopInventory().getHolder();
            int newPage = holder.getPage() + (data.equals("LOBBY_MAP_NEXT") ? 1 : -1);
            MapSelectorGUI.open(player, holder.getGroup(), newPage);
            return;
        }

        if (!data.startsWith("LOBBY_MAP_SELECT=")) return;

        String arenaName = data.substring("LOBBY_MAP_SELECT=".length());
        MapSelectorGUI.handleClick(player, arenaName);
    }
}
