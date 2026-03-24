package com.andrei1058.bedwars.listeners;

import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.arena.Arena;
import com.andrei1058.bedwars.configuration.Sounds;
import org.bukkit.entity.EnderPearl;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.ProjectileHitEvent;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

public class EnderPearlLanded implements Listener {

    private static final Set<UUID> pearlImmunity = new HashSet<>();

    @EventHandler
    public void onPearlHit(ProjectileHitEvent e){

        if (!(e.getEntity() instanceof EnderPearl)) return;
        if (!(e.getEntity().getShooter() instanceof Player)) return;

        Player player = (Player) e.getEntity().getShooter();
        IArena iArena = Arena.getArenaByPlayer(player);

        if (!Arena.isInArena(player) || iArena.isSpectator(player)) return;

        Sounds.playSound("ender-pearl-landed", iArena.getPlayers());

        // Cancel fall damage after ender pearl teleport (Hypixel behavior)
        pearlImmunity.add(player.getUniqueId());
        org.bukkit.Bukkit.getScheduler().runTaskLater(com.andrei1058.bedwars.BedWars.plugin, () -> pearlImmunity.remove(player.getUniqueId()), 20L);
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onFallDamageAfterPearl(EntityDamageEvent e) {
        if (!(e.getEntity() instanceof Player)) return;
        if (e.getCause() != EntityDamageEvent.DamageCause.FALL) return;

        Player player = (Player) e.getEntity();
        if (pearlImmunity.remove(player.getUniqueId())) {
            e.setCancelled(true);
        }
    }
}
