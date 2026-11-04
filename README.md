# 🎲 Simple Games

Board games you can play in your browser — no installs, no sign-ups. Make a room, send the code to a friend, and play. Or just pass one device around the table.

**▶ Play:** https://simple-games-dev.github.io/simple-games/

---

## The games

| | Game | Players | What's it about? |
|---|---|---|---|
| 💎 | **[Gem Merchants](games/merchants/)** | 2–4 | Collect gems, buy cards that make your next purchases cheaper, and attract nobles. First to 15 prestige triggers the final round. |
| 🗼 | **[Ascent](games/ascent/)** | 2–3 | Climb three storeys or be the last builder standing. Move, build, and out-think your rivals on a 3D tower board. |
| 🌿 | **[Hedgerow](games/hedgerow/)** | 2–4 | Race your pawn across the garden — or drag hedges onto the board to slow everyone else down. You can never trap a player completely. |
| 👻 | **[Ghosts](games/ghosts/)** | 2 | Each side has good and poisoned ghosts, and only you know which is which. Capture the wrong one and you lose your own. Get a good ghost across to win. |
| 🏝️ | **[Colonist](games/colonist/)** | 2–4 | Settle the island, trade with friends, build roads and cities, and race to 10 points. |
| ♞ | **[Tempo Chess](games/chess/)** | 2 | Chess with a clock. Premoves, move highlights, sudden-death finish. |

Online rooms disappear on their own about an hour after the last move.

## How the repo is laid out

```
index.html            the main page (game cards)
images/               card pictures for the main page
shared/
  firebase-config.js  Firebase + GIPHY settings — the ONLY place they live
  boot.js             loads config, Firebase and (optionally) Three.js, then sg.js
  sg.js               shared code: rooms, seats, chat + GIFs, turn timer, room cleanup
  sg.css              shared look (navy/amber theme, chat panel, buttons)
games/
  ascent/index.html   one folder per game — only that game's rules and drawing
  chess/  colonist/  ghosts/  hedgerow/  merchants/
firestore.rules       security rules to publish in the Firebase console
FIREBASE_SETUP.md     one-time Firebase checklist (rules, key restriction, App Check)
```

```
shared/sg-live.js     sound, vibration, "your turn" alerts, emoji reactions, rematch vote, stats, app install
manifest.webmanifest  \ makes the site installable ("Add to home screen")
sw.js                 /  and lets the last pages you saw open offline
tools/bot-tune.py     self-play tuner for the Gem Merchants computer player
```

Everything is plain HTML/CSS/JS with no build step. Change `shared/sg.js` (chat, timer, rooms) or `shared/sg.css` once and every game gets it.

## What's shared, what's not

Shared by every game: chat with GIFs, the per-turn timer picker and countdown, room codes and the invite link, seat claiming (safe when two people click at once), room cleanup, the look of the buttons/cards/panels.

Per game: the rules, the board drawing, and anything unusual — Tempo has its own chess clock (not the turn timer), and Colonist keeps trade offers and move lines in the chat panel next to player messages.

## Adding a new game

1. Copy a small game's folder (e.g. `games/merchants/`) to `games/<new-name>/` and start from its `index.html`.
2. Keep the three lines in `<head>` that pull in `../../shared/sg.css` and `../../shared/boot.js` (add `data-libs="firebase,three"` if you need 3D).
3. Use the `SG` helpers instead of rewriting them: `SG.initFirestore()`, `SG.createChat({...})`, `SG.renderTimerPicker(...)`, `SG.writeKeys / writeState / mutateRoom`, `SG.copyInviteLink(...)`, `SG.sweepOldRooms(collection)`.
4. Put the new Firestore collection name (e.g. `fooRooms`) in `firestore.rules` and republish the rules.
5. Add a card to `index.html` and a 1312×784 picture in `images/`.

## Running it locally

Open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000. If you use a Firebase API-key restriction, add `http://localhost:*/*` while testing.

## Setting up Firebase

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md). Short version: paste your config into `shared/firebase-config.js`, publish `firestore.rules`, restrict the API key to your site, turn on App Check.

## A note on names

Some of these games are inspired by well-known board games. They're fan-made, free, unofficial projects and aren't affiliated with or endorsed by the original publishers. If you're a rights holder and want something changed, please open an issue.


## Playing against the computer (Gem Merchants, Hedgerow, Ghosts, Ascent)

Pick **Easy / Normal / Hard** under "Opponents" for a same-device game, or under "Empty seats" in an online lobby (the computer fills any seat nobody joins). In an online room the first human's browser plays the computer's turns, so keep that tab open.

It is a hand-written evaluation (no model, no server): every legal move gets a score from prestige, discount value, noble progress, gem efficiency and denial, and the best-scoring move is played. The weights were found by self-play hill-climbing (`tools/bot-tune.py`). Measured over 300 games, alternating who goes first:

| Match-up | Win rate of the stronger level |
|---|---|
| Normal vs Easy | 83% |
| Hard vs Normal | 75% |
| Hard vs Easy | 95% |

Easy ignores nobles and blocking and plays random moves now and then; Normal plays the same evaluation but takes the 2nd or 3rd best move 30% of the time; Hard never slips and also denies cards that opponents can afford.

The same Easy / Normal / Hard picker exists in **Hedgerow**, **Ghosts** and **Ascent**. They use the same approach (hand-written evaluation, weights tuned by self-play in a headless page, Easy = random-ish, Normal = full evaluation with occasional slips, Hard = no slips plus a short look-ahead). Measured self-play win rates of the stronger level:

| Game | Normal vs Easy | Hard vs Normal |
|---|---|---|
| Hedgerow | 100% | 80% |
| Ghosts | 75% | 68% (Hard vs Easy 94%) |
| Ascent | 100% | 85% |

In Ghosts the computer arranges and plays its own ghosts, but it never reads yours; it only sees what a human opponent would see.

## Putting it on GitHub Pages

1. Make sure `shared/firebase-config.js` has your own keys (it is not part of updates from this assistant).
2. Upload everything in this folder to the repository root of `simple-games-dev/simple-games` (keep the folder structure), or from a terminal in this folder:
   ```
   git add -A
   git commit -m "Midnight redesign, colours, bots, reactions"
   git push
   ```
3. Repository **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`.
4. Open https://simple-games-dev.github.io/simple-games/ after about a minute. Hard-refresh once so the new service worker takes over.
