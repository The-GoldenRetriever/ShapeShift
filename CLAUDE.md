# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Starwing: Neon Sector** — a browser roguelite/survivors game. (It was *Shapeshift: Neon Survivors*; the `shapeshift_` localStorage prefix is deliberately **not** renamed, since changing it would orphan every saved profile.) Three files, zero dependencies, no build step, no framework, no package manager:

- `index.html` — the canvas plus the DOM HUD (every element the game writes to has an `id`)
- `styles.css` — one minified base block, then appended readable override blocks
- `game.js` — the entire game (~3300 lines, flat script, no modules or classes)

## Running

Open `index.html` directly (`open index.html`) — it works over `file://` since there are no ES modules or fetches. For a server:

```sh
python3 -m http.server 8000    # then http://localhost:8000
```

There is no build, no lint, and no test suite. Verification is by playing. Controls: WASD/arrows move, SPACE pauses, SHIFT dashes (only once `dashDrive` is bought), E phase-cloaks (relic), Q shockwaves (PARAGON), M mutes, F fullscreens.

**A fresh profile lands on the skill tree, not the home screen** — the last line of `game.js` is `if(treeHas('w:bow'))showHome();else showTree()`. Until the free `w:bow` node is taken there is nothing a level-up could offer, so the XP bar is hidden entirely.

**Reaching later game states quickly** — everything (`state`, `player`, `enemies`, `types`, `tree`, `skill`, …) is a top-level `let`/`const` in global scope, so the devtools console is the debugger:

```js
skill = 5000; showTree()                                 // afford every tree node this session
points = 5000; showRoster()                              // afford every pilot
localStorage.setItem('shapeshift_hard_beaten','true')    // unlock IMPOSSIBLE without clearing room 50
state.room = 9; state.left = 0; enemies.length = 0       // next portal leads to a boss room
state.xp = state.need                                    // force a level-up draw next frame
state.weapons.mine = newWeapon('mine')                   // grant a weapon outright
enterDev()                                               // every pilot unlocked, profile set aside
```

`enterDev()` (reachable in-game from the home screen behind the password in `showDevPrompt`) is a sandbox: while `devMode` is true, `saveProfile`, `saveTree`, `storeRun`, `clearRun` and `recordRoom` all no-op, and `exitDev()` restores the pre-dev profile from `devBackup`. **Any new persistence call has to check `devMode` too**, or dev play will overwrite a real save.

## Architecture

### Two coordinate systems

The **room** is `RW×RH` (3000×1875); the **viewport** is `W×H` (1440×900). `camera()` clamps the camera to the player, stopping at the room edges. In `draw()`, the context is translated by `-camX,-camY` — everything between `ctx.save()` and `ctx.restore()` is in *room* space. Anything drawn after `ctx.restore()` (`drawOffscreenMarkers`, vignette, hurt flash, low-health border, room banner, victory sequence) is in *screen* space. Confusing the two is the most common source of "it draws in the wrong place".

`onScreen(e)` gates weapon targeting: nothing off-camera can be shot, and off-screen threats get an `edgeMarker` pinned to the viewport border instead.

### Frame loop

`frame(now)` → `update(dt, real)` → `ultimateEffects(dt)` → `draw()`, driven by `requestAnimationFrame`.

`dt` is scaled — `.12×` during hit-stop, `.4×` while dying — while `real` stays wall-clock. **Use `dt` for gameplay, `real` for anything that must decay at a fixed rate regardless of slow-motion** (screen shake, the death fade, the low-health heartbeat).

`state.paused` skips `update` entirely but keeps drawing, so every modal (level-up, relic, pause, game over, home, roster, tree) just sets `paused` and calls `show(markup)`.

### State

One global `state` object holds the whole run, rebuilt from scratch by `reset(difficulty)`. Entities live in sibling global arrays declared together on one line (`enemies`, `arrows`, `enemyBullets`, `stars`, `particles`, `blasts`, `echoShots`, `damageNumbers`, `delayedBlasts`, `strikes`, `rings`, `pulses`, `beams`, `mines`, `wells`), each with a paired `updateX(dt)` and `drawX()`. Adding an entity kind means adding the array to that declaration, clearing it in `reset()`, and wiring both functions into the `update`/`draw` call chains.

### Meta-progression: the skill tree gates the run

This is the system most likely to surprise you: **a weapon, an upgrade or an ultimate cannot appear in a level-up draw unless it was bought in the tree first.** `availableWeaponChoices()` filters every candidate through `treeHas('w:'+id)` / `treeHas('u:'+id+':'+upgradeId)` / `treeHas('ult:'+id)`, and `globalChoices()` through `treeHas('g:'+id)`. So adding a weapon or an upgrade to `weaponData`/`weaponUpgrades` alone makes it *unreachable*, not merely rare.

- `skill` is the tree currency (`shapeshift_skill`), paid out per run by `skillReward(room, difficulty)`; `points` is the separate pilot-purchase currency (`shapeshift_points`) paid by `runReward()`. Both are banked by `bankAndPark` / `gameOver`, tracked against `state.paidSkill` / `state.paidCredits` so a park-and-resume cannot double-pay.
- `TREE_NODES` is *generated* by `buildTree()` from `weaponData`, `weaponUpgrades`, `ultimateData`, `PASSIVES` and `GLOBALS` — you do not hand-write nodes. A weapon's five upgrades and its ultimate appear automatically once the weapon has a `WEAPON_TIER` entry.
- Node costs are `cost` + a `step` per rank already held (`nodeCost`), not a per-rank list. `buildTree` sets `max` (rank count) and derives `step` from `cost`, unless the node declares its own — `dashStrike` does, so its second rank jumps 26 → 70 rather than creeping.
- Node ids are structural: `w:<weapon>`, `u:<weapon>:<upgradeId>`, `ult:<weapon>`, `g:<global>`, and bare ids for passives. `req` lists node ids, so prerequisites are just id strings. `reqMax` is the stricter form — it wants every rank of the named node, and is what gates each passive's second stage (`powerII`, `rateII`, …) behind a fully-taken first.
- `exclusiveWeapons` (`aegis`→WARDEN, `arc`→REVENANT) are never in the draw and their `w:` node costs 0 — owning the pilot satisfies it (`nodeGranted`), and the whole group is hidden from the tree until you own that pilot (`nodeVisible`).
- Tree passives are read once at `reset()` into run scalars — `treeDamage/treeRate/treeSpeed/treeCritChance/treeCritMult` become `state.charDamage`, `state.rateScale`, `state.critChance`, `state.critMult`, `state.hasDash`. **Buying a node mid-run does nothing until the next `reset`.**
- `critHit(dmg)` rolls per *discrete* hit only. Continuous damage — blade edge, shield field, laser burn — deliberately skips it so a crit always reads as one big number.

### Sectors

A **sector** is a whole run's worth of context, and `SECTORS` holds all of it: how steeply hp and damage climb per area (`hpBase`, `hpCurve`, `dmgCurve`), how many shapes spawn (`wave`), how hard its bosses are (`bossHp`, `bossCurve`), what a run in it is worth (`credits`, `skill`, `xp`), and the palette its sky is painted from (`sky`). **No scaling constant should be written inline any more** — `spawn`/`spawnAt` go through `enemyHp()`, and `beginRoom`, `spawnBoss` and the contact-damage lines all read `sector()`.

- Payout multipliers flow through `sectorCredits()` / `sectorSkill()` / `sectorXp()` into `runReward`, `skillReward` and `xpValue` — a deeper sector pays for itself without touching the difficulty table.
- `state.sector` is fixed for a run and saved with it; `chosenSector` is what the menus are pointing at. `sector()` returns the run's if there is one, otherwise the menu's.
- Each sector has its own spawn pool (`SECTOR_SPAWNS`) and its own boss order (`SECTOR_BOSSES`) drawn from the shared `bossOrder`. Sector 2 leads with HOLLOW, which sector 1's area-50 cap keeps out of reach.
- `sectorsOpen` (persisted as `shapeshift_sectors`) gates both the picker and the tree: any node carrying `sector: 2` is invisible via `nodeVisible` until that sector is open. Clearing `FINAL_ROOM` on hard opens the next one, in `runCleared`.
- `skyFor()` caches the star field and deck gradient **per sector** and throws them away when it changes — a new sector palette needs no other wiring.
- Adding a sector: a `SECTORS` entry, a `SECTOR_SPAWNS` pool, a `SECTOR_BOSSES` order, and whatever `sector: <id>` nodes it should open on the tree. Set `soon: true` to put it on the reel as a locked preview.

### Death is deferred to the end of the frame

`deaths()` runs *after* every weapon and projectile update, so a shape reduced to 0 hp is still sitting in `enemies` for the rest of the frame. Anything that **spends** something on a target — a round, a chain link, a thrown mine, an echo shot, the next auto-shot from `nearest()` — must test `liveTarget(e)` (`e.hp > 0`) or it will throw that resource at a corpse. Continuous and area damage (laser, aegis, blasts) does not need the guard; overkill there costs nothing.

### Enemy fire is scaled where it moves

`updateEnemyBullets` applies `shotSpeed()` and `shotLife()` from the difficulty table at movement time, not at spawn time. That is deliberate: enemy bullets are pushed from several places (shape volleys in `moveEnemy`, boss volleys, `bossOrb`), and scaling at the single update site means a new spawn site is covered automatically. `b.vx`/`b.vy` stay unscaled, so homing recalculation keeps working off the base speed.

### Enemy movement is steering, not seeking

`moveEnemy` builds a force vector rather than walking straight at the player: a unit vector toward the player, a tangent for strafing, plus separation from every other enemy (hard push under `e.r+o.r+12`, a softer sideways slide under 210px) so crowds fan out instead of stacking into one line. Shapes carrying a `hold` value in `types` (`bowtie`, `seeker`, `raker`) are **gunboats**: they keep that standoff distance and orbit at it instead of closing. The force is normalised, then applied at the shape's speed — so tuning `hold` changes engagement range, not pace.

Bosses bypass all of this and run their own state machine from `bossBehaviour[e.bossId]`, keyed on `e.mode` and `e.timer`.

### Room cycle

`beginRoom()` sizes a spawn budget from `state.room` and difficulty `mass`, drip-feeds it via `state.spawnIn`, and shows the room banner. Bosses spawn on `room % 10 === 0` (`spawnBoss` picks via `bossForRoom`, cycling with a bulk bonus per full pass). `bossForRoom` special-cases `FINAL_ROOM` (50) to the `MOTHERSHIP`, which is why the rotation only ever reaches its first four entries — `hollow` is still wired up but unreachable while the run caps at 50.

When `state.left === 0 && enemies.length === 0`, `finishRoom()` clears all hostile projectiles (you cannot die to a stray shot after winning), vacuums the remaining XP remnants, offers a relic on boss rooms, then `openPortal()`. `FINAL_ROOM` (50) ends the run: `nextRoom()` hands off to `runCleared()` instead of incrementing, which banks the payout, calls `clearRun()` and shows the SECTOR CLEAR screen (change difficulty / hangar / main menu). Area 50 skips its relic — there is no area left to spend it in. Clearing it on `IMPOSSIBLE_KEY` (hard) or on IMPOSSIBLE itself sets `shapeshift_hard_beaten`; easier settings never unlock it. Touching the portal starts the multi-stage `state.victorySequence` (`swirl` → `suck` → `flash`/`warp` → `arrive`), which drives camera zoom and rotation and ends by calling `nextRoom()`.

### UI

All menus are HTML strings passed to `show()`, which sets `#overlay`'s `innerHTML` and re-binds handlers by `id` / `data-*` attribute. The in-game HUD is DOM, not canvas: `hud()` runs at the end of every `update` and writes into the `ui` element map. The "how to play" screen (`demos`) is the exception — animated canvases rendered per card.

### Persistence

`localStorage` keys, all prefixed `shapeshift_`: `_best_room`, `_points`, `_unlocked`, `_character`, `_hard_beaten`, `_skill`, `_tree`, `_sound`, `_run`, `_version`.

**Two independent version numbers, easy to confuse:**
- `SAVE_VERSION` (currently `'2'`) versions the *profile*. On load, if `shapeshift_version` doesn't match, every key in `SAVE_KEYS` is deleted — a one-time wipe. Bump it only when a change makes old progress meaningless; anything new that must survive a wipe-free upgrade also needs adding to `SAVE_KEYS`.
- The run blob's `v:1` in `storeRun`/`loadRun` versions the *parked run* only.

`storeRun()` / `resumeRun()` save the run's *meaning*, not its entities — room number, level, weapons, globals, relics, player stats, the tree-derived scalars — and the room repopulates via `beginRoom()` on resume. **Any new `state` field that must survive a park-and-resume has to be added to both functions.** Death calls `clearRun()` — runs are only resumable by parking from the pause menu.

### Audio

Fully synthesised through WebAudio (`tone`, `noiseHit`) — no asset files. The context is created lazily on the first pointer gesture to satisfy autoplay policy. `SFX_GAP` throttles each sound name so rapid-fire weapons cannot turn into a buzz; new sounds need an entry there or they will machine-gun.

## Balance tables

Tuning lives in data tables near the top of `game.js` rather than in code — prefer editing these over touching logic:

| Table | Controls |
|---|---|
| `types` | per-shape hp / speed / radius / colour / xp / sides, plus `hold` for standoff gunboats (hp and speed are multipliers on the 100hp, 288px/s baseline) |
| `spawnTable` | which shapes appear from which room, base weight, and `growth` (negative = fades out as rooms climb) |
| `bossOrder`, `MOTHERSHIP` | the rotation for areas 10–40 (`hpMult`, contact damage, blurb), and the fixed area-50 finale that sits off it |
| `difficulties` | hp / speed / dmg / heavy / credits / mass / mix multipliers, plus `shot` and `shotLife` for enemy projectile speed and lifetime |
| `characters` | pilot roster: cost, hp & speed multipliers, exclusive `weapon`, perks, hull silhouette |
| `weaponData`, `weaponUpgrades`, `ultimateData` | weapon base stats, the five upgrades each, and the ultimate |
| `SECTORS`, `SECTOR_SPAWNS`, `SECTOR_BOSSES` | per-sector scaling curves, spawn pools, boss order and sky palette |
| `SECTOR2_WEAPONS`, `WALL_SPEED`, `WALL_LEG` | which armaments the second sector opens, and how far a PHALANX WALL throws |
| `DASH_SHEAR`, `DASH_SHOVE` | what SHEAR DRIVE's two ranks do to what the dash passes through |
| `WEAPON_TIER`, `TIER_WEAPON`, `TIER_ULT`, `UPGRADE_CURVE`, `TIER_UPGRADE_MULT` | what every tree node costs in skill points — a weapon's tier prices its unlock, its five upgrades and its ultimate together, so re-tiering a weapon is the one-line way to make it cheaper or dearer |
| `PASSIVES`, `GLOBALS` | tree passives (per-rank cost lists, `req`) and the in-run system upgrades they unlock — `GLOBALS` holds the level-up card text, pause-menu line and tree tooltip in one place so the three cannot disagree |
| `SKILL_RATE`, `skillBase`, `FINAL_ROOM`, `IMPOSSIBLE_ROOM`, `IMPOSSIBLE_KEY` | skill-point payout curve (EASY is `0` — it banks credits but never skill), the last area of a run, and which area on which difficulty unlocks IMPOSSIBLE |
| `costStep`, and each node's `cost` / `max` | tree pricing — a node costs `cost + step × ranks already held`, so anything multi-rank gets dearer each time; `step` is derived once in `buildTree` and is 0 for single-rank nodes |
| `MOTHER_HOLD`, `MOTHER_BROOD`, `MOTHER_BROOD_TYPES` | how far the finale stands off, how many launches it keeps in the air, and what it launches |
| `NODE_STAT`, `STAT_ORDER`, `STAT_LABEL`, `PASSIVE_STEP` | which of the five run stats a tree node moves, and how its card reads |
| `creditRate`, `roomCreditBonus`, `CREDIT_MIN_ROOM` | pilot-currency payout curve |
| `CONTACT_CAP`, `BOSS_SLAM`, `BOSS_CONTACT_CAP`, `HEAVY_SHAPES` | contact-damage ceilings — no single hit may exceed a share of max hull |
| `MINE_CAP`, `WELL_CAP`, `AEGIS_CYCLE`, `AEGIS_GUARD` | per-weapon entity caps and firing cadence |

## Adding content — the files-to-touch checklists

Because the script is flat, one feature spreads across many functions. Miss a step and it silently does nothing.

**A new weapon** (use `mine` / GRAVITY MINE as the worked example — it touches all twelve):
1. `weaponData` — name, colour, base damage, rate
2. `weaponUpgrades` — exactly five (the tree and the draw both assume five before the ultimate)
3. `ultimateData` — name and description
4. `WEAPON_TIER` — its tier, which prices its node, its upgrades and its ultimate. **Without this the tree cannot list it and the draw can never offer it.**
5. `applyWeaponUpgrade` — a branch applying each upgrade id
6. `availableWeaponChoices` — the unlock blurb in the `desc` ternary chain
7. `weapons(dt)` — the firing block
8. `reset()`'s state literal — its cooldown field (`mineIn`), if it fires on an interval rather than continuously like `aegis`/`sword`
9. the entity array in the line-130 declaration and in `reset()`, if it spawns persistent objects
10. `update()`'s call chain — `updateMines(dt)`
11. `draw()`'s call chain (room space) or `drawWeaponEffects` (for auras attached to the player)
12. `ultimateEffects` — a branch if the ultimate ticks actively; otherwise add the id to the passive skip-list

Also add it to the weapon id list in `buildTree()`, and to `showTree()`'s ARMAMENTS list — or to `SECTOR2_WEAPONS`, which routes it into the ARMAMENTS V2 section and hides it until sector 2 is open. Add to `exclusiveWeapons` if it belongs to one pilot and must never appear in the level-up draw.

**A new enemy shape:** `types` entry (add `hold` to make it a gunboat, `ring` for the SENTINEL marking) → a `SECTOR_SPAWNS` row in whichever sectors it flies in, with `from` area and `growth` → any attack pattern in `moveEnemy` → `enemyPath` / `drawEnemies` if it is not a plain N-gon.

**A new boss:** `types` entry → `bossOrder` row (or a standalone def like `MOTHERSHIP` if it is not on the rotation) → a handler in `bossBehaviour` → art in `drawBossArt`. A boss that spawns adds should tag them `escortOf` — `deaths()` culls a dead boss's escorts so an area cannot end in a mop-up.

**A new relic:** `showRelics` card markup → `claimRelic` → `relicInfo` for the pause-menu loadout → the effect (usually `updateRelics`) → `storeRun`/`resumeRun` if it must persist.

**A new tree passive:** a `PASSIVES` entry (`costs` per rank, `req`, and `reqMax` if it is a second stage) → a `PASSIVE_STEP` line for the per-rank readout → a `treeX()` accessor folded into `treeStats()` → a `NODE_STAT` entry so its card shows the before-and-after → read it into `state` in `reset()` → `storeRun`/`resumeRun` if the run scalar must survive a park.

**A new HUD readout:** element with an `id` in `index.html` → entry in the `ui` map → write it in `hud()` or `paintAbilities`.

## Conventions

- Dense, minified-looking one-liners for mechanical code (update loops, `applyWeaponUpgrade`); expanded multi-line form for anything with real logic. Match the surrounding density rather than reformatting.
- Comments explain **why**, especially balance intent — "a wounded shape hits softer than a fresh one", "nothing banks until you are past room 5, so bailing out early cannot be farmed". Keep that voice; don't add comments that restate the code.
- Prose in comments is lowercase-leaning and terse; on-screen labels are ALL CAPS.
- Damage, speeds and cooldowns are per-second values multiplied by `dt` — never per-frame constants.
- `styles.css` is appended to, not rewritten: new rules go in a labelled block at the end rather than into the minified first line.
- On-screen, an area is an **AREA**; in code it is still `room` (`state.room`, `beginRoom`, `shapeshift_best_room`). The identifiers are load-bearing — saved runs and localStorage keys use them — so rename the label, never the key.
- Weapon display names get renamed for flavour fairly often (`bow` is `VULCAN CANNON`, `laser` is `PHOTON LANCE`). The **keys** — `bow`, `laser`, `bomb`, `sword`, `aegis`, `arc`, `mine` — are the stable identifiers and appear in saved runs *and in every tree node id*; don't rename them.
