# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Starwing: Neon Sector** — a browser roguelite/survivors game. (It was *Shapeshift: Neon Survivors*; the `shapeshift_` localStorage prefix is deliberately **not** renamed, since changing it would orphan every saved profile.) Three files, no build step, no framework, no package manager, no npm dependencies (the only external fetch is the Google Fonts link in `index.html` for DM Mono / Space Grotesk — offline it falls back to system fonts and plays fine):

- `index.html` — the canvas plus the DOM HUD (every element the game writes to has an `id`)
- `styles.css` — one minified base block, then appended readable override blocks
- `game.js` — the entire game (~5000 lines, flat script, no modules or classes)

## Running

Open `index.html` directly (`open index.html`) — it works over `file://` since there are no ES modules or fetches. For a server:

```sh
python3 -m http.server 8000    # then http://localhost:8000
```

There is no build, no lint, and no test suite. Verification is by playing. Controls: WASD/arrows move, SPACE pauses, SHIFT dashes (only once `dashDrive` is bought), E phase-cloaks (relic), Q shockwaves (PARAGON), M mutes, F fullscreens.

**Touch devices get a different control scheme**, chosen once at load by `matchMedia('(pointer:coarse)')` and switchable at runtime — see *Touch mode* below. `?touch=1` / `?touch=0` on the URL forces it either way, and dev mode carries a **MOBILE ON/OFF** switch under the DEV badge on the home screen — either way is how you test the mobile layout in a desktop browser.

**A fresh profile lands on the skill tree, not the home screen** — the last line of `game.js` is `if(treeHas('w:bow'))showHome();else showTree()`. Until the free `w:bow` node is taken there is nothing a level-up could offer, so the XP bar is hidden entirely.

**Reaching later game states quickly** — everything (`state`, `player`, `enemies`, `types`, `tree`, `skill`, …) is a top-level `let`/`const` in global scope, so the devtools console is the debugger:

```js
skill = 5000; showTree()                                 // afford every tree node this session
points = 5000; showRoster()                              // afford every pilot
localStorage.setItem('shapeshift_hard_beaten','true')    // unlock IMPOSSIBLE without clearing room 50
devJumpToArea(40)                                        // dev only: rebuild the run in any area, keeping the loadout
state.room = 9; state.left = 0; enemies.length = 0       // next portal leads to a boss room
state.xp = state.need                                    // force a level-up draw next frame
state.weapons.mine = newWeapon('mine')                   // grant a weapon outright
setTouchMode(true)                                       // flip to the on-screen stick and pads
enterDev()                                               // every pilot unlocked, profile set aside
```

`enterDev()` (reachable in-game from the home screen behind the password in `showDevPrompt`) is a sandbox: while `devMode` is true, `saveProfile`, `saveTree`, `storeRun`, `clearRun` and `recordRoom` all no-op, and `exitDev()` restores the pre-dev profile from `devBackup` — including the touch scheme, so a forced MOBILE ON reverts to whatever the device itself asked for. Clicking a node in dev mode toggles its rank rather than buying it, and toggling one off runs `pruneTree()`, which zeroes every node whose `req` is no longer met. ENABLE ALL / CLEAR ALL in the bay's top bar are `devMaxTree()` / `devClearTree()` — the fill only touches nodes `nodeVisible` passes, and the clear keeps `w:bow` because the bay's one-node first screen has no way back out. Neither changes a run already in the air: tree passives are read into run scalars at `reset()`. The pause menu's DEV row calls `devJumpToArea(room)`, which empties every entity array, clears the portal/warp fields and calls `beginRoom()` — the loadout comes with you, so it is the fastest way to see a boss or a late-area crowd. The row below it is `devGrantRefits(n)` — free level-up draws pushed straight into `state.freeDraws`, which is what `headstart` pays for at pre-flight; `n` of 0 clears the queue, and `state.hasDraw` is recomputed on every grant because bay toggles change the pool mid-run. **Any new persistence call has to check `devMode` too**, or dev play will overwrite a real save.

## Architecture

### Two coordinate systems

The **room** is `RW×RH` (3000×1875); the **viewport** is `W×H` (1440×900). `camera()` clamps the camera to the player, stopping at the room edges. In `draw()`, the context is translated by `-camX,-camY` — everything between `ctx.save()` and `ctx.restore()` is in *room* space. Anything drawn after `ctx.restore()` (`drawOffscreenMarkers`, vignette, hurt flash, low-health border, room banner, victory sequence) is in *screen* space. Confusing the two is the most common source of "it draws in the wrong place".

`onScreen(e)` gates weapon targeting: nothing off-camera can be shot, and off-screen threats get an `edgeMarker` pinned to the viewport border instead.

The cannon is the one weapon with a second target class. `fire()` falls back to `nearestShot()` when `nearest()` comes up empty, so an otherwise clear screen with rounds already in the air is engaged as point defence rather than left idle. It is **not** a loophole in the rule above: `nearestShot()` applies the same `onScreen` gate, so an off-screen shape can never be reached through the bullets it fired, and it skips rounds whose velocity is not closing on the player. Arrows already retarget onto bullets in `updateArrows` and cancel them on contact — this only makes the cannon *fire* in that situation.

### Frame loop

`frame(now)` → `update(dt, real)` → `ultimateEffects(dt)` → `draw()`, driven by `requestAnimationFrame`.

`dt` is scaled — `.12×` during hit-stop, `.4×` while dying — while `real` stays wall-clock. **Use `dt` for gameplay, `real` for anything that must decay at a fixed rate regardless of slow-motion** (screen shake, the death fade, the low-health heartbeat).

`state.paused` skips `update` entirely but keeps drawing, so every modal (level-up, relic, pause, game over, home, roster, tree) just sets `paused` and calls `show(markup)`.

### State

One global `state` object holds the whole run, rebuilt from scratch by `reset(difficulty)`. Entities live in sibling global arrays declared together on one line (`game.js:216` — `enemies`, `arrows`, `enemyBullets`, `stars`, `particles`, `blasts`, `echoShots`, `damageNumbers`, `delayedBlasts`, `strikes`, `rings`, `pulses`, `beams`, `mines`, `wells`, `rockets`, `walls`, `dashGhosts`), each with a paired `updateX(dt)` and `drawX()`. Adding an entity kind means adding the array to that declaration, clearing it in `reset()`, and wiring both functions into the `update`/`draw` call chains.

### Meta-progression: the skill tree gates the run

This is the system most likely to surprise you: **a weapon, an upgrade or an ultimate cannot appear in a level-up draw unless it was bought in the tree first.** `availableWeaponChoices()` filters every candidate through `treeHas('w:'+id)` / `treeHas('u:'+id+':'+upgradeId)` / `treeHas('ult:'+id)`, and `globalChoices()` through `treeHas('g:'+id)`. So adding a weapon or an upgrade to `weaponData`/`weaponUpgrades` alone makes it *unreachable*, not merely rare.

- `skill` is the tree currency (`shapeshift_skill`), paid out per run by `skillReward(room, difficulty)`; `points` is the separate pilot-purchase currency (`shapeshift_points`) paid by `runReward()`. Both are banked by `bankAndPark` / `gameOver`, tracked against `state.paidSkill` / `state.paidCredits` so a park-and-resume cannot double-pay.
- `TREE_NODES` is *generated* by `buildTree()` from `weaponData`, `weaponUpgrades`, `ultimateData`, `PASSIVES` and `GLOBALS` — you do not hand-write nodes. A weapon's five upgrades and its ultimate appear automatically once the weapon has a `WEAPON_TIER` entry.
- Node costs are `cost` + a `step` per rank already held (`nodeCost`), not a per-rank list. `buildTree` sets `max` (rank count) and derives `step` from `cost`, unless the node declares its own — `dashStrike` does, so its second rank jumps 26 → 70 rather than creeping.
- Node ids are structural: `w:<weapon>`, `u:<weapon>:<upgradeId>`, `ult:<weapon>`, `g:<global>`, and bare ids for passives. `req` lists node ids, so prerequisites are just id strings. `reqMax` is the stricter form — it wants every rank of the named node, and is what chains each passive's stages: `powerII` behind a fully-taken `power`, `powerIII` behind a fully-taken `powerII`. The III stages (`powerIII`, `critChanceIII`, `critPowerIII`, `rateIII`) and `headstart` carry `sector: 2`, so they stay invisible until the second sector opens.
- `exclusiveWeapons` (`aegis`→WARDEN, `arc`→REVENANT) are never in the draw and their `w:` node costs 0 — owning the pilot satisfies it (`nodeGranted`), and the whole group is hidden from the tree until you own that pilot (`nodeVisible`).
- Every node carries a `branch`, and that is what sorts it into a column: `buildTree` stamps weapons with `core` / `arms` / `arms2` (the last for `SECTOR2_WEAPONS`), passives declare their own (`amp`, `rate`, `speed`, `systems`, and the sector-2 `amp2` / `sys2`), and globals default to `systems` — the V2 sections are just the `amp2`/`sys2` nodes plus the `sector: 2` globals, not a separate structure. The V2 globals (`hull2`, `regen2`, `thrust2`) each `req` their base node (`g:health`, …) and are then offered *alongside* it in the draw, not in place of it, however their card text reads.
- Tree passives are read once at `reset()` into run scalars — `treeDamage/treeRate/treeSpeed/treeCritChance/treeCritMult` become `state.charDamage`, `state.rateScale`, `state.critChance`, `state.critMult`, `state.hasDash`. **Buying a node mid-run does nothing until the next `reset`.**
- **A run may install a given system only `GLOBAL_MAX` (5) times.** `globalMax`/`globalRank`/`globalFull` gate both ends — `globalChoices()` stops offering it and `upgrade()` refuses it — so the ceiling holds however the install was reached. A `GLOBALS` entry may set its own `max` (`dash` is `max:1`), which is what retired the old one-off special-casing. The count is shown wherever the system is: the level-up card's key line reads `SYSTEM 3/5` (via a `tag` on the choice, which overrides the usual ULTIMATE / NEW WEAPON / UPGRADE label), the last one says so in the card text, the pause menu reads `×3/5` and marks `at cap`, and the bay tooltip gets the allowance appended from the constant rather than written into the table prose.
- `headstart` (FIELD REFIT) is the odd one out: it is not a scalar but a count of free level-up draws, `state.freeDraws`, spent by `levelUp(true)` from `update()` until it hits zero. `resumeRun` deliberately sets it to `0` rather than restoring it — a resumed run already spent its refits — so it is the one run field that intentionally breaks the round-trip rule below.
- `critHit(dmg)` rolls per *discrete* hit only. Continuous damage — blade edge, shield field, laser burn — deliberately skips it so a crit always reads as one big number.

### Sectors

A **sector** is a whole run's worth of context, and `SECTORS` holds all of it: how steeply hp and damage climb per area (`hpBase`, `hpCurve`, `dmgCurve`), how many shapes spawn (`wave`), how hard its bosses are (`bossHp`, `bossCurve`), what a run in it is worth (`credits`, `skill`, `xp`), and the palette its sky is painted from (`sky`). **No scaling constant should be written inline any more** — `spawn`/`spawnAt` go through `enemyHp()`, and `beginRoom`, `spawnBoss` and the contact-damage lines all read `sector()`.

- Payout multipliers flow through `sectorCredits()` / `sectorSkill()` / `sectorXp()` into `runReward`, `skillReward` and `xpValue` — a deeper sector pays for itself without touching the difficulty table.
- `state.sector` is fixed for a run and saved with it; `chosenSector` is what the menus are pointing at. `sector()` returns the run's if there is one, otherwise the menu's.
- Each sector has its own spawn pool (`SECTOR_SPAWNS`), its own rotation (`SECTOR_BOSSES`) drawn from the shared `bossOrder`, and its own finale (`SECTOR_FINALE`, read through `finaleBoss()`) which sits off the rotation entirely. The two sectors share no boss: sector 1 flies SENTINEL / LANCE / ORBITER / BEACON and ends on the MOTHERSHIP, sector 2 flies MONOLITH / SHRIKE / BREACHER / WRAITH and ends on the LEVIATHAN. `hollow` is still listed fifth in sector 1's rotation, where the area-50 cap keeps it out of reach — it is the one boss nothing currently reaches.
- `sectorsOpen` (persisted as `shapeshift_sectors`) gates both the picker and the tree: any node carrying `sector: 2` is invisible via `nodeVisible` until that sector is open. Clearing `FINAL_ROOM` on hard opens the next one, in `runCleared`. `showTree()` draws the whole V2 half (ARMAMENTS V2 / SYSTEMS V2 / AMPLIFIERS V2) only when `sectorOpen(2)`; otherwise it prints one sealed panel in its place.
- Sector 3 (`UNCHARTED`) exists today only as a `soon: true` reel preview — no spawn pool, no boss order, no `sky`.
- `skyFor()` caches the star field and deck gradient **per sector** and throws them away when it changes — a new sector palette needs no other wiring.
- A sector's `sky` also carries its scenery flags: `haze` paints drifting burning bands, and `hulks: true` puts a burning shipping container through the far background every `HULK_GAP` seconds (`updateHulks`/`drawHulks`, parallax `HULK_PF`). Both are drawn *behind* the deck and are pure decoration — nothing can shoot them and they cannot touch the player.
- Adding a sector: a `SECTORS` entry, a `SECTOR_SPAWNS` pool, a `SECTOR_BOSSES` order, and whatever `sector: <id>` nodes it should open on the tree. Set `soon: true` to put it on the reel as a locked preview.

### Death is deferred to the end of the frame

`deaths()` runs *after* every weapon and projectile update, so a shape reduced to 0 hp is still sitting in `enemies` for the rest of the frame. Anything that **spends** something on a target — a round, a chain link, a thrown mine, an echo shot, the next auto-shot from `nearest()` — must test `liveTarget(e)` (`e.hp > 0`) or it will throw that resource at a corpse. Continuous and area damage (laser, aegis, blasts) does not need the guard; overkill there costs nothing.

### Enemy fire is scaled where it moves

`updateEnemyBullets` applies `shotSpeed()` and `shotLife()` from the difficulty table at movement time, not at spawn time. That is deliberate: enemy bullets are pushed from several places (shape volleys in `moveEnemy`, boss volleys, `bossOrb`), and scaling at the single update site means a new spawn site is covered automatically. `b.vx`/`b.vy` stay unscaled, so homing recalculation keeps working off the base speed.

### A weapon's look is read off its upgrades

Taking an in-run upgrade changes what a weapon draws, not just what it does. Nothing tracks this separately: `upg(w, id)` asks `w.taken` directly, which is already saved with the run, so a parked run repaints correctly on resume and the look can never drift from the loadout.

- `DMG_UPGRADE` maps each weapon to the one upgrade that carries its visual signature, and `heavyShot(id)` is the shorthand for "does the equipped weapon have it". Draws read the table rather than naming an upgrade id inline.
- Weapons drawn straight from the weapon object (`drawLaser`, `drawArc`, `drawAegis`, `drawBlade`) call `upg(w, DMG_UPGRADE.<id>)` at draw time.
- **Anything that outlives the shot copies the flag at spawn** — an arrow, a mine, a wall, a rocket, a blast — because by the time it is drawn the weapon that made it is no longer in reach, and it may not even be equipped any more. `detonate` takes `heavy` as a parameter for exactly this reason: the same crater is made by the torpedo's IMPACT FUSING and by a WARHEAD SALVO rocket's HEAVY WARHEAD, and it must not guess which.
- The bow additionally carries `grade` (its upgrade count) on every round, which scales the shell, the tracer and the muzzle glow — so the cannon visibly grows as it levels rather than only on one upgrade.

### Enemy movement is steering, not seeking

`moveEnemy` builds a force vector rather than walking straight at the player: a unit vector toward an aim point, a tangent for strafing, plus separation from every other enemy (hard push under `e.r+o.r+12`, a softer sideways slide under 210px) so crowds fan out instead of stacking into one line. Shapes carrying a `hold` value in `types` (`bowtie`, `seeker`, `raker`, `sentry`, `stalker`, `scorcher`, `pyre`) are **gunboats**: they keep that standoff distance and orbit at it instead of closing. The force is normalised, then applied at the shape's speed — so tuning `hold` changes engagement range, not pace.

The aim point is the player for everything except a shape flagged `guard: true` in `types` (`picket`). A **screen** picks a ward via `guardWard()` — the fragile long-range shape *you* are closest to, since that is the one your guns are about to pick — and steers to a point `GUARD_LEAD` in front of it on the line between you and it, never closer to you than `GUARD_KEEP`. It does not block shots or touch targeting: sitting there simply makes it the nearest thing on screen, and `nearest()` does the rest. With no ward in `GUARD_REACH` it reverts to an ordinary chaser. Guards ease off as they arrive (`clamp(d/45,.2,1)`) so they settle on station instead of oscillating across it, and `wardable()` excludes other guards so screens cannot cover each other.

Bosses bypass all of this and run their own state machine from `bossBehaviour[e.bossId]`, keyed on `e.mode` and `e.timer`.

### Room cycle

`beginRoom()` sizes a spawn budget from `state.room` and difficulty `mass`, drip-feeds it via `state.spawnIn`, and shows the room banner. Bosses spawn on `room % 10 === 0` (`spawnBoss` picks via `bossForRoom`, cycling with a bulk bonus per full pass through the sector's roster — never on `FINAL_ROOM`, since the finale is not on the rotation and has not been passed through). `bossForRoom` special-cases `FINAL_ROOM` (50) to `finaleBoss()`, which is why a rotation only ever reaches its first four entries: a fifth entry is unreachable, as sector 1's `hollow` is.

When `state.left === 0 && enemies.length === 0`, `finishRoom()` clears all hostile projectiles (you cannot die to a stray shot after winning), vacuums the remaining XP remnants, offers a relic on boss rooms, then `openPortal()`. `FINAL_ROOM` (50) ends the run: `nextRoom()` hands off to `runCleared()` instead of incrementing, which banks the payout, calls `clearRun()` and shows the SECTOR CLEAR screen (change difficulty / hangar / main menu). Area 50 skips its relic — there is no area left to spend it in. Clearing it on `IMPOSSIBLE_KEY` (hard) or on IMPOSSIBLE itself sets `shapeshift_hard_beaten`; easier settings never unlock it. Touching the portal starts the multi-stage `state.victorySequence` (`swirl` → `suck` → `flash`/`warp` → `arrive`), which drives camera zoom and rotation and ends by calling `nextRoom()`.

### UI

All menus are HTML strings passed to `show()`, which sets `#overlay`'s `innerHTML` and re-binds handlers by `id` / `data-*` attribute. The in-game HUD is DOM, not canvas: `hud()` runs at the end of every `update` and writes into the `ui` element map. The "how to play" screen (`demos`) is the exception — animated canvases rendered per card.

The manual's cards draw the **real silhouettes**, not placeholder polygons: `demoPlane` reads `PLANES` through `manualPlane()` (the pilot sitting in the hangar, so the manual teaches you in the aircraft you are about to fly) and `demoHull` reads `HULLS`/`HULL_OF` for hostiles. `tpoly` survives only for things that genuinely are polygons — XP remnants and upgrade pips.

### The threat index

THREAT INDEX on the home screen (`showIndex`) is a recognition chart: every hull in the game, **blank until you have flown against one**. Two tabs — CRAFT and CAPITALS — held in `indexTab`.

- `seenFoes` (persisted as `shapeshift_seen`) is the set of hulls met. `seeFoe(id)` is called from the three places a hostile enters a room — `spawn`, `spawnAt`, `spawnBoss` — so flying past one identifies it; it does not need to die. Like every other persistence call it no-ops on disk under `devMode`, and `enterDev`/`exitDev` back the set up and restore it.
- `hullSvg(id, known)` is `planeSvg`'s trick on an enemy outline: `HULLS` points are already a closed silhouette nosed at +x, so only the quarter turn is applied. An unidentified hull is the outline and nothing else — no colour, no canopy, no engine lights.
- Nothing is hand-listed. The craft come out of `SECTOR_SPAWNS` via `foeGroups()` (each shape charted once, under the first sector that flies it, so the drift's half of the roster is not listed twice), and the capitals out of `bossChart(sec)`, which repeats `bossForRoom`'s arithmetic — areas 10–40 off the rotation, area 50 the finale. That is why a rotation's unreachable fifth entry (sector 1's `hollow`) never appears on the chart either.
- A sealed sector gets one locked panel instead of its plates, and neither the tally nor a plate's "flies in" line counts it — `indexPool` and `foeSectors` both filter on `sectorOpen`. The **pips** deliberately do not: `indexScale()` prices them against the whole roster so a plate does not change meaning when a sector opens.
- Wording lives in `CODEX` (craft) and each boss's `note` (capitals). Nothing there is read during a run.

### The dash animation is a readout of the dash

`drawDashFx()` draws the dash in independent layers, each gated on a flag from `dashKit()` — `coils` (`state.dashPower > 1`, from SLIPSTREAM COILS or a pilot perk), `shear` and `shove` (SHEAR DRIVE's two ranks). The silhouette trail and launch ring are the bare drive; coils add a second ring and slipstream streaks; `shear` etches a white outline onto every afterimage and puts cutting edges on the hull; `shove` throws a bow shock ahead of the nose. `dashTier()` is just the count of installed layers, and drives the things that scale smoothly rather than switching on — launch shake, particle count, ghost lifetime, thrust.

They are **layers, not a ladder**: SHEAR DRIVE without SLIPSTREAM COILS draws its own edges and skips the streaks, so any combination reads correctly. Anything new that changes the dash should add a flag to `dashKit()` and a layer keyed on it, rather than branching on `dashTier()` — the tier number cannot say *which* upgrades are held.

The trail lives in `dashGhosts`, aged on `dt` (so it stretches under hit-stop) by `updateDashFx`, and `drawDashFx` returns immediately when there is nothing in flight.

### Touch mode

`touchMode` swaps the keyboard for an on-screen stick and three ability pads, and rewrites every line of instruction to match. It is a runtime flag, not a build: `setTouchMode(on)` flips it live, and the first `pointerdown` with `pointerType === 'touch'` turns it on by itself, so a hybrid laptop switches the moment a finger lands. Forced on with a keyboard attached, the mouse drives the stick and the keys still work alongside it.

- **Input.** The stick is floating: a `pointerdown` anywhere down the left of the arena (and outside a pad) raises it under the finger, and pushing past `STICK_R` drags the origin along so it never runs out of travel. It is analog — `moveInput()` returns a vector whose *length* is the throttle, `1` for a key and anything up to `1` for the stick — so both the player's travel and `dash()`'s aim read from that one function rather than from `keys` directly.
- **Geometry is in CSS pixels**, converted to viewport units through `tScale()` (`W / canvasRect.width`, clamped). A pad stays thumb-sized whether the arena draws at 360px or full screen. `canvasRect` is cached and re-measured on resize, on fullscreen change and on every `pointerdown`.
- **The pads are canvas, not DOM** — `drawTouchControls` runs in screen space from `draw()`, and `touchButtons()` is the single source of both their layout and their hit-testing. Each pad mirrors the ability row it replaces (`abilityState`), so `body.touch` hides the DOM `.ability-hud` and `.move-hint` rather than duplicating them.
- **They only exist mid-run.** `touchLive()` gates drawing *and* input on the same condition; `drawTouchControls` calls `releaseTouch()` the moment it goes false, which is what stops a paused run from coasting on the last stick vector. What it must **not** test is `state.active` — that means "the room is still fighting", and `finishRoom()` clears it on the last kill, so gating on it removes the controls exactly when you have to fly into the portal. The rule is that touch is live whenever the keyboard would be, i.e. whenever `update()` runs.
- **Fullscreen is a specificity trap.** `body.touch .game-wrap` (0,2,1) outranks `.game-wrap:fullscreen` (0,2,0), so the touch layout's margin and chrome-sized width leak into fullscreen and pin the arena to the top of the screen. Any new `body.touch .game-wrap` rule needs a matching `body.touch .game-wrap:fullscreen` / `:-webkit-full-screen` pair, written as separate rules — one unknown selector invalidates a whole comma group. iOS has no element fullscreen API at all — only a `<video>` can go fullscreen — so `toggleFullscreen()` falls back to `body.fs-fallback`, a CSS stand-in that pins the arena over the page at canvas aspect and hides the topbar and footer. It carries its own `#fsExit` chip because the topbar's button ends up behind the arena, and it sizes on `dvh` rather than `vh` since Safari's toolbars are still on screen. `fsActive()` covers both paths, so the button state and the F key work either way, and `paintFsBtn()` stamps `body.fs-on` for whichever is live. That class drives `.fs-controls`, a pause/mute/exit cluster that sits **inside** `.game-wrap` so the native fullscreen layer paints it too — fullscreen takes the topbar with it, and a phone has no Esc, SPACE or M to fall back on.
- **Instruction text is centralised** in `ctrlMove()` / `ctrlDash()` / `ctrlWave()` / `ctrlPhase()`, read by the difficulty screen, the relic card, the pause-menu loadout, PARAGON's hangar card and the DASH DRIVE tree node (rewritten in `paintControlHints`, which edits `TREE_BY_ID.dashDrive` — `buildTree` has already copied `PASSIVES` by then). The field manual swaps its first card through `demoList()`, which reads `manualTouch()` — dev mode's COMPUTER / MOBILE switch on that screen sets `devManual` to preview either manual without touching the live scheme. **Any new on-screen mention of a control belongs in those helpers**, or the two schemes will drift apart.

### Persistence

`localStorage` keys, all prefixed `shapeshift_`: `_best_room`, `_points`, `_unlocked`, `_character`, `_hard_beaten`, `_skill`, `_tree`, `_sectors` (which sectors are open), `_sector` (the one the menus point at), `_seen` (hulls identified for the threat index), `_sound`, `_run`, `_version`. Everything except `_sound` and `_version` is in `SAVE_KEYS` — `_sound` deliberately survives a version wipe.

**Two independent version numbers, easy to confuse:**
- `SAVE_VERSION` (currently `'2'`) versions the *profile*. On load, if `shapeshift_version` doesn't match, every key in `SAVE_KEYS` is deleted — a one-time wipe. Bump it only when a change makes old progress meaningless; anything new that must survive a wipe-free upgrade also needs adding to `SAVE_KEYS`.
- The run blob's `v:1` in `storeRun`/`loadRun` versions the *parked run* only.

`storeRun()` / `resumeRun()` save the run's *meaning*, not its entities — room number, level, weapons, globals, relics, player stats, the tree-derived scalars — and the room repopulates via `beginRoom()` on resume. **Any new `state` field that must survive a park-and-resume has to be added to both functions.** Death calls `clearRun()` — runs are only resumable by parking from the pause menu. A parked run can also be thrown away without flying a new one: DISCARD RUN on the home screen (two presses, `confirmingDrop`) just calls `clearRun()`, since parking already banked what the run was worth.

### Audio

Fully synthesised through WebAudio (`tone`, `noiseHit`) — no asset files. The context is created lazily on the first pointer gesture to satisfy autoplay policy. `SFX_GAP` throttles each sound name so rapid-fire weapons cannot turn into a buzz; new sounds need an entry there or they will machine-gun.

## Balance tables

Tuning lives in data tables near the top of `game.js` rather than in code — prefer editing these over touching logic:

| Table | Controls |
|---|---|
| `types` | per-shape hp / speed / radius / colour / xp / sides, plus `hold` for standoff gunboats, `guard` for screens, and `splits`/`splitInto` for shapes that come apart on death (hp and speed are multipliers on the 100hp, 288px/s baseline) |
| `CODEX` | the threat index's wording for every non-boss shape: chart `name` (the first sector's are its `HULL_OF` class, the way a recognition chart names an aircraft by its silhouette), one-word `role` tag, and the `line` that says what it does to you. Bosses carry the same thing as `note` on their `bossOrder` / finale row |
| `BEAM_ENEMIES`, `BEAM_CAP` | the lane-painting family (`raker` → `scorcher` → `pyre`): lanes per volley, burn time, reach, damage and reload, plus the hard ceiling on how many lanes may be on the floor at once |
| `GUARD_LEAD`, `GUARD_KEEP`, `GUARD_REACH` | how far in front of its ward a screen sits, how close to you it will come, and how far it will travel to cover something |
| `bossOrder`, `MOTHERSHIP`, `LEVIATHAN`, `SECTOR_FINALE` | the shared rotation pool for areas 10–40 (`hpMult`, contact damage, `blurb` for the area banner, `note` for the threat index), the two area-50 finales that sit off it, and which sector ends on which |
| `RELICS` | the boss-relic pool: card text, pause-menu line, and the `apply` that grants it |
| `difficulties` | hp / speed / dmg / heavy / credits / mass / mix multipliers, plus `shot` and `shotLife` for enemy projectile speed and lifetime |
| `characters` | pilot roster: cost, hp & speed multipliers, exclusive `weapon`, perks, hull silhouette. A `perks` entry may be a **function** when the wording depends on the control scheme — PARAGON's shockwave line reads `ctrlWave()` — the same escape hatch `RELICS` has for `desc`/`line` |
| `HULLS`, `HULL_OF`, `PLANES`, `PLANE_SCALE` | the unit-space polygon each pilot's ship is drawn from, and the `plane` class that scales it |
| `weaponData`, `weaponUpgrades`, `ultimateData` | weapon base stats, the five upgrades each, and the ultimate |
| `DMG_UPGRADE` | which upgrade carries each weapon's visual signature — the one edit needed if an upgrade is renamed or the look moves to a different one |
| `HULK_GAP`, `HULK_PF`, `HULK_MAX` | the drift's burning-container scenery: seconds between wrecks, how far off they ride, and how many may be in the sky at once |
| `SECTORS`, `SECTOR_SPAWNS`, `SECTOR_BOSSES` | per-sector scaling curves, boss order and sky palette, plus the spawn pool: one row per shape, `from` (first area it appears in), `base` weight and `growth` (negative = fades out as areas climb). There is no single global spawn table — every sector carries its own |
| `SECTOR2_WEAPONS`, `WALL_SPEED`, `WALL_LEG` | which armaments the second sector opens, and how far a PHALANX WALL throws |
| `DASH_SHEAR`, `DASH_SHOVE` | what SHEAR DRIVE's two ranks do to what the dash passes through |
| `dashKit()`, `dashTier()`, `DASH_GHOST_GAP` | which dash upgrades are installed, and how densely the trail records silhouettes — the dash animation is built from these |
| `WEAPON_TIER`, `TIER_WEAPON`, `TIER_ULT`, `UPGRADE_CURVE`, `TIER_UPGRADE_MULT` | what every tree node costs in skill points — a weapon's tier prices its unlock, its five upgrades and its ultimate together, so re-tiering a weapon is the one-line way to make it cheaper or dearer |
| `PASSIVES`, `GLOBALS`, `GLOBAL_MAX` | tree passives (`cost`/`max`, `branch`, `req`/`reqMax`) and the in-run system upgrades they unlock — `GLOBALS` holds the level-up card text, pause-menu line and tree tooltip in one place so the three cannot disagree, plus an optional `max` overriding how many times one run may install it (default `GLOBAL_MAX`, 5) |
| `SKILL_RATE`, `skillBase`, `FINAL_ROOM`, `IMPOSSIBLE_ROOM`, `IMPOSSIBLE_KEY` | skill-point payout curve (EASY is `0` — it banks credits but never skill), the last area of a run, and which area on which difficulty unlocks IMPOSSIBLE |
| `costStep`, and each node's `cost` / `max` | tree pricing — a node costs `cost + step × ranks already held`, so anything multi-rank gets dearer each time; `step` is derived once in `buildTree` and is 0 for single-rank nodes |
| `MOTHER_HOLD`, `MOTHER_BROOD`, `MOTHER_BROOD_TYPES` | how far the finale stands off, how many launches it keeps in the air, and what it launches |
| `NODE_STAT`, `STAT_ORDER`, `STAT_LABEL`, `PASSIVE_STEP` | which of the five run stats a tree node moves, and how its card reads |
| `creditRate`, `roomCreditBonus`, `CREDIT_MIN_ROOM` | pilot-currency payout curve |
| `CONTACT_CAP`, `BOSS_SLAM`, `BOSS_CONTACT_CAP`, `HEAVY_SHAPES` | contact-damage ceilings — no single hit may exceed a share of max hull |
| `MINE_CAP`, `WELL_CAP`, `AEGIS_CYCLE`, `AEGIS_GUARD` | per-weapon entity caps and firing cadence |

## Adding content — the files-to-touch checklists

Because the script is flat, one feature spreads across many functions. Miss a step and it silently does nothing.

**A new weapon** (use `mine` / GRAVITY MINE as the worked example — it touches all thirteen):
1. `weaponData` — name, colour, base damage, rate
2. `weaponUpgrades` — exactly five (the tree and the draw both assume five before the ultimate)
3. `ultimateData` — name and description
4. `WEAPON_TIER` — its tier, which prices its node, its upgrades and its ultimate. **Without this the tree cannot list it and the draw can never offer it.**
5. `applyWeaponUpgrade` — a branch applying each upgrade id
6. `availableWeaponChoices` — the unlock blurb in the `desc` ternary chain
7. `weapons(dt)` — the firing block
8. `reset()`'s state literal — its cooldown field (`mineIn`), if it fires on an interval rather than continuously like `aegis`/`sword`
9. the entity array in the `game.js:216` declaration and in `reset()`, if it spawns persistent objects
10. `update()`'s call chain — `updateMines(dt)`
11. `draw()`'s call chain (room space) or `drawWeaponEffects` (for auras attached to the player)
12. `ultimateEffects` — a branch if the ultimate ticks actively; otherwise add the id to the passive skip-list
13. `DMG_UPGRADE` — which of its five upgrades changes how it *looks*, plus the branch in its draw that acts on it (see below)

Also add it to the weapon id list in `buildTree()`, and to `showTree()`'s ARMAMENTS list — or to `SECTOR2_WEAPONS`, which routes it into the ARMAMENTS V2 section and hides it until sector 2 is open. Add to `exclusiveWeapons` if it belongs to one pilot and must never appear in the level-up draw.

**A new enemy shape:** `types` entry (`hold` makes it a gunboat, `guard` makes it a screen, `ring` is the SENTRY marking, `splits`+`splitInto` makes it burst into something on death) → a `SECTOR_SPAWNS` row in whichever sectors it flies in, with `from` area and `growth` → a `HULL_OF` entry, or it draws with the default `pod` silhouette → a `CODEX` entry, or the threat index prints its raw id → any attack pattern in `moveEnemy` → `enemyPath` / `drawEnemies` if it needs art of its own. Nothing else is needed for the index: it charts itself off `SECTOR_SPAWNS`.

A **new grade of lane-painter** is just a `BEAM_ENEMIES` row plus the `types` and `SECTOR_SPAWNS` entries — the firing code is table-driven, so nothing in `moveEnemy` changes. A **new splitter** needs no new code either: `deaths()` queues shrapnel and spawns it after the sweep reassigns `enemies`, and flags each child `split` so shrapnel cannot itself split.

**A new boss:** `types` entry → `HULL_OF` entry (or it draws as the default `pod`) → `bossOrder` row (with a `note` for the threat index) plus a place in some sector's `SECTOR_BOSSES`, or a standalone def wired into `SECTOR_FINALE` if it ends a sector → a handler in `bossBehaviour` → art in `drawBossArt`. Only the first four entries of a rotation are ever reached, so a fifth is dead content. A boss that spawns adds should tag them `escortOf` — `deaths()` culls a dead boss's escorts so an area cannot end in a mop-up.

**A new relic:** one `RELICS` entry — `name`, `desc` (the card), `line` (the pause-menu readout), and `apply()`, which runs once on claim. `showRelics` draws three at random from whatever the run has not taken, `claimRelic` calls `apply`, and `relicInfo`/`relicLine` are derived from the table, so nothing else needs touching. Two rules: `desc`/`line` may be a **function** when the wording depends on the control scheme (`cloak` reads `ctrlPhase()`), and if `apply` writes a **new** `state` field it has to be added to `reset()`, `storeRun` and `resumeRun` — the ones that only move `player` stats, `state.weapons` or already-saved scalars (`charDamage`, `critChance`, `charXp`, `dashCd`) round-trip for free. Continuous relic behaviour goes in `updateRelics`.

**A new tree passive:** a `PASSIVES` entry (`cost`/`max`, `branch`, `req`, `reqMax` if it is a later stage, `sector: 2` if it belongs to the V2 half) → a `PASSIVE_STEP` line for the per-rank readout → a `treeX()` accessor folded into `treeStats()` → a `NODE_STAT` entry so its card shows the before-and-after → read it into `state` in `reset()` → `storeRun`/`resumeRun` if the run scalar must survive a park.

**A new HUD readout:** element with an `id` in `index.html` → entry in the `ui` map → write it in `hud()` or `paintAbilities`. If it is an ability with a key, it also needs a pad in `touchButtons()` / `abilityState()` and a line in `paintControlHints`.

## Conventions

- Dense, minified-looking one-liners for mechanical code (update loops, `applyWeaponUpgrade`); expanded multi-line form for anything with real logic. Match the surrounding density rather than reformatting.
- Comments explain **why**, especially balance intent — "a wounded shape hits softer than a fresh one", "nothing banks until you are past room 5, so bailing out early cannot be farmed". Keep that voice; don't add comments that restate the code.
- Prose in comments is lowercase-leaning and terse; on-screen labels are ALL CAPS.
- Damage, speeds and cooldowns are per-second values multiplied by `dt` — never per-frame constants.
- `styles.css` is appended to, not rewritten: new rules go in a labelled block at the end rather than into the minified first line.
- On-screen, the skill tree is the **OVERHAUL BAY** and its nodes are **overhauls**; in code it is all still the tree (`tree`, `TREE_NODES`, `showTree`, `shapeshift_tree`, every `w:`/`u:`/`ult:`/`g:` node id). Same rule as below: rename the label, never the key.
- On-screen, an area is an **AREA**; in code it is still `room` (`state.room`, `beginRoom`, `shapeshift_best_room`). The identifiers are load-bearing — saved runs and localStorage keys use them — so rename the label, never the key.
- Weapon display names get renamed for flavour fairly often (`bow` is `VULCAN CANNON`, `laser` is `PHOTON LANCE`). The **keys** — `bow`, `laser`, `bomb`, `sword`, `aegis`, `arc`, `mine`, `missile`, `phalanx` — are the stable identifiers and appear in saved runs *and in every tree node id*; don't rename them.
