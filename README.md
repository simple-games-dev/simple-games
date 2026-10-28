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
