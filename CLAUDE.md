# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Shapeshift: Neon Survivors** — a browser roguelite/survivors game. Three files, zero dependencies, no build step, no framework, no package manager:

- `index.html` — the canvas plus the DOM HUD (every element the game writes to has an `id`)
- `styles.css` — one minified base block, then appended readable override blocks
- `game.js` — the entire game (~2800 lines, flat script, no modules or classes)

## Running

Open `index.html` directly (`open index.html`) — it works over `file://` since there are no ES modules or fetches. For a server:

```sh
python3 -m http.server 8000    # then http://localhost:8000
```

There is no build, no lint, and no test suite. Verification is by playing: pick a difficulty, clear rooms, reach room 10 for the first boss.

**Reaching later game states quickly** — everything (`state`, `player`, `enemies`, `types`, …) is a top-level `let`/`const` in global scope, so the devtools console is the debugger:

```js
localStorage.setItem('shapeshift_points', 5000)          // afford every pilot
localStorage.setItem('shapeshift_hard_beaten','true')    // unlock IMPOSSIBLE
state.room = 9; state.left = 0; enemies.length = 0       // next portal leads to a boss room
state.xp = state.need                                    // force a level-up draw next frame
state.weapons.mine = newWeapon('mine')                   // grant a weapon outright
```

## Architecture

### Two coordinate systems

The **room** is `RW×RH` (3000×1875); the **viewport** is `W×H` (1440×900). `camera()` clamps the camera to the player, stopping at the room edges. In `draw()`, the context is translated by `-camX,-camY` — everything between `ctx.save()` and `ctx.restore()` is in *room* space. Anything drawn after `ctx.restore()` (`drawOffscreenMarkers`, vignette, hurt flash, low-health border, room banner, victory sequence) is in *screen* space. Confusing the two is the most common source of "it draws in the wrong place".

`onScreen(e)` gates weapon targeting: nothing off-camera can be shot, and off-screen threats get an `edgeMarker` pinned to the viewport border instead.

### Frame loop

`frame(now)` → `update(dt, real)` → `ultimateEffects(dt)` → `draw()`, driven by `requestAnimationFrame`.

`dt` is scaled — `.12×` during hit-stop, `.4×` while dying — while `real` stays wall-clock. **Use `dt` for gameplay, `real` for anything that must decay at a fixed rate regardless of slow-motion** (screen shake, the death fade, the low-health heartbeat).

`state.paused` skips `update` entirely but keeps drawing, so every modal (level-up, relic, pause, game over, home, roster) just sets `paused` and calls `show(markup)`.

### State

One global `state` object holds the whole run, rebuilt from scratch by `reset(difficulty)`. Entities live in sibling global arrays declared together on one line (`enemies`, `arrows`, `enemyBullets`, `stars`, `particles`, `blasts`, `strikes`, `rings`, `pulses`, `beams`, `mines`, …), each with a paired `updateX(dt)` and `drawX()`. Adding an entity kind means adding the array to that declaration, clearing it in `reset()`, and wiring both functions into the `update`/`draw` call chains.

### Enemy movement is steering, not seeking

`moveEnemy` builds a force vector rather than walking straight at the player: a unit vector toward the player, a tangent for strafing, plus separation from every other enemy (hard push under `e.r+o.r+12`, a softer sideways slide under 210px) so crowds fan out instead of stacking into one line. Shapes carrying a `hold` value in `types` (`bowtie`, `seeker`, `raker`) are **gunboats**: they keep that standoff distance and orbit at it instead of closing. The force is normalised, then applied at the shape's speed — so tuning `hold` changes engagement range, not pace.

Bosses bypass all of this and run their own state machine from `bossBehaviour[e.bossId]`, keyed on `e.mode` and `e.timer`.

### Room cycle

`beginRoom()` sizes a spawn budget from `state.room` and difficulty `mass`, drip-feeds it via `state.spawnIn`, and shows the room banner. Bosses spawn on `room % 10 === 0` (`spawnBoss` picks from `bossOrder`, cycling with a bulk bonus per full pass).

When `state.left === 0 && enemies.length === 0`, `finishRoom()` clears all hostile projectiles (you cannot die to a stray shot after winning), vacuums the remaining XP remnants, offers a relic on boss rooms, then `openPortal()`. Touching the portal starts the multi-stage `state.victorySequence` (`swirl` → `suck` → `flash`/`warp` → `arrive`), which drives camera zoom and rotation and ends by calling `nextRoom()`.

### UI

All menus are HTML strings passed to `show()`, which sets `#overlay`'s `innerHTML` and re-binds handlers by `id` / `data-*` attribute. The in-game HUD is DOM, not canvas: `hud()` runs at the end of every `update` and writes into the `ui` element map. The "how to play" screen (`demos`) is the exception — animated canvases rendered per card.

### Persistence

`localStorage` keys, all prefixed `shapeshift_`: `_best_room`, `_points`, `_unlocked`, `_character`, `_hard_beaten`, `_sound`, `_run`.

`storeRun()` / `resumeRun()` save the run's *meaning*, not its entities — room number, level, weapons, globals, relics, player stats — and the room repopulates via `beginRoom()` on resume. **Any new `state` field that must survive a park-and-resume has to be added to both functions.** The blob is versioned (`v:1`); bump it if the shape changes incompatibly. Death calls `clearRun()` — runs are only resumable by parking from the pause menu.

### Audio

Fully synthesised through WebAudio (`tone`, `noiseHit`) — no asset files. The context is created lazily on the first pointer gesture to satisfy autoplay policy. `SFX_GAP` throttles each sound name so rapid-fire weapons cannot turn into a buzz; new sounds need an entry there or they will machine-gun.

## Balance tables

Tuning lives in data tables near the top of `game.js` rather than in code — prefer editing these over touching logic:

| Table | Controls |
|---|---|
| `types` | per-shape hp / speed / radius / colour / xp / sides, plus `hold` for standoff gunboats (hp and speed are multipliers on the 100hp, 288px/s baseline) |
| `spawnTable` | which shapes appear from which room, base weight, and `growth` (negative = fades out as rooms climb) |
| `bossOrder` | boss roster order, `hpMult`, contact damage, blurb |
| `difficulties` | hp / speed / dmg / heavy / credits / mass / mix multipliers |
| `characters` | pilot roster: cost, hp & speed multipliers, exclusive `weapon`, perks, hull silhouette |
| `weaponData`, `weaponUpgrades`, `ultimateData` | weapon base stats, the five upgrades each, and the ultimate |
| `CONTACT_CAP`, `BOSS_SLAM`, `BOSS_CONTACT_CAP`, `HEAVY_SHAPES` | contact-damage ceilings — no single hit may exceed a share of max hull |
| `creditRate`, `roomCreditBonus`, `CREDIT_MIN_ROOM` | meta-currency payout curve |

## Adding content — the files-to-touch checklists

Because the script is flat, one feature spreads across many functions. Miss a step and it silently does nothing.

**A new weapon** (use `mine` / GRAVITY MINE as the worked example — it touches all eleven):
1. `weaponData` — name, colour, base damage, rate
2. `weaponUpgrades` — exactly five
3. `ultimateData` — name and description
4. `applyWeaponUpgrade` — a branch applying each upgrade id
5. `availableWeaponChoices` — the unlock blurb in the `desc` ternary chain
6. `weapons(dt)` — the firing block
7. `reset()`'s state literal — its cooldown field (`mineIn`), if it fires on an interval rather than continuously like `aegis`/`sword`
8. the entity array in the line-129 declaration and in `reset()`, if it spawns persistent objects
9. `update()`'s call chain — `updateMines(dt)`
10. `draw()`'s call chain (room space) or `drawWeaponEffects` (for auras attached to the player)
11. `ultimateEffects` — a branch if the ultimate ticks actively; otherwise add the id to the passive skip-list

Add to `exclusiveWeapons` if it belongs to one pilot and must never appear in the level-up draw.

**A new enemy shape:** `types` entry (add `hold` to make it a gunboat) → `spawnTable` row with `from` room and `growth` → any attack pattern in `moveEnemy` → `enemyPath` / `drawEnemies` if it is not a plain N-gon.

**A new boss:** `types` entry → `bossOrder` row → a handler in `bossBehaviour` → art in `drawBossArt`.

**A new relic:** `showRelics` card markup → `claimRelic` → `relicInfo` for the pause-menu loadout → the effect (usually `updateRelics`) → `storeRun`/`resumeRun` if it must persist.

**A new HUD readout:** element with an `id` in `index.html` → entry in the `ui` map → write it in `hud()` or `paintAbilities`.

## Conventions

- Dense, minified-looking one-liners for mechanical code (update loops, `applyWeaponUpgrade`); expanded multi-line form for anything with real logic. Match the surrounding density rather than reformatting.
- Comments explain **why**, especially balance intent — "a wounded shape hits softer than a fresh one", "nothing banks until you are past room 5, so bailing out early cannot be farmed". Keep that voice; don't add comments that restate the code.
- Prose in comments is lowercase-leaning and terse; on-screen labels are ALL CAPS.
- Damage, speeds and cooldowns are per-second values multiplied by `dt` — never per-frame constants.
- `styles.css` is appended to, not rewritten: new rules go in a labelled block at the end rather than into the minified first line.
- Weapon display names get renamed for flavour fairly often (`bow` is `VULCAN CANNON`, `laser` is `PHOTON LANCE`). The **keys** — `bow`, `laser`, `bomb`, `sword`, `aegis`, `arc`, `mine` — are the stable identifiers and appear in saved runs; don't rename them.
