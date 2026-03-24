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

package com.andrei1058.bedwars.configuration;


import com.andrei1058.bedwars.BedWars;
import com.andrei1058.bedwars.api.arena.NextEvent;
import com.andrei1058.bedwars.api.configuration.ConfigManager;
import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;

import java.util.List;

import static com.andrei1058.bedwars.BedWars.plugin;
import static com.andrei1058.bedwars.api.configuration.ConfigPath.*;

public class Sounds {

    private static final ConfigManager sounds = new ConfigManager(plugin, "sounds", plugin.getDataFolder().getPath());

    /**
     * Load sounds configuration
     */
    private Sounds() {
    }

    public static void init() {
        YamlConfiguration yml = sounds.getYml();

        // 🏆 Game Events
        addDefSound("game-end", BedWars.getForCurrentVersion("LEVEL_UP", "ENTITY_PLAYER_LEVELUP", "ENTITY_PLAYER_LEVELUP"));
        addDefSound("defeat", BedWars.getForCurrentVersion("WITHER_SPAWN", "ENTITY_WITHER_SPAWN", "ENTITY_WITHER_SPAWN"));
        addDefSound("rejoin-denied", BedWars.getForCurrentVersion("VILLAGER_NO", "ENTITY_VILLAGER_NO", "ENTITY_VILLAGER_NO"));
        addDefSound("rejoin-allowed", BedWars.getForCurrentVersion("SLIME_WALK", "ENTITY_SLIME_JUMP", "ENTITY_SLIME_JUMP"));
        addDefSound("spectate-denied", BedWars.getForCurrentVersion("VILLAGER_NO", "ENTITY_VILLAGER_NO", "ENTITY_VILLAGER_NO"));
        addDefSound("spectate-allowed", BedWars.getForCurrentVersion("SLIME_WALK", "ENTITY_SLIME_JUMP", "ENTITY_SLIME_JUMP"));
        addDefSound("join-denied", BedWars.getForCurrentVersion("VILLAGER_NO", "ENTITY_VILLAGER_NO", "ENTITY_VILLAGER_NO"));
        addDefSound("join-allowed", BedWars.getForCurrentVersion("SLIME_WALK", "ENTITY_SLIME_JUMP", "ENTITY_SLIME_JUMP"));
        addDefSound("spectator-gui-click", BedWars.getForCurrentVersion("SLIME_WALK", "ENTITY_SLIME_JUMP", "ENTITY_SLIME_JUMP"));

        // Countdown: hat/sticks for regular ticks, ascending pling for 5-4-3-2-1
        addDefSound(SOUNDS_COUNTDOWN_TICK, BedWars.getForCurrentVersion("NOTE_STICKS", "BLOCK_NOTE_STICKS", "BLOCK_NOTE_BLOCK_HAT"));
        forceSetSoundIfMissing(SOUNDS_COUNTDOWN_TICK_X + "5", BedWars.getForCurrentVersion("ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP"), 1, 0.7f);
        forceSetSoundIfMissing(SOUNDS_COUNTDOWN_TICK_X + "4", BedWars.getForCurrentVersion("ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP"), 1, 0.8f);
        forceSetSoundIfMissing(SOUNDS_COUNTDOWN_TICK_X + "3", BedWars.getForCurrentVersion("ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP"), 1, 1.0f);
        forceSetSoundIfMissing(SOUNDS_COUNTDOWN_TICK_X + "2", BedWars.getForCurrentVersion("ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP"), 1, 1.2f);
        forceSetSoundIfMissing(SOUNDS_COUNTDOWN_TICK_X + "1", BedWars.getForCurrentVersion("ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP"), 1, 2.0f);
        addDefSoundWithParams(SOUND_GAME_START, "NONE", 1, 1);

        // ⚔️ Combat
        addDefSound(SOUNDS_KILL, BedWars.getForCurrentVersion("ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP", "ENTITY_EXPERIENCE_ORB_PICKUP"));
        addDefSoundWithParams("final-kill", BedWars.getForCurrentVersion("AMBIENCE_THUNDER", "ENTITY_LIGHTNING_THUNDER", "ENTITY_LIGHTNING_BOLT_THUNDER"), 1, 1);

        // 🛏️ Bed Events
        addDefSound(SOUNDS_BED_DESTROY, BedWars.getForCurrentVersion("WITHER_DEATH", "ENTITY_WITHER_DEATH", "ENTITY_WITHER_DEATH"));
        addDefSound(SOUNDS_BED_DESTROY_OWN, BedWars.getForCurrentVersion("WITHER_DEATH", "ENTITY_WITHER_DEATH", "ENTITY_WITHER_DEATH"));
        addDefSound("bed-destroy-nearby", BedWars.getForCurrentVersion("ENDERDRAGON_GROWL", "ENTITY_ENDERDRAGON_GROWL", "ENTITY_ENDER_DRAGON_GROWL"));

        // 🛒 Shop / GUI
        addDefSound(SOUNDS_INSUFF_MONEY, BedWars.getForCurrentVersion("ENDERMAN_TELEPORT", "ENTITY_ENDERMEN_TELEPORT", "ENTITY_ENDERMAN_TELEPORT"));
        addDefSound(SOUNDS_BOUGHT, BedWars.getForCurrentVersion("NOTE_PLING", "BLOCK_NOTE_PLING", "BLOCK_NOTE_BLOCK_PLING"));
        addDefSound("shop-open", BedWars.getForCurrentVersion("CLICK", "UI_BUTTON_CLICK", "UI_BUTTON_CLICK"));

        addDefSound(NextEvent.BEDS_DESTROY.getSoundPath(), BedWars.getForCurrentVersion("ENDERDRAGON_GROWL", "ENTITY_ENDERDRAGON_GROWL", "ENTITY_ENDER_DRAGON_GROWL"));
        addDefSound(NextEvent.DIAMOND_GENERATOR_TIER_II.getSoundPath(), BedWars.getForCurrentVersion("LEVEL_UP", "ENTITY_PLAYER_LEVELUP", "ENTITY_PLAYER_LEVELUP"));
        addDefSound(NextEvent.DIAMOND_GENERATOR_TIER_III.getSoundPath(), BedWars.getForCurrentVersion("LEVEL_UP", "ENTITY_PLAYER_LEVELUP", "ENTITY_PLAYER_LEVELUP"));
        addDefSound(NextEvent.EMERALD_GENERATOR_TIER_II.getSoundPath(), BedWars.getForCurrentVersion("GHAST_MOAN", "ENTITY_GHAST_WARN", "ENTITY_GHAST_WARN"));
        addDefSound(NextEvent.EMERALD_GENERATOR_TIER_III.getSoundPath(), BedWars.getForCurrentVersion("GHAST_MOAN", "ENTITY_GHAST_WARN", "ENTITY_GHAST_WARN"));
        addDefSound(NextEvent.ENDER_DRAGON.getSoundPath(), BedWars.getForCurrentVersion("ENDERDRAGON_WINGS", "ENTITY_ENDERDRAGON_FLAP", "ENTITY_ENDER_DRAGON_FLAP"));

        addDefSoundWithParams("player-re-spawn", BedWars.getForCurrentVersion("SLIME_WALK", "ENTITY_SLIME_SQUISH", "ENTITY_SLIME_SQUISH"), 1, 1);
        addDefSound("arena-selector-open", BedWars.getForCurrentVersion("NOTE_PLING", "BLOCK_NOTE_PLING", "BLOCK_NOTE_BLOCK_PLING"));
        addDefSound("stats-gui-open", BedWars.getForCurrentVersion("NOTE_PLING", "BLOCK_NOTE_PLING", "BLOCK_NOTE_BLOCK_PLING"));
        addDefSoundWithParams("trap-sound", BedWars.getForCurrentVersion("NOTE_PLING", "BLOCK_NOTE_PLING", "BLOCK_NOTE_BLOCK_PLING"), 1, 2.0f);
        addDefSoundWithParams("trap-alarm", BedWars.getForCurrentVersion("NOTE_BASS", "BLOCK_NOTE_BASS", "BLOCK_NOTE_BLOCK_BELL"), 1, 1);
        addDefSound("shop-auto-equip", BedWars.getForCurrentVersion("HORSE_ARMOR", "ITEM_ARMOR_EQUIP_GENERIC", "ITEM_ARMOR_EQUIP_GENERIC"));
        addDefSound("egg-bridge-block", BedWars.getForCurrentVersion("CHICKEN_EGG_POP", "ENTITY_CHICKEN_EGG", "ENTITY_CHICKEN_EGG"));
        addDefSound("ender-pearl-landed", BedWars.getForCurrentVersion("ENDERMAN_TELEPORT", "ENTITY_ENDERMEN_TELEPORT", "ENTITY_ENDERMAN_TELEPORT"));
        addDefSound("pop-up-tower-build", BedWars.getForCurrentVersion("CHICKEN_EGG_POP", "ENTITY_CHICKEN_EGG","ENTITY_CHICKEN_EGG"));

        // 🏹 Items
        addDefSound("fireball-throw", BedWars.getForCurrentVersion("GHAST_FIREBALL", "ENTITY_BLAZE_SHOOT", "ENTITY_BLAZE_SHOOT"));
        addDefSound("generator-pickup", BedWars.getForCurrentVersion("ITEM_PICKUP", "ENTITY_ITEM_PICKUP", "ENTITY_ITEM_PICKUP"));
        yml.options().copyDefaults(true);

        // remove old paths and force-fix shop-bought sound for existing configs
        yml.set("bought", null);
        yml.set("insufficient-money", null);
        yml.set("player-kill", null);
        yml.set("countdown", null);

        // Force-set shop-bought sound if missing or invalid (fixes existing configs)
        String boughtSound = BedWars.getForCurrentVersion("NOTE_PLING", "BLOCK_NOTE_PLING", "BLOCK_NOTE_BLOCK_PLING");
        try {
            String current = yml.getString(SOUNDS_BOUGHT + ".sound");
            if (current == null || current.isEmpty()) {
                yml.set(SOUNDS_BOUGHT + ".sound", boughtSound);
                yml.set(SOUNDS_BOUGHT + ".volume", 1);
                yml.set(SOUNDS_BOUGHT + ".pitch", 1);
            } else {
                Sound.valueOf(current);
            }
        } catch (IllegalArgumentException ex) {
            yml.set(SOUNDS_BOUGHT + ".sound", boughtSound);
            yml.set(SOUNDS_BOUGHT + ".volume", 1);
            yml.set(SOUNDS_BOUGHT + ".pitch", 1);
        }

        // Force-set insufficient-money sound if missing or invalid
        String insuffSound = BedWars.getForCurrentVersion("ENDERMAN_TELEPORT", "ENTITY_ENDERMEN_TELEPORT", "ENTITY_ENDERMAN_TELEPORT");
        try {
            String current = yml.getString(SOUNDS_INSUFF_MONEY + ".sound");
            if (current == null || current.isEmpty()) {
                yml.set(SOUNDS_INSUFF_MONEY + ".sound", insuffSound);
                yml.set(SOUNDS_INSUFF_MONEY + ".volume", 1);
                yml.set(SOUNDS_INSUFF_MONEY + ".pitch", 1);
            } else {
                Sound.valueOf(current);
            }
        } catch (IllegalArgumentException ex) {
            yml.set(SOUNDS_INSUFF_MONEY + ".sound", insuffSound);
            yml.set(SOUNDS_INSUFF_MONEY + ".volume", 1);
            yml.set(SOUNDS_INSUFF_MONEY + ".pitch", 1);
        }

        sounds.save();
    }

    private static Sound getSound(String path) {
        try {
            return Sound.valueOf(sounds.getString(path + ".sound"));
        } catch (Exception ex) {
            return Sound.valueOf(BedWars.getForCurrentVersion("AMBIENCE_THUNDER", "ENTITY_LIGHTNING_THUNDER", "ITEM_TRIDENT_THUNDER"));
        }
    }

    public static void playSound(String path, List<Player> players) {
        if(path.equalsIgnoreCase("none")) return;
        String soundName = getSounds().getYml().getString(path + ".sound");
        if (soundName == null || soundName.equalsIgnoreCase("none")) return;
        final Sound sound = getSound(path);
        float volume = (float) getSounds().getYml().getDouble(path + ".volume");
        float pitch = (float) getSounds().getYml().getDouble(path + ".pitch");
        if (volume <= 0) volume = 1f;
        if (pitch <= 0) pitch = 1f;
        final float v = volume, p = pitch;
        if (sound != null) {
            players.forEach(pl -> pl.playSound(pl.getLocation(), sound, v, p));
        }
    }

    /**
     * @return true if sound is valid and it was played.
     */
    public static boolean playSound(Sound sound, List<Player> players) {
        if (sound == null) return false;
        players.forEach(p -> p.playSound(p.getLocation(), sound, 1f, 1f));
        return true;
    }

    public static void playSound(String path, Player player) {
        String soundName = getSounds().getYml().getString(path + ".sound");
        if (soundName == null || soundName.equalsIgnoreCase("none")) return;
        final Sound sound = getSound(path);
        float volume = (float) getSounds().getYml().getDouble(path + ".volume");
        float pitch = (float) getSounds().getYml().getDouble(path + ".pitch");
        if (volume <= 0) volume = 1f;
        if (pitch <= 0) pitch = 1f;
        if (sound != null) player.playSound(player.getLocation(), sound, volume, pitch);
    }

    public static ConfigManager getSounds() {
        return sounds;
    }

    private static void addDefSound(String path, String value) {
        // convert old paths
        if (getSounds().getYml().get(path) != null && getSounds().getYml().get(path + ".volume") == null) {
            String temp = getSounds().getYml().getString(path);
            getSounds().getYml().set(path, null);
            getSounds().getYml().set(path + ".sound", temp);
        }
        getSounds().getYml().addDefault(path + ".sound", value);
        getSounds().getYml().addDefault(path + ".volume", 1);
        getSounds().getYml().addDefault(path + ".pitch", 1);
    }

    private static void addDefSoundWithParams(String path, String value, float volume, float pitch) {
        if (getSounds().getYml().get(path) != null && getSounds().getYml().get(path + ".volume") == null) {
            String temp = getSounds().getYml().getString(path);
            getSounds().getYml().set(path, null);
            getSounds().getYml().set(path + ".sound", temp);
        }
        getSounds().getYml().addDefault(path + ".sound", value);
        getSounds().getYml().addDefault(path + ".volume", volume);
        getSounds().getYml().addDefault(path + ".pitch", pitch);
    }

    /**
     * Force-set sound values unconditionally. Always overwrites existing values.
     * Used for countdown sounds to ensure correct pitch progression.
     */
    private static void forceSetSoundIfMissing(String path, String value, float volume, float pitch) {
        // Migrate old flat-string format
        if (getSounds().getYml().get(path) != null && getSounds().getYml().get(path + ".volume") == null) {
            getSounds().getYml().set(path, null);
        }
        // Always force-write the correct sound, volume, and pitch
        getSounds().getYml().set(path + ".sound", value);
        getSounds().getYml().set(path + ".volume", volume);
        getSounds().getYml().set(path + ".pitch", pitch);
    }

    public static  void playsoundArea(String path, Location location, float x, float y){
        final Sound sound = getSound(path);
        if (sound != null) location.getWorld().playSound(location, sound, x, y);
    }
}
