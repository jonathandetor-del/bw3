package com.andrei1058.bedwars.listeners;

import com.andrei1058.bedwars.api.arena.GameState;
import com.andrei1058.bedwars.api.arena.IArena;
import com.andrei1058.bedwars.api.configuration.ConfigPath;
import com.andrei1058.bedwars.arena.Arena;
import io.netty.channel.Channel;
import io.netty.channel.ChannelDuplexHandler;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelPromise;
import net.minecraft.server.v1_8_R3.EntityPlayer;
import net.minecraft.server.v1_8_R3.PacketPlayOutEntityVelocity;
import org.bukkit.Bukkit;
import org.bukkit.craftbukkit.v1_8_R3.entity.CraftPlayer;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;

import java.lang.reflect.Field;
import java.util.HashSet;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static com.andrei1058.bedwars.BedWars.config;
import static com.andrei1058.bedwars.BedWars.plugin;

public class HypixelKnockback implements Listener {

    private static final String HANDLER_NAME = "bw_kb_handler";
    private static final Random RANDOM = new Random();

    private static final ConcurrentHashMap<Integer, double[]> pendingKB = new ConcurrentHashMap<>();

    private static final ConcurrentHashMap<Integer, Long> lastSprintTick = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<Integer, Boolean> wasSprinting = new ConcurrentHashMap<>();

    private static final Set<UUID> debugPlayers = new HashSet<>();
    private static final ConcurrentHashMap<String, Integer> hitCountPerTick = new ConcurrentHashMap<>();



    public static Set<UUID> getDebugPlayers() { return debugPlayers; }

    private static Field PACKET_ID, PACKET_MX, PACKET_MY, PACKET_MZ;

    static {
        try {
            PACKET_ID = PacketPlayOutEntityVelocity.class.getDeclaredField("a");
            PACKET_MX = PacketPlayOutEntityVelocity.class.getDeclaredField("b");
            PACKET_MY = PacketPlayOutEntityVelocity.class.getDeclaredField("c");
            PACKET_MZ = PacketPlayOutEntityVelocity.class.getDeclaredField("d");
            PACKET_ID.setAccessible(true);
            PACKET_MX.setAccessible(true);
            PACKET_MY.setAccessible(true);
            PACKET_MZ.setAccessible(true);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private final double horizontal;
    private final double vertical;
    private final double verticalMax;
    private final double friction;
    private final double extraHorizontal;
    private final double extraVertical;
    private final double airHorizontal;
    private final double airVertical;
    private final double horizontalRandom;
    private final double verticalRandom;
    private final int noDamageTicks;
    private final double sprintThreshold;
    private final boolean pingCompEnabled;
    private final double pingCompFactor;
    private final int pingCompMax;
    private final double pingTickReductionPerMs;
    private final double attackerSlowdown;
    private final boolean sprintReset;
    private final double maxHorizontalVelocity;

    public HypixelKnockback() {
        this.horizontal = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_HORIZONTAL);
        this.vertical = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_VERTICAL);
        this.verticalMax = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_MAX_VERTICAL);
        this.friction = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_FRICTION);
        this.extraHorizontal = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_EXTRA_HORIZONTAL);
        this.extraVertical = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_EXTRA_VERTICAL);
        this.airHorizontal = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_AIR_HORIZONTAL);
        this.airVertical = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_AIR_VERTICAL);
        this.horizontalRandom = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_HORIZONTAL_RANDOM);
        this.verticalRandom = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_VERTICAL_RANDOM);
        this.noDamageTicks = config.getYml().getInt(ConfigPath.GENERAL_MELEE_KB_NO_DAMAGE_TICKS);
        this.sprintThreshold = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_SPRINT_THRESHOLD);
        this.pingCompEnabled = config.getYml().getBoolean(ConfigPath.GENERAL_MELEE_KB_PING_COMP_ENABLED);
        this.pingCompFactor = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_PING_COMP_FACTOR);
        this.pingCompMax = config.getYml().getInt(ConfigPath.GENERAL_MELEE_KB_PING_COMP_MAX);
        this.pingTickReductionPerMs = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_PING_COMP_TICK_REDUCTION_PER_MS);
        this.attackerSlowdown = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_ATTACKER_SLOWDOWN);
        this.sprintReset = config.getYml().getBoolean(ConfigPath.GENERAL_MELEE_KB_SPRINT_RESET);
        this.maxHorizontalVelocity = config.getYml().getDouble(ConfigPath.GENERAL_MELEE_KB_MAX_HORIZONTAL_VELOCITY);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onMeleeDamage(EntityDamageByEntityEvent e) {
        if (!(e.getEntity() instanceof Player)) return;
        if (e.getCause() != EntityDamageEvent.DamageCause.ENTITY_ATTACK) return;

        Player victim = (Player) e.getEntity();
        IArena arena = Arena.getArenaByPlayer(victim);
        if (arena == null) return;
        if (arena.getStatus() != GameState.playing) return;

        if (!(e.getDamager() instanceof Player)) return;
        Player attacker = (Player) e.getDamager();

        if (victim.getNoDamageTicks() > victim.getMaximumNoDamageTicks() / 2) return;

        victim.setMaximumNoDamageTicks(noDamageTicks);

        boolean isDebug = debugPlayers.contains(attacker.getUniqueId()) || debugPlayers.contains(victim.getUniqueId());
        long debugTick = 0;
        if (isDebug) {
            debugTick = attacker.getWorld().getFullTime();
            String tickKey = attacker.getEntityId() + ":" + debugTick;
            int hitsThisTick = hitCountPerTick.merge(tickKey, 1, Integer::sum);
            final long ft = debugTick;
            hitCountPerTick.entrySet().removeIf(entry -> {
                String[] parts = entry.getKey().split(":");
                return parts.length == 2 && Math.abs(Long.parseLong(parts[1]) - ft) > 100;
            });

            if (debugPlayers.contains(attacker.getUniqueId())) {
                attacker.sendMessage("\u00a77[HIT] \u00a7ftick=\u00a7e" + debugTick
                    + " \u00a7fnd=\u00a7e" + victim.getNoDamageTicks() + "/" + noDamageTicks
                    + " \u00a7fdmg=\u00a7e" + String.format("%.1f", e.getDamage())
                    + " \u00a7fhits/tick=\u00a7e" + hitsThisTick);
            }
        }

        int attackerId = attacker.getEntityId();
        boolean currentSprint = attacker.isSprinting();
        Boolean prevSprint = wasSprinting.get(attackerId);
        long currentTick = attacker.getWorld().getFullTime();

        if (prevSprint != null && !prevSprint && currentSprint) {
            lastSprintTick.put(attackerId, currentTick);
        }
        wasSprinting.put(attackerId, currentSprint);

        EntityPlayer nmsAttacker = ((CraftPlayer) attacker).getHandle();
        double attackerSpeed = Math.sqrt(nmsAttacker.motX * nmsAttacker.motX + nmsAttacker.motZ * nmsAttacker.motZ);
        Long sprintStart = lastSprintTick.get(attackerId);
        boolean isSprinting = currentSprint
                || (sprintStart != null && (currentTick - sprintStart) < 7)
                || attackerSpeed > sprintThreshold;

        ItemStack weapon = attacker.getItemInHand();
        int kbEnchantLevel = (weapon != null) ? weapon.getEnchantmentLevel(Enchantment.KNOCKBACK) : 0;
        int kbLevel = kbEnchantLevel + (isSprinting ? 1 : 0);

        EntityPlayer nmsVictim = ((CraftPlayer) victim).getHandle();
        double existingMotX = nmsVictim.motX;
        double existingMotY = nmsVictim.motY;
        double existingMotZ = nmsVictim.motZ;

        double dx = attacker.getLocation().getX() - victim.getLocation().getX();
        double dz = attacker.getLocation().getZ() - victim.getLocation().getZ();
        double dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.0E-4D) {
            dx = (RANDOM.nextDouble() - RANDOM.nextDouble()) * 0.01D;
            dz = (RANDOM.nextDouble() - RANDOM.nextDouble()) * 0.01D;
            dist = Math.sqrt(dx * dx + dz * dz);
        }

        double dirX = dx / dist;
        double dirZ = dz / dist;
        double dot = existingMotX * dirX + existingMotZ * dirZ;
        if (dot > 0) {
            existingMotX -= dot * dirX;
            existingMotZ -= dot * dirZ;
        }

        double adjustedHorizontal = horizontal;
        if (nmsVictim.hurtTicks == 0) {
            adjustedHorizontal *= 1.05;
        }

        double vx = existingMotX / friction - dirX * adjustedHorizontal;
        double vy = vertical;
        double vz = existingMotZ / friction - dirZ * adjustedHorizontal;

        if (vy > verticalMax) vy = verticalMax;

        if (kbLevel > 0) {
            double yawRad = Math.toRadians(attacker.getLocation().getYaw());
            vx += (-Math.sin(yawRad)) * kbLevel * extraHorizontal;
            vy += extraVertical;
            vz += Math.cos(yawRad) * kbLevel * extraHorizontal;
            if (vy > verticalMax) vy = verticalMax;
        }

        if (!nmsVictim.onGround) {
            vx *= airHorizontal;
            vy *= airVertical;
            vz *= airHorizontal;
        }

        if (horizontalRandom > 0) {
            vx += (RANDOM.nextDouble() - 0.5) * 2.0 * horizontalRandom;
            vz += (RANDOM.nextDouble() - 0.5) * 2.0 * horizontalRandom;
        }
        if (verticalRandom > 0) {
            vy += (RANDOM.nextDouble() - 0.5) * 2.0 * verticalRandom;
        }

        if (maxHorizontalVelocity > 0) {
            double hSpeed = Math.sqrt(vx * vx + vz * vz);
            if (hSpeed > maxHorizontalVelocity) {
                double scale = maxHorizontalVelocity / hSpeed;
                vx *= scale;
                vz *= scale;
            }
        }

        if (isDebug && debugPlayers.contains(attacker.getUniqueId())) {
            double hSpeed = Math.sqrt(vx * vx + vz * vz);
            double distance = attacker.getLocation().distance(victim.getLocation());
            attacker.sendMessage("\u00a77[KB] \u00a7fvx=\u00a7b" + String.format("%.3f", vx)
                + " \u00a7fvy=\u00a7b" + String.format("%.3f", vy)
                + " \u00a7fvz=\u00a7b" + String.format("%.3f", vz)
                + " \u00a7fhSpd=\u00a7b" + String.format("%.3f", hSpeed));
            attacker.sendMessage("\u00a77[STATE] \u00a7fsprint=\u00a7" + (isSprinting ? "a" : "c") + isSprinting
                + " \u00a7fkbLvl=\u00a7e" + kbLevel
                + " \u00a7fonGround=\u00a7" + (nmsVictim.onGround ? "a" : "c") + nmsVictim.onGround
                + " \u00a7fdist=\u00a7e" + String.format("%.2f", distance));
        }

        pendingKB.put(victim.getEntityId(), new double[]{vx, vy, vz, System.currentTimeMillis(), 0.0});

        nmsVictim.motX = vx;
        nmsVictim.motY = vy;
        nmsVictim.motZ = vz;

        final double fvx = vx, fvy = vy, fvz = vz;
        final Player fVictim = victim;
        Bukkit.getScheduler().runTaskLater((Plugin) plugin, () -> {
            if (fVictim.isOnline()) {
                EntityPlayer nmsV = ((CraftPlayer) fVictim).getHandle();
                nmsV.motX = fvx;
                nmsV.motY = fvy;
                nmsV.motZ = fvz;
            }
        }, 0L);

        if (sprintReset && isSprinting) {
            attacker.setSprinting(false);
        }

        if (attackerSlowdown > 0) {
            Bukkit.getScheduler().runTaskLater((Plugin) plugin, () -> {
                if (attacker.isOnline()) {
                    EntityPlayer nmsAtk = ((CraftPlayer) attacker).getHandle();
                    double restoreFactor = 1.0 + (attackerSlowdown * (1.0 / 0.6 - 1.0));
                    nmsAtk.motX *= restoreFactor;
                    nmsAtk.motZ *= restoreFactor;
                }
            }, 0L);
        }
    }

    public static void injectKB(Player player) {
        try {
            EntityPlayer nmsPlayer = ((CraftPlayer) player).getHandle();
            Channel channel = nmsPlayer.playerConnection.networkManager.channel;
            if (channel.pipeline().get(HANDLER_NAME) != null) return;

            final int entityId = player.getEntityId();

            channel.pipeline().addBefore("packet_handler", HANDLER_NAME, new ChannelDuplexHandler() {
                @Override
                public void write(ChannelHandlerContext ctx, Object msg, ChannelPromise promise) throws Exception {
                    if (msg instanceof PacketPlayOutEntityVelocity && PACKET_ID != null) {
                        int packetEntityId = PACKET_ID.getInt(msg);
                        if (packetEntityId == entityId) {
                            double[] kb = pendingKB.get(entityId);
                            if (kb != null && System.currentTimeMillis() - (long) kb[3] < 100) {
                                if (kb[4] == 0.0) {
                                    try {
                                        PACKET_MX.setInt(msg, (int) (kb[0] * 8000.0));
                                        PACKET_MY.setInt(msg, (int) (kb[1] * 8000.0));
                                        PACKET_MZ.setInt(msg, (int) (kb[2] * 8000.0));
                                    } catch (Exception ignored) {
                                    }
                                    kb[4] = 1.0;
                                } else {
                                    return;
                                }
                            }
                        }
                    }
                    super.write(ctx, msg, promise);
                }
            });
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static void uninjectKB(Player player) {
        try {
            EntityPlayer nmsPlayer = ((CraftPlayer) player).getHandle();
            Channel channel = nmsPlayer.playerConnection.networkManager.channel;
            if (channel.pipeline().get(HANDLER_NAME) != null) {
                channel.pipeline().remove(HANDLER_NAME);
            }
        } catch (Exception ignored) {
        }
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent e) {
        injectKB(e.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        int id = e.getPlayer().getEntityId();
        pendingKB.remove(id);
        lastSprintTick.remove(id);
        wasSprinting.remove(id);
        uninjectKB(e.getPlayer());
    }
}
