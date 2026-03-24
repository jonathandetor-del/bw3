package com.andrei1058.bedwars.listeners;

import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.api.configuration.ConfigPath;
import com.andrei1058.bedwars.arena.Arena;
import com.andrei1058.bedwars.arena.LastHit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Fireball;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockIgniteEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.ExplosionPrimeEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.projectiles.ProjectileSource;
import org.bukkit.util.Vector;

import java.util.*;

import static com.andrei1058.bedwars.BedWars.config;
import static com.andrei1058.bedwars.BedWars.getAPI;

public class FireballListener implements Listener {

    private final double fireballExplosionSize;
    private final boolean fireballMakeFire;
    private final double fireballHorizontal;
    private final double fireballVertical;
    private final double fireballJumpHorizontal;
    private final double fireballJumpVertical;

    private final double damageSelf;
    private final double damageEnemy;
    private final double damageTeammates;

    public FireballListener() {
        this.fireballExplosionSize = config.getYml().getDouble(ConfigPath.GENERAL_FIREBALL_EXPLOSION_SIZE);
        this.fireballMakeFire = config.getYml().getBoolean(ConfigPath.GENERAL_FIREBALL_MAKE_FIRE);
        this.fireballHorizontal = config.getYml().getDouble(ConfigPath.GENERAL_FIREBALL_KNOCKBACK_HORIZONTAL);
        this.fireballVertical = config.getYml().getDouble(ConfigPath.GENERAL_FIREBALL_KNOCKBACK_VERTICAL);
        this.fireballJumpHorizontal = config.getYml().getDouble(ConfigPath.GENERAL_FIREBALL_JUMP_HORIZONTAL);
        this.fireballJumpVertical = config.getYml().getDouble(ConfigPath.GENERAL_FIREBALL_JUMP_VERTICAL);

        this.damageSelf = config.getYml().getDouble(ConfigPath.GENERAL_FIREBALL_DAMAGE_SELF);
        this.damageEnemy = config.getYml().getDouble(ConfigPath.GENERAL_FIREBALL_DAMAGE_ENEMY);
        this.damageTeammates = config.getYml().getDouble(ConfigPath.GENERAL_FIREBALL_DAMAGE_TEAMMATES);
    }

    @EventHandler
    public void fireballHit(ProjectileHitEvent e) {
        if(!(e.getEntity() instanceof Fireball)) return;
        Location location = e.getEntity().getLocation();

        ProjectileSource projectileSource = e.getEntity().getShooter();
        if(!(projectileSource instanceof Player)) return;
        Player source = (Player) projectileSource;

        IArena arena = Arena.getArenaByPlayer(source);

        Vector vector = location.toVector();

        World world = location.getWorld();

        assert world != null;
        Collection<Entity> nearbyEntities = world
                .getNearbyEntities(location, fireballExplosionSize, fireballExplosionSize, fireballExplosionSize);
        for(Entity entity : nearbyEntities) {
            if(!(entity instanceof Player)) continue;
            Player player = (Player) entity;
            if(!getAPI().getArenaUtil().isPlaying(player)) continue;


            Vector playerVector = player.getLocation().toVector();
            // Direction FROM fireball TO player (pushes player away from explosion)
            Vector direction = playerVector.subtract(vector.clone()).normalize();
            double distance = player.getLocation().distance(location);
            // Distance-based falloff: closer = stronger KB, Hypixel-style curve
            double falloff = Math.max(0.2, 1.0 - (distance / (fireballExplosionSize * 2.5)));

            boolean isSelf = player.equals(source);
            double hKB, vKB;
            if (isSelf) {
                // Self-fireball jump: Hypixel-style 1.7 horizontal, 1.0 vertical for 6-10 block jumps
                hKB = fireballJumpHorizontal * falloff;
                vKB = fireballJumpVertical;
            } else {
                // Enemy knockback: 1.4x multiplier to knock players off islands
                hKB = fireballHorizontal * falloff;
                vKB = fireballVertical * 0.8 * falloff;
            }
            Vector velocity = direction.multiply(hKB);
            velocity.setY(vKB);
            player.setVelocity(velocity);

            LastHit lh = LastHit.getLastHit(player);
            if (lh != null) {
                lh.setDamager(source);
                lh.setTime(System.currentTimeMillis());
            } else {
                new LastHit(player, source, System.currentTimeMillis());
            }

            if(player.equals(source)) {
                if(damageSelf > 0) {
                    player.damage(damageSelf); // damage shooter
                }
            } else if(arena.getTeam(player).equals(arena.getTeam(source))) {
                if(damageTeammates > 0) {
                    player.damage(damageTeammates); // damage teammates
                }
            } else {
                if(damageEnemy > 0) {
                    player.damage(damageEnemy); // damage enemies
                }
            }
        }
    }


    @EventHandler
    public void fireballDirectHit(EntityDamageByEntityEvent e) {
        if(!(e.getDamager() instanceof Fireball)) return;
        if(!(e.getEntity() instanceof Player)) return;

        if(Arena.getArenaByPlayer((Player) e.getEntity()) == null) return;

        e.setCancelled(true);
    }

    @EventHandler
    public void fireballPrime(ExplosionPrimeEvent e) {
        if(!(e.getEntity() instanceof Fireball)) return;
        ProjectileSource shooter = ((Fireball)e.getEntity()).getShooter();
        if(!(shooter instanceof Player)) return;
        Player player = (Player) shooter;

        if(Arena.getArenaByPlayer(player) == null) return;

        e.setFire(fireballMakeFire);
    }

    @EventHandler
    public void onBlockIgnite(BlockIgniteEvent e) {
        if (e.getCause() == BlockIgniteEvent.IgniteCause.FIREBALL) {
            if (Arena.getArenaByIdentifier(e.getBlock().getWorld().getName()) != null) {
                e.setCancelled(true);
            }
        }
    }

}
