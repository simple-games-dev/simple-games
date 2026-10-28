/* ==========================================================================
   Simple Games — the ONE place for project settings.
   Every game loads this file (via boot.js), so changing the Firebase project
   means editing only the values below.

   These values are not secrets: they identify the project to the browser.
   Real protection comes from Firestore rules, the API-key website restriction
   and App Check (see FIREBASE_SETUP.md).
   ========================================================================== */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBw9aB2u5Vhp31XVR0zj0kr-_XkroccrS8",
  authDomain: "ascent-game-92126.firebaseapp.com",
  projectId: "ascent-game-92126",
  storageBucket: "ascent-game-92126.firebasestorage.app",
  messagingSenderId: "1008951976944",
  appId: "1:1008951976944:web:074fe13ce558fe8f227335"
};
const FIREBASE_CONFIGURED = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";

// reCAPTCHA v3 *site* key for Firebase App Check ('' = App Check off). The site key is public by design.
const APP_CHECK_SITE_KEY = "";

// GIPHY key for the GIF button in chat ('' hides the GIF button).
const GIPHY_API_KEY = "zxakTJShqCYQYMtZXMEMD68HJ3QdJWT6";
