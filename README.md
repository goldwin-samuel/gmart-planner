# G-Mart Planner v3 — Angular 19 · Ionic 8 · Capacitor 7

Grocery + money tracker for web and Android/iOS.

- **Shopping** – list, checkout, price history, shop and notes on every purchase, edit/delete anywhere
- **Money** – income entries, expense vs income, balance sheet (monthly + running balance), savings rate, charts
- **Bill scanner** – photo of a bill → items, prices, shop and date read automatically → categorised → you review/edit → approve
- **Dashboard / Insights** – budget ring, trends, category + shop breakdown, price alerts
- Offline-first sync with Google Sheets through an Apps Script backend

## 1. Backend (Google Apps Script) — do this first

The backend lives in [`backend/`](backend). It is an upgrade of your original script: same sheets and columns, so
existing users and data keep working. See the header of `backend/Code.gs` for everything that changed.

1. Open your script project → replace the code with `backend/Code.gs`.
   *Project Settings → "Show appsscript.json" → paste `backend/appsscript.json`.*
2. If the script is not bound to the spreadsheet, put its id in `SHEET_ID`.
3. Run `setup()` once from the editor and accept the permissions (creates the new **Purchases** and **Income** sheets).
4. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** (The web-app URL stays the same.)
5. *(Optional, recommended)* Better bill reading: Project Settings → Script properties → add `GEMINI_API_KEY`
   (free key from <https://aistudio.google.com/apikey>). Without it the scanner uses Google Drive OCR
   plus a text parser — it works, but a Gemini key reads messy/handwritten bills more accurately.

What you get in the sheet:

| Sheet | Contents |
|---|---|
| `Items` | one row per item (history now lives in `Purchases`) |
| **`Purchases`** | one readable row per purchase: date, item, category, qty, unit, total, unit price, **shop**, **notes** |
| **`Income`** | date, amount, source, note |

Old items whose history is still stored in `historyJson` are read as before and move to `Purchases` the first time
the app saves.

> **First account:** if the `Users` sheet is empty, the first person to register becomes the approved admin.
> Existing admins are unaffected.

## 2. Run the web app

```bash
npm install
npm start                 # http://localhost:4200
```

The Apps Script URL is in `src/environments/environment.ts` and `environment.prod.ts`.

## 3. Android app

### Build the APK in the cloud (no Android Studio needed)
1. Create a GitHub repo and push this project (see below).
2. GitHub → **Actions → Build Android APK** runs on every push (or press *Run workflow*).
3. Open the finished run → **Artifacts → gmart-planner-apk** → download `gmart-planner-debug.apk` and install it on your phone
   (allow "install unknown apps" once).
4. Tag a version (`git tag v3.0.0 && git push --tags`) to also publish the APK on the repo's *Releases* page.

```bash
git init -b main && git add -A && git commit -m "G-Mart Planner v3"
gh repo create gmart-planner --private --source=. --push      # or add the remote by hand
```

### Build locally
Needs JDK 21 and the Android SDK (Android Studio).

```bash
npm run build:prod
npx cap sync android
cd android && ./gradlew assembleDebug        # → android/app/build/outputs/apk/debug/app-debug.apk
# or: npx cap open android   and press ▶
```

The debug APK is signed with the debug key — fine for personal use. For the Play Store create a release keystore
and use `./gradlew bundleRelease`.

iOS: `npx cap add ios` on a Mac, then `npx cap open ios`.

## Bill scanner notes
- *Take photo* uses the camera on the phone; on desktop it opens the file picker.
- Photos are resized to ~1600px before upload, sent to **your** Apps Script, OCR'd, and deleted — nothing is stored.
- Lines that match an item already in your list reuse that item (and its category); new products create a new item
  and are auto-categorised from keywords (Dairy, Fruits, Vegetables, Grocery, Snacks, Beverages, Household, Personal Care).
- You can edit name / category / quantity / unit / amount, untick lines to skip them, add missing lines, and fix the
  shop and date before pressing **Approve & add**.

## Project layout
```
backend/Code.gs         Apps Script backend (+ appsscript.json)
src/app/core            api, auth, store (state + offline sync), analytics, categorizer, theme, files
src/app/pages           auth, tabs shell, dashboard, list, money, insights, item-detail, categories, settings, admin
src/app/modals          add item, record purchase, income, bill scanner, checkout, change password
src/app/shared          chart.js wrapper + chart builders
android/                Capacitor Android project (icons + splash generated)
.github/workflows       cloud APK build
```
