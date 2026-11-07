/************************************************************
    G-MART PLANNER — GOOGLE APPS SCRIPT BACKEND  (v3)

    Drop-in upgrade of the original script:
      • Same sheets / columns (Users, Items, Settings, Categories) – existing data keeps working.
      • NEW  Purchases sheet  – one readable row per purchase, with Shop and Notes columns.
      • NEW  Income sheet     – income entries.
      • NEW  scanBill         – bill photo -> OCR -> items (Gemini if a key is set, else Drive OCR).
      • FIXED  approveUser had no caller check (anyone could approve themselves).
      • FIXED  writes accepted any userId (now must be an approved user).
      • FIXED  50,000-char cell limit on historyJson (history now lives in Purchases).
      • FIXED  dates being auto-converted by Sheets, settings race (no lock), slow init on every call.
      • Salted password hashes (legacy hashes still work and upgrade on next login) + login throttling.

    SETUP
      1. Paste this file as Code.gs; paste appsscript.json (Project Settings -> show manifest).
      2. If the script is NOT bound to your spreadsheet, put the spreadsheet id in SHEET_ID.
      3. Deploy -> New deployment -> Web app -> Execute as: Me, Access: Anyone.
         (Re-deploy as a NEW VERSION after every change; keep the same URL.)
      4. Optional, for the best bill scanning accuracy:
         Project Settings -> Script properties -> add  GEMINI_API_KEY  (free key from aistudio.google.com).
         Without it, scanning uses Google Drive OCR + a text parser (works, a bit less accurate).
************************************************************/

const SHEET_ID = ""; // leave blank if this script is bound to the spreadsheet
const USERS_SHEET = "Users";
const ITEMS_SHEET = "Items";
const SETTINGS_SHEET = "Settings";
const CATEGORIES_SHEET = "Categories";
const PURCHASES_SHEET = "Purchases";
const INCOME_SHEET = "Income";

const HISTORY_MARK = "@purchases"; // Items.historyJson value meaning "history lives in the Purchases sheet"
const ITEMS_HEAD = ["userId", "id", "name", "category", "active", "lastPrice", "lastUnit", "historyJson"];
const PURCHASE_HEAD = ["userId", "itemId", "item", "category", "date", "quantity", "unit", "total", "unitPrice", "shop", "notes"];
const INCOME_HEAD = ["userId", "id", "date", "amount", "source", "note"];
const MAX_IMAGE_B64 = 9 * 1024 * 1024;

/* ============================ infrastructure ============================ */

var _ss = null;
function ss_() {
  if (_ss) return _ss;
  _ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!_ss) throw new Error("Spreadsheet not found. Set SHEET_ID at the top of Code.gs.");
  return _ss;
}

/** Get a sheet, creating it (with header) on first use. */
function sheet_(name, header, seedRows) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight("bold");
    if (seedRows && seedRows.length) sh.getRange(2, 1, seedRows.length, seedRows[0].length).setValues(seedRows);
  }
  return sh;
}

/** Kept for compatibility / manual runs from the editor. */
function initSheets() {
  sheet_(USERS_SHEET, ["id", "name", "username", "passwordHash", "createdAt", "role", "approved"]);
  sheet_(ITEMS_SHEET, ITEMS_HEAD);
  sheet_(SETTINGS_SHEET, ["userId", "key", "value"]);
  sheet_(CATEGORIES_SHEET, ["id", "name"], [
    [generateId("c"), "Fruits"], [generateId("c"), "Vegetables"], [generateId("c"), "Dairy"],
    [generateId("c"), "Grocery"], [generateId("c"), "Snacks"], [generateId("c"), "Beverages"],
    [generateId("c"), "Household"], [generateId("c"), "Personal Care"],
  ]);
  sheet_(PURCHASES_SHEET, PURCHASE_HEAD);
  sheet_(INCOME_SHEET, INCOME_HEAD);
  return "ok";
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function rows_(sh, ncols) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, ncols).getValues();
}

/** Replace everything below the header with `rows` (single write). Text columns keep their literal value. */
function rewrite_(sh, ncols, rows, textCols) {
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, ncols).clearContent();
  if (!rows.length) return;
  const need = rows.length + 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  (textCols || []).forEach(function (c) { sh.getRange(2, c, rows.length, 1).setNumberFormat("@"); });
  sh.getRange(2, 1, rows.length, ncols).setValues(rows);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { try { lock.releaseLock(); } catch (e) {} }
}

function generateId(prefix) {
  return (prefix || "id") + "_" + Utilities.getUuid().replace(/-/g, "").substring(0, 12);
}
function nowIso() { return new Date().toISOString(); }
function s_(v) { return v === null || v === undefined ? "" : String(v); }
function num_(v) { const n = Number(v); return isFinite(n) ? n : 0; }

function fmtDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const t = s_(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.substring(0, 10);
  const d = new Date(t);
  return isNaN(d.getTime()) ? Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd") : Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

/* ============================ passwords ============================ */

function sha256hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"); }).join("");
}
/** Legacy (unsalted) hash – kept so existing accounts can still sign in. */
function hashPassword(password) { return sha256hex_(password); }
function hashSalted_(password, salt) { return "s1$" + salt + "$" + sha256hex_(salt + ":" + password); }
function newSalted_(password) { return hashSalted_(password, Utilities.getUuid().replace(/-/g, "").substring(0, 16)); }
function verifyPassword_(password, stored) {
  const st = s_(stored);
  if (st.indexOf("s1$") === 0) return hashSalted_(password, st.split("$")[1]) === st;
  return hashPassword(password) === st;
}

function throttled_(uname) { return Number(CacheService.getScriptCache().get("lf_" + uname) || 0) >= 8; }
function noteFail_(uname) {
  const c = CacheService.getScriptCache();
  c.put("lf_" + uname, String(Number(c.get("lf_" + uname) || 0) + 1), 600);
}
function clearFails_(uname) { CacheService.getScriptCache().remove("lf_" + uname); }

/* ============================ auth helpers ============================ */

function getRole(userId) {
  if (!userId) return null;
  const rows = rows_(sheet_(USERS_SHEET, ["id", "name", "username", "passwordHash", "createdAt", "role", "approved"]), 7);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === userId) return { role: s_(r[5]), approved: s_(r[6]).toLowerCase() === "true" };
  }
  return null;
}

/** Throws unless userId belongs to an approved user. */
function requireUser_(userId) {
  const u = getRole(userId);
  if (!u || !u.approved) throw new Error("Not authorised");
  return u;
}

/* ============================ router ============================ */

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    const body = JSON.parse(raw || "{}");
    switch (body.action) {
      case "registerUser": return respond(registerUser(body));
      case "loginUser": return respond(loginUser(body));
      case "approveUser": return respond(approveUser(body));
      case "saveItems": return respond(saveItems(body));
      case "saveIncome": return respond(saveIncome(body));
      case "saveSettings": return respond(saveSettings(body));
      case "saveCategory": return respond(saveCategory(body));
      case "getAllUsers": return respond(getAllUsers(body));
      case "changePassword": return respond(changePassword(body));
      case "scanBill": return respond(scanBill(body));
      default: return respond({ status: "error", message: "Unknown action" });
    }
  } catch (err) {
    return respond({ status: "error", message: err && err.message ? err.message : String(err) });
  }
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "";
    switch (action) {
      case "ping": return respond({ status: "success", version: 3 });
      case "getItems": return respond(getItems(e));
      case "getIncome": return respond(getIncome(e));
      case "getSettings": return respond(getSettings(e));
      case "getCategories": return respond(getCategories());
      default: return respond({ status: "error", message: "Unknown GET action" });
    }
  } catch (err) {
    return respond({ status: "error", message: err && err.message ? err.message : String(err) });
  }
}

/* ============================ users ============================ */

function registerUser(data) {
  const name = s_(data.name).trim(), username = s_(data.username).trim(), password = s_(data.password);
  if (!name || !username || !password) return { status: "error", message: "Missing fields" };
  if (password.length < 4) return { status: "error", message: "Password is too short" };

  return withLock_(function () {
    const sh = sheet_(USERS_SHEET, ["id", "name", "username", "passwordHash", "createdAt", "role", "approved"]);
    const uname = username.toLowerCase();
    const rows = rows_(sh, 7);
    for (let i = 0; i < rows.length; i++) {
      if (s_(rows[i][2]).trim().toLowerCase() === uname) return { status: "error", message: "Username already exists" };
    }
    const first = rows.length === 0; // the very first account becomes the approved admin
    sh.appendRow([generateId("u"), name, uname, newSalted_(password), nowIso(), first ? "admin" : "user", first ? "true" : "false"]);
    return { status: "success", message: first ? "Admin account created. You can sign in now." : "Registered. Waiting for admin approval." };
  });
}

function loginUser(data) {
  const username = s_(data.username).trim().toLowerCase(), password = s_(data.password);
  if (!username || !password) return { status: "error", message: "Missing login fields" };
  if (throttled_(username)) return { status: "error", message: "Too many attempts. Try again in 10 minutes." };

  const sh = sheet_(USERS_SHEET, ["id", "name", "username", "passwordHash", "createdAt", "role", "approved"]);
  const rows = rows_(sh, 7);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (s_(r[2]).trim().toLowerCase() === username && verifyPassword_(password, r[3])) {
      clearFails_(username);
      const approved = s_(r[6]).toLowerCase();
      if (approved !== "true") return { status: "error", message: "not_approved", user: { approved: r[6] } };
      if (s_(r[3]).indexOf("s1$") !== 0) sh.getRange(i + 2, 4).setValue(newSalted_(password)); // upgrade legacy hash
      return { status: "success", user: { id: r[0], name: r[1], username: r[2], role: r[5], approved: approved } };
    }
  }
  noteFail_(username);
  return { status: "error", message: "invalid" };
}

function changePassword(data) {
  const userId = data.userId, newPassword = s_(data.newPassword);
  if (!userId || !newPassword) return { status: "error", message: "Missing User ID or new password." };
  if (newPassword.length < 4) return { status: "error", message: "Password is too short" };
  requireUser_(userId);
  return withLock_(function () {
    const sh = sheet_(USERS_SHEET, ["id", "name", "username", "passwordHash", "createdAt", "role", "approved"]);
    const rows = rows_(sh, 7);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === userId) {
        sh.getRange(i + 2, 4).setValue(newSalted_(newPassword));
        return { status: "success", message: "Password successfully updated." };
      }
    }
    return { status: "error", message: "User not found." };
  });
}

function getAllUsers(data) {
  const me = getRole(data && data.userId);
  if (!me || me.role !== "admin" || !me.approved) return { status: "error", message: "Access denied. Only approved admins can view users." };
  const rows = rows_(sheet_(USERS_SHEET, ["id", "name", "username", "passwordHash", "createdAt", "role", "approved"]), 7);
  return {
    status: "success",
    users: rows.map(function (r) {
      return { id: r[0], name: r[1], username: r[2], role: r[5], approved: s_(r[6]).toLowerCase() === "true" };
    }),
  };
}

/** `userId` = the user to approve, `requestedBy` = the admin making the call (REQUIRED). */
function approveUser(data) {
  const target = data && data.userId, by = data && data.requestedBy;
  if (!target) return { status: "error", message: "userId required" };
  const admin = getRole(by);
  if (!admin || admin.role !== "admin" || !admin.approved) return { status: "error", message: "Access denied. Only approved admins can approve users." };
  return withLock_(function () {
    const sh = sheet_(USERS_SHEET, ["id", "name", "username", "passwordHash", "createdAt", "role", "approved"]);
    const rows = rows_(sh, 7);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === target) {
        sh.getRange(i + 2, 7).setValue("true");
        return { status: "success", message: "User approved" };
      }
    }
    return { status: "error", message: "User not found" };
  });
}

/* ============================ categories ============================ */

function categoriesSheet_() {
  return sheet_(CATEGORIES_SHEET, ["id", "name"], [
    [generateId("c"), "Fruits"], [generateId("c"), "Vegetables"], [generateId("c"), "Dairy"], [generateId("c"), "Grocery"],
    [generateId("c"), "Snacks"], [generateId("c"), "Beverages"], [generateId("c"), "Household"], [generateId("c"), "Personal Care"],
  ]);
}

function getCategories() {
  const categories = rows_(categoriesSheet_(), 2).map(function (r) { return { id: r[0], name: r[1] }; }).filter(function (c) { return c.name; });
  return { status: "success", categories: categories };
}

function saveCategory(data) {
  requireUser_(data && data.userId);
  const name = s_(data && data.name).trim();
  if (!name) return { status: "error", message: "Category name required" };
  return withLock_(function () {
    const sh = categoriesSheet_();
    const existing = rows_(sh, 2);
    for (let i = 0; i < existing.length; i++) {
      if (s_(existing[i][1]).trim().toLowerCase() === name.toLowerCase()) return { status: "error", message: "Category already exists" };
    }
    const id = generateId("c");
    sh.appendRow([id, name]);
    return { status: "success", category: { id: id, name: name } };
  });
}

/* ============================ items + purchases ============================ */

function purchasesFor_(userId) {
  const map = {};
  rows_(sheet_(PURCHASES_SHEET, PURCHASE_HEAD), 11).forEach(function (r) {
    if (r[0] !== userId) return;
    const qty = num_(r[5]), total = num_(r[7]);
    (map[r[1]] = map[r[1]] || []).push({
      date: fmtDate_(r[4]),
      quantity: qty,
      unit: s_(r[6]) || "unit",
      totalAmount: total,
      unitPrice: num_(r[8]) || (qty ? total / qty : 0),
      store: s_(r[9]) || undefined,
      note: s_(r[10]) || undefined,
    });
  });
  return map;
}

function getItems(e) {
  const userId = (e && e.parameter && e.parameter.userId) || (e && e.userId) || null;
  if (!userId) return { status: "error", message: "Missing userId" };
  requireUser_(userId);

  const buys = purchasesFor_(userId);
  const items = [];
  rows_(sheet_(ITEMS_SHEET, ITEMS_HEAD), 8).forEach(function (r) {
    if (r[0] !== userId) return;
    let history;
    const raw = s_(r[7]);
    if (raw === HISTORY_MARK) {
      history = buys[r[1]] || [];
    } else {
      try { history = JSON.parse(raw || "[]"); } catch (err) { history = []; } // legacy rows
    }
    history.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    const last = history[history.length - 1];
    items.push({
      id: r[1],
      name: r[2],
      category: r[3] || "Other",
      active: r[4] === true || s_(r[4]).toLowerCase() === "true",
      lastPrice: last ? last.unitPrice : r[5] || null,
      lastUnit: last ? last.unit : r[6] || "",
      history: history,
    });
  });
  return { status: "success", items: items };
}

function saveItems(data) {
  const userId = data && data.userId, items = data && data.items;
  if (!userId) return { status: "error", message: "Missing userId" };
  if (!Array.isArray(items)) return { status: "error", message: "Items must be an array" };
  requireUser_(userId);

  return withLock_(function () {
    const ish = sheet_(ITEMS_SHEET, ITEMS_HEAD);
    const psh = sheet_(PURCHASES_SHEET, PURCHASE_HEAD);

    const keepItems = rows_(ish, 8).filter(function (r) { return r[0] !== userId; });
    const keepBuys = rows_(psh, 11)
      .filter(function (r) { return r[0] !== userId; })
      .map(function (r) { r[4] = fmtDate_(r[4]); return r; });

    const itemRows = [], buyRows = [];
    items.forEach(function (it) {
      const id = it.id || generateId("i");
      const hist = (Array.isArray(it.history) ? it.history : []).slice().sort(function (a, b) {
        return s_(a.date) < s_(b.date) ? -1 : 1;
      });
      const last = hist[hist.length - 1];
      itemRows.push([
        userId, id, s_(it.name), it.category || "Other",
        it.active === true || it.active === "true" ? "TRUE" : "FALSE",
        last ? num_(last.unitPrice) : "", last ? s_(last.unit) : s_(it.lastUnit), HISTORY_MARK,
      ]);
      hist.forEach(function (h) {
        const qty = num_(h.quantity), total = num_(h.totalAmount);
        buyRows.push([
          userId, id, s_(it.name), it.category || "Other", fmtDate_(h.date), qty, s_(h.unit) || "unit",
          total, num_(h.unitPrice) || (qty ? total / qty : 0), s_(h.store), s_(h.note),
        ]);
      });
    });

    rewrite_(ish, 8, keepItems.concat(itemRows), []);
    rewrite_(psh, 11, keepBuys.concat(buyRows), [5]);
    return { status: "success" };
  });
}

/* ============================ income ============================ */

function getIncome(e) {
  const userId = (e && e.parameter && e.parameter.userId) || null;
  if (!userId) return { status: "error", message: "Missing userId" };
  requireUser_(userId);
  const income = [];
  rows_(sheet_(INCOME_SHEET, INCOME_HEAD), 6).forEach(function (r) {
    if (r[0] !== userId) return;
    income.push({ id: r[1], date: fmtDate_(r[2]), amount: num_(r[3]), source: s_(r[4]) || "Other", note: s_(r[5]) || undefined });
  });
  return { status: "success", income: income };
}

function saveIncome(data) {
  const userId = data && data.userId, list = data && data.income;
  if (!userId) return { status: "error", message: "Missing userId" };
  if (!Array.isArray(list)) return { status: "error", message: "income must be an array" };
  requireUser_(userId);
  return withLock_(function () {
    const sh = sheet_(INCOME_SHEET, INCOME_HEAD);
    const keep = rows_(sh, 6).filter(function (r) { return r[0] !== userId; }).map(function (r) { r[2] = fmtDate_(r[2]); return r; });
    const mine = list
      .filter(function (i) { return num_(i.amount) > 0; })
      .map(function (i) { return [userId, i.id || generateId("inc"), fmtDate_(i.date), num_(i.amount), s_(i.source) || "Other", s_(i.note)]; });
    rewrite_(sh, 6, keep.concat(mine), [3]);
    return { status: "success" };
  });
}

/* ============================ settings ============================ */

function getSettings(e) {
  const userId = (e && e.parameter && e.parameter.userId) || null;
  if (!userId) return { status: "error", message: "Missing userId" };
  requireUser_(userId);
  const obj = {};
  rows_(sheet_(SETTINGS_SHEET, ["userId", "key", "value"]), 3).forEach(function (r) { if (r[0] === userId) obj[r[1]] = r[2]; });
  return { status: "success", settings: obj };
}

function saveSettings(data) {
  const userId = data && data.userId, settings = data && data.settings;
  if (!userId) return { status: "error", message: "Missing userId" };
  if (!settings || typeof settings !== "object") return { status: "error", message: "Invalid settings" };
  requireUser_(userId);
  return withLock_(function () {
    const sh = sheet_(SETTINGS_SHEET, ["userId", "key", "value"]);
    const keep = rows_(sh, 3).filter(function (r) { return r[0] !== userId; });
    const mine = Object.keys(settings).map(function (k) { return [userId, k, settings[k]]; });
    rewrite_(sh, 3, keep.concat(mine), []);
    return { status: "success" };
  });
}

/* ============================ bill scanning ============================ */

/**
 * body: { userId, image: <base64 JPEG/PNG, no prefix>, mime, categories: [..] }
 * returns: { status, engine, shop, date, total, items:[{name, qty, unit, amount, category}] }
 */
function scanBill(data) {
  requireUser_(data && data.userId);
  const b64 = s_(data.image).replace(/^data:[^,]+,/, "");
  if (!b64) return { status: "error", message: "No image received" };
  if (b64.length > MAX_IMAGE_B64) return { status: "error", message: "Image is too large. Try a smaller photo." };
  const mime = /^image\/(jpeg|png|webp)$/.test(s_(data.mime)) ? data.mime : "image/jpeg";
  const cats = (Array.isArray(data.categories) ? data.categories : []).map(s_).filter(Boolean).slice(0, 40);

  const key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  let aiError = "";
  if (key) {
    try {
      const out = geminiScan_(key, b64, mime, cats);
      if (out.items.length) return Object.assign({ status: "success", engine: "gemini" }, out);
      aiError = "AI found no line items";
    } catch (err) {
      aiError = err && err.message ? err.message : String(err);
      console.error("Gemini scan failed: " + aiError);
    }
  }
  const text = driveOcr_(b64, mime);
  const out = parseReceiptText_(text);
  const res = Object.assign({ status: "success", engine: "ocr" }, out);
  if (aiError) res.note = "AI scan unavailable (" + aiError + "); used basic OCR.";
  if (!out.items.length) {
    res.note = (res.note ? res.note + " " : "") + "No line items detected. Add them manually.";
    res.raw = s_(text).substring(0, 1200);
  }
  return res;
}

/** Ordered list of Gemini models to try: pinned model, else discovered (stable newest first) + safe fallbacks. */
function geminiModels_(key, forceDiscover) {
  const fixed = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL");
  if (fixed) return [fixed];
  const cache = CacheService.getScriptCache();
  if (!forceDiscover) {
    const hit = cache.get("gm_gemini_models");
    if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  }
  let list = [], lite = [];
  try {
    const r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": key }, muteHttpExceptions: true,
    });
    if (r.getResponseCode() === 200) {
      const all = (JSON.parse(r.getContentText()).models || []).filter(function (m) {
        return (m.supportedGenerationMethods || []).indexOf("generateContent") >= 0 &&
          /gemini-[\d.]+-flash/i.test(m.name) &&
          !/(image|tts|live|audio|thinking|exp|robotics|computer|embedding|native)/i.test(m.name);
      });
      const score = function (m) {
        const v = (m.name.match(/gemini-([\d.]+)-flash/i) || [0, "0"])[1];
        return parseFloat(v) * 10 + (/preview/i.test(m.name) ? 0 : 5);
      };
      all.sort(function (a, b) { return score(b) - score(a); });
      const nm = function (m) { return m.name.replace(/^models\//, ""); };
      list = all.filter(function (m) { return !/lite/i.test(m.name); }).map(nm);
      lite = all.filter(function (m) { return /lite/i.test(m.name); }).map(nm);
    }
  } catch (e) {}
  // two newest regular models, then the newest lite model (less busy, bigger free quota), then a safe alias
  const out = list.slice(0, 2);
  if (lite.length) out.push(lite[0]);
  if (out.indexOf("gemini-flash-latest") < 0) out.push("gemini-flash-latest");
  cache.put("gm_gemini_models", JSON.stringify(out), 21600);
  return out;
}

/** Used by listGeminiModels(); returns the first model the scanner will try. */
function pickGeminiModel_(key, forceDiscover) { return geminiModels_(key, forceDiscover)[0]; }

function geminiScan_(key, b64, mime, cats) {
  const started = Date.now();
  const BUDGET_MS = 35000; // never start another attempt after this; the app waits ~2 minutes in total
  const errors = [];
  let models = geminiModels_(key, false).slice(0, 4);
  for (let i = 0; i < models.length; i++) {
    if (i > 0 && Date.now() - started > BUDGET_MS) break;
    try {
      return geminiCall_(key, b64, mime, cats, models[i]);
    } catch (err) {
      errors.push(err.message);
      const code = Number((String(err.message).match(/HTTP (\d{3})/) || [0, 0])[1]);
      if (code === 400 || code === 401 || code === 403) throw err; // bad key / request: other models will not help
      if (code === 404 && i === 0) models = geminiModels_(key, true).slice(0, 4); // model retired: rediscover
    }
  }
  throw new Error(errors[errors.length - 1] || "Gemini unavailable");
}

function geminiCall_(key, b64, mime, cats, model) {
  const prompt =
    "You read photos of retail bills / receipts. Return ONLY JSON: " +
    '{"shop": string, "date": "YYYY-MM-DD" or "", "total": number, "items": [{"name": string, "qty": number, "unit": string, "amount": number, "category": string}]}. ' +
    "Rules: one entry per purchased product. amount = final price paid for that line (qty x rate, after line discount). " +
    "qty defaults to 1. unit is one of kg,g,L,ml,unit,dozen,pack. Expand receipt abbreviations into readable product names. " +
    "Skip tax, GST, discount, subtotal, round-off, payment and change lines. " +
    "category must be exactly one of [" + cats.concat(["Other"]).join(", ") + "]. total = the bill's grand total. Dates are day-first (India) unless clearly otherwise.";
  const resp = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "post",
    contentType: "application/json",
    headers: { "x-goog-api-key": key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (resp.getResponseCode() !== 200) {
    let why = "";
    try { why = JSON.parse(resp.getContentText()).error.message || ""; } catch (e) {}
    throw new Error("HTTP " + resp.getResponseCode() + " (" + model + ") " + why.substring(0, 140));
  }
  const body = JSON.parse(resp.getContentText());
  const txt = body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts[0].text;
  if (!txt) throw new Error("empty AI response");
  const j = JSON.parse(String(txt).replace(/^```json|```$/g, "").trim());
  return {
    shop: s_(j.shop).trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(s_(j.date)) ? j.date : "",
    total: num_(j.total) || null,
    items: (Array.isArray(j.items) ? j.items : [])
      .map(function (it) {
        return { name: s_(it.name).trim(), qty: num_(it.qty) || 1, unit: normUnit_(it.unit), amount: num_(it.amount), category: s_(it.category) };
      })
      .filter(function (it) { return it.name && it.amount >= 0; }),
  };
}

/** OCR via Drive: upload the image converted to a Google Doc, read its text, delete it. Needs no Advanced Service. */
function driveOcr_(b64, mime) {
  const boundary = "gm" + Date.now();
  const meta = JSON.stringify({ name: "gmart-ocr-" + Date.now(), mimeType: "application/vnd.google-apps.document" });
  const head = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n--" + boundary + "\r\nContent-Type: " + mime + "\r\n\r\n";
  const tail = "\r\n--" + boundary + "--";
  const payload = Utilities.newBlob(head).getBytes().concat(Utilities.base64Decode(b64)).concat(Utilities.newBlob(tail).getBytes());
  const lang = PropertiesService.getScriptProperties().getProperty("OCR_LANG") || "en";
  const auth = { Authorization: "Bearer " + ScriptApp.getOAuthToken() };

  const up = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=" + lang + "&fields=id", {
    method: "post", contentType: "multipart/related; boundary=" + boundary, payload: payload, headers: auth, muteHttpExceptions: true,
  });
  if (up.getResponseCode() !== 200) {
    const body = up.getContentText();
    if (/SERVICE_DISABLED|has not been used|accessNotConfigured/i.test(body)) {
      throw new Error("Drive API is switched off for this script. In the Apps Script editor click Services (+) -> Drive API -> Add, then deploy a new version. (Or add a GEMINI_API_KEY script property.)");
    }
    if (up.getResponseCode() === 403 || up.getResponseCode() === 401) {
      throw new Error("Drive permission missing. Run setup() once and tick all permission boxes, then deploy a new version. Details: " + body.substring(0, 160));
    }
    throw new Error("OCR upload failed (" + up.getResponseCode() + "): " + body.substring(0, 160));
  }
  const id = JSON.parse(up.getContentText()).id;
  try {
    const ex = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + id + "/export?mimeType=text/plain", { headers: auth, muteHttpExceptions: true });
    if (ex.getResponseCode() !== 200) throw new Error("OCR export failed (" + ex.getResponseCode() + ")");
    return ex.getContentText();
  } finally {
    try { UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + id, { method: "delete", headers: auth, muteHttpExceptions: true }); } catch (e) {}
  }
}

function normUnit_(u) {
  const t = s_(u).toLowerCase().replace(/[^a-z]/g, "");
  if (/^(kg|kgs|kilo|kilos)$/.test(t)) return "kg";
  if (/^(g|gm|gms|gram|grams)$/.test(t)) return "g";
  if (/^(l|lt|ltr|ltrs|litre|litres|liter|liters)$/.test(t)) return "L";
  if (/^(ml|mls)$/.test(t)) return "ml";
  if (/^(dozen|doz|dz)$/.test(t)) return "dozen";
  if (/^(pack|pkt|packet|pk|box)$/.test(t)) return "pack";
  return "unit";
}

var MONTHS_ = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseDate_(line) {
  let m = line.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  m = line.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    const d = Number(m[1]), mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + d).slice(-2);
  }
  m = line.match(/(\d{1,2})[\s\-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.\-]*(\d{2,4})/i);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return y + "-" + ("0" + MONTHS_[m[2].toLowerCase()]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  }
  return "";
}

function money_(t) { return Number(String(t).replace(/,/g, "")); }

/** Heuristic receipt parser for plain OCR text. The user reviews and edits everything afterwards. */
function parseReceiptText_(text) {
  const lines = s_(text).split(/\r?\n/).map(function (l) { return l.replace(/[|_]+/g, " ").replace(/\s+/g, " ").trim(); }).filter(Boolean);
  const SKIP = /^(sub\s*-?\s*total|total|grand|net\b|amount|cash|card|upi|paytm|gpay|phonepe|change|balance|tax|gst|cgst|sgst|igst|vat|round|disc|saving|you\s*save|thank|visit|invoice|bill|receipt|tel|ph\b|phone|mob|gstin|fssai|cin\b|tin\b|date|time|cashier|counter|qty|item|description|particulars|rate|mrp|hsn|sl\b|s\.?no|www|http|email|address|customer|token|payment|tender|points|reward)/i;
  let shop = "", date = "", total = null;
  const items = [];

  for (let i = 0; i < Math.min(lines.length, 8) && !shop; i++) {
    const l = lines[i];
    if ((l.match(/[A-Za-z]/g) || []).length >= 6 && !SKIP.test(l) && !/\d{6,}/.test(l) && !parseDate_(l)) shop = l.replace(/[^A-Za-z0-9&'.\- ]/g, "").trim();
  }
  lines.forEach(function (l) { if (!date) date = parseDate_(l); });

  const TOTAL_STRONG = /(grand\s*total|net\s*(amount|payable)|total\s*(amount|payable|due)|amount\s*(due|payable)|bill\s*total)/i;
  lines.forEach(function (l) {
    const nums = l.match(/\d[\d,]*\.\d{2}|\d[\d,]*/g);
    if (!nums) return;
    const v = money_(nums[nums.length - 1]);
    if (TOTAL_STRONG.test(l)) total = v;
    else if (total === null && /^total\b/i.test(l)) total = v;
  });

  lines.forEach(function (l) {
    if (SKIP.test(l)) return;
    let t = l.replace(/^\s*\d{1,3}[.)]?\s+(?=[A-Za-z])/, ""); // leading serial number
    let xCount = null;
    const xm = t.match(/(\d+(?:\.\d+)?)\s*[x*@]\s*\d+(?:\.\d+)?/i); // "1.5 x 38.00" = qty x rate
    if (xm) { xCount = Number(xm[1]); t = t.replace(xm[0], " "); }

    const m = t.match(/^(.*?[A-Za-z].*?)\s+((?:\d+(?:\.\d+)?\s+){0,3})(\d{1,6}(?:,\d{3})*\.\d{2})\s*[A-Za-z]?$/);
    if (!m) return;
    let name = m[1].trim();
    const amount = money_(m[3]);
    const mids = (m[2] || "").trim().split(/\s+/).filter(Boolean).map(Number);

    // item count: explicit "n x rate", or a "qty rate amount" layout, or "Eggs 12 78.00"
    let count = xCount;
    if (count === null && mids.length >= 1) {
      // "rate qty amount": find the pair whose product equals the amount
      for (let a = 0; a < mids.length && count === null; a++) {
        for (let b = 0; b < mids.length; b++) {
          if (a !== b && mids[b] <= mids[a] && Number.isInteger(mids[b]) && mids[b] > 0 && mids[b] < 100 && Math.abs(mids[a] * mids[b] - amount) <= 1) { count = mids[b]; break; }
        }
      }
    }
    if (count === null && mids.length >= 2 && mids[0] > 0 && mids[0] < 100) count = mids[0];
    if (count === null && mids.length === 1 && Number.isInteger(mids[0]) && mids[0] > 1 && mids[0] < 100) count = mids[0];

    // loose measures (kg / L) become the quantity; g / ml sizes are pack sizes and stay in the name
    const meas = name.match(/(\d+(?:\.\d+)?)\s*(kgs?|ltrs?|litres?|liters?|l)\b/i);
    let qty = count || 1, unit = "unit";
    if (meas) {
      unit = normUnit_(meas[2]);
      qty = xCount !== null ? xCount : Number(meas[1]) * (count || 1);
      name = name.replace(meas[0], " ");
    }
    name = name.replace(/\b\d{5,}\b/g, "").replace(/[\d.,]+\s*$/, "").replace(/[*#]+/g, "").replace(/\s+/g, " ").trim();
    if ((name.match(/[A-Za-z]/g) || []).length < 2 || amount <= 0) return;
    if (total !== null && amount === total && /total/i.test(l)) return;
    items.push({ name: name, qty: qty, unit: unit, amount: amount, category: "" });
  });

  return { shop: shop, date: date, total: total, items: items };
}

/* ============================ editor self-test ============================ */

/** Run once from the editor to create all sheets and trigger the authorisation prompt. */
function setup() {
  initSheets();
  try { UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/about?fields=user", { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }); } catch (e) {}
  return "Sheets ready. Now deploy as a Web app.";
}

/** Quick check of the receipt parser without any API calls. */
function testParser() {
  const sample = "G-MART SUPERMARKET\nGSTIN 29ABCDE1234F1Z5\nDate: 05/11/2026\nAmul Toned Milk 1L  2  56.00  112.00\nBananas 1.2kg  72.00\nBasmati Rice 5kg  610.00\nSUB TOTAL 794.00\nCGST 0.00\nGRAND TOTAL 794.00";
  Logger.log(JSON.stringify(parseReceiptText_(sample), null, 1));
}

/** Run from the editor to see which Gemini models your key can use. */
function listGeminiModels() {
  const key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!key) { Logger.log("No GEMINI_API_KEY script property set"); return; }
  const r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": key }, muteHttpExceptions: true,
  });
  Logger.log("HTTP " + r.getResponseCode());
  if (r.getResponseCode() !== 200) { Logger.log(r.getContentText().substring(0, 400)); return; }
  JSON.parse(r.getContentText()).models
    .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf("generateContent") >= 0; })
    .forEach(function (m) { Logger.log(m.name); });
  Logger.log("Scanner will try, in order: " + geminiModels_(key, true).join(", "));
}
