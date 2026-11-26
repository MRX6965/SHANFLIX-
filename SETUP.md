# SHANFLIX setup checklist

## 1. TMDB token (REQUIRED before deploying this version)
1. themoviedb.org → Settings → API → create a NEW "API Read Access Token" (the old one was public; delete it).
2. Vercel → Project → Settings → Environment Variables → add `TMDB_TOKEN` = the new token (Production + Preview). Redeploy.
3. Local testing needs `vercel dev` (plain `python -m http.server` has no /api).

## 2. Android signing (GitHub → Settings → Secrets → Actions)
ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD — values in `private/SECRETS-README.txt` (never commit `private/`).

## 3. Optional
- Cloud sync: run `supabase.sql` in Supabase, fill `config.js` (supabaseUrl, supabaseAnonKey).
- Analytics: set `plausibleDomain` in `config.js`.
- Broken-video reports and client errors appear in Vercel → Logs (search `SHANFLIX-REPORT`).
- Replace `CONTACT_EMAIL` in `privacy.html` and `dmca.html`.

## 4. Releasing a new APK
Raise `versionCode`/`versionName` in `android/app/build.gradle` and `app-version.json`, push; GitHub builds `SHANFLIX.apk`.
