# Firebase setup — Simple Games

## 0. Point the site at your new Firebase project
Create the project (e.g. `simple-games`), add a **Web app**, create a **Firestore database**, then copy the
`firebaseConfig` it shows you into **`shared/firebase-config.js`** (replace the `FIREBASE_CONFIG` block).
That one file is the only place the config lives — all six games read it, so there is nothing else to change.

## 1. Publish the rules
Firebase console → Build → Firestore Database → **Rules** → paste `firestore.rules` → **Publish**.

## 2. Restrict the API key to your website
Google Cloud Console → (select the same project) → APIs & Services → **Credentials** →
open "Browser key (auto created by Firebase)":
- **Application restrictions → Websites**, add:
  - `https://simple-games-dev.github.io/*`
  - `http://localhost:*/*` (only while developing; remove later)
- **API restrictions → Restrict key**, allow only: Cloud Firestore API, Firebase App Check API,
  Firebase Installations API, Token Service API (and Identity Toolkit API if you add anonymous sign-in).
Save. Changes take a few minutes. If a game stops connecting, check the browser console for a
"referer not allowed" or "API not enabled" message and adjust.

## 3. App Check (stronger than the referrer check)
Firebase console → Build → **App Check** → register your web app with **reCAPTCHA v3**
(create the site key at google.com/recaptcha/admin, domain `simple-games-dev.github.io`).
Leave Firestore in **Monitor** mode for a few days, then click **Enforce**.
The reCAPTCHA *site key* is public by design; keep the *secret key* only in the Firebase console.
Then paste the reCAPTCHA **site key** into `APP_CHECK_SITE_KEY` in `shared/firebase-config.js` — the shared code starts App Check for every game automatically as soon as that value is non-empty.

## 4. Budget alert
Google Cloud Console → Billing → Budgets & alerts → set a small monthly budget with email alerts.
