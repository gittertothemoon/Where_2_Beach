# Android Release Runbook — Where2Beach

Runbook one-time setup + ricorrente per publishing su Google Play Store.
Stato: **predisposto, non ancora pubblicato.**

## Stato attuale (precondizioni gia' fatte)

- `mobile/app.json` Android: `package=com.where2beach.mobile`, `versionCode=1`, permessi location, adaptive icons OK.
- `mobile/app.json` Android: intent filters per `https://where2beach.com/app/*` + `/register/*` con `autoVerify=true` e custom scheme `where2beach://`.
- `mobile/eas.json`: profile `production` con `android.buildType=app-bundle` (AAB richiesto da Play).
- `mobile/eas.json`: submit `production.android` con `track=internal`, `releaseStatus=draft`, `serviceAccountKeyPath=../google-play-service-account.json`.
- `public/.well-known/assetlinks.json`: file presente con placeholder SHA256 (da sostituire dopo prima build, vedi step 4).
- `vercel.json`: header `Content-Type: application/json` configurato per assetlinks.json.

## Step one-time (prima della prima submit)

### 1. Google Play Console

1. Creare account Google Play Developer (25 USD una tantum) con identita' coerente (vedi `docs/CODEX_WORKING_MEMORY.md` per scelte DSA — stesso profilo "individual"/non-trader fatto su App Store, oppure passaggio a organization).
2. Creare app "Where2Beach", package `com.where2beach.mobile`, default language `it-IT`, app type `App`, free.
3. Compilare il **Data Safety form** (analytics anonimi, location use, crowd reports come UGC).
4. Completare il **Content rating questionnaire** (PEGI/IARC, casual app, no UGC moderation issues).
5. Abilitare **Play App Signing** (default su new app).

### 2. Service account per EAS submit

1. Google Cloud Console → progetto associato all'account Play (o nuovo) → IAM → Service Accounts → Create.
2. Nome: `eas-play-publisher`, ruolo: nessuno a livello GCP.
3. Generare key JSON, scaricarla.
4. **Salvare come `google-play-service-account.json` nella ROOT del repo (NON in `mobile/`)** — gia' gitignored in `.gitignore`.
5. Play Console → Setup → API access → invitare il service account email con permessi `Release manager` su questa app.

### 3. Prima build production AAB

```bash
cd mobile
eas build --platform android --profile production
```

EAS genera il keystore al primo build (Play App Signing prende il sopravvento dopo upload del primo AAB). Il build esce come `.aab` pronto per Play.

### 4. Sostituire SHA256 in assetlinks.json (CRITICO per Universal Links)

Dopo che Play ha accettato il primo AAB:

1. Play Console → Release → Setup → App signing.
2. Copiare **App signing certificate SHA-256** (NON il "Upload certificate"; quello e' usato solo per firmare l'upload).
3. Sostituire `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in `public/.well-known/assetlinks.json` con il valore copiato (formato `XX:XX:XX:...`).
4. Commit + deploy Vercel.
5. Verificare con: `curl -I https://where2beach.com/.well-known/assetlinks.json` (deve essere `200`, `Content-Type: application/json`).
6. Test: `adb shell pm verify-app-links --re-verify com.where2beach.mobile` (su device Android).

> NB: senza questo step gli intent filters esistono ma Android **non auto-verifica** i link, quindi il sistema mostrera' il dialog "open with" invece di aprire direttamente l'app. Funziona ma e' degraded UX.

### 5. Submit Play Store (internal track per primo deploy)

```bash
cd mobile
eas submit --platform android --profile production
```

Track `internal` significa: solo i tester whitelistati su Play Console possono installare. Promozione a `closed/open testing` o `production` si fa da Play Console (no nuovo build serve).

### 6. Listing assets richiesti da Play

Da preparare separatamente (Codex sta gia' gestendo asset Instagram, riusare):

- App icon 512x512 PNG (gia' presente in `mobile/assets/`).
- Feature graphic 1024x500 PNG.
- Phone screenshots (almeno 2, max 8) — riusare quelle catturate da `tools/instagram/capture-app-screenshots.mjs` adattate al ratio richiesto.
- Short description (max 80 char), Full description (max 4000 char) — riusare copy iOS.
- Privacy policy URL: `https://where2beach.com/privacy/` (gia' live).

## Release ricorrente (dopo che internal e' verde)

1. Cambiare `mobile/app.json` Android `versionCode` (manuale ogni release).
2. `eas build --platform android --profile production`.
3. `eas submit --platform android --profile production` → finisce in `internal` come draft.
4. Da Play Console: promote release a track desiderato + submit per review pubblica.

## Allineamento landing copy Android (post-launch)

Quando Play e' live, sostituire in `public/landing/index.html`:

- Sezione hero (~riga 175-200) e sezione waitlist (~riga 770-790): rimuovere form email "Avvisami su Android", aggiungere link diretto Play badge.
- CTA tracking: introdurre `nav_store_android`, `hero_store_android`, `midpage_store_android`, `waitlist_store_android` (mirror dei nomi iOS gia' presenti).
- H2 "Su iOS, adesso. Android in arrivo." → "Su iOS e Android."
- Aggiornare meta description e og: rimuovere mention "App Store" esclusiva.

## Check pre-deploy

```bash
npm run check                           # lint + typecheck
npm run build                           # frontend
cd mobile && npm run typecheck          # mobile shell
curl -I https://where2beach.com/.well-known/assetlinks.json  # deve essere 200 application/json
```
