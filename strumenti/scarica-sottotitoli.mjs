#!/usr/bin/env node
/* ============================================================
   Scarica i sottotitoli italiani di una serie dall'API ufficiale
   di OpenSubtitles (api.opensubtitles.com).

   Credenziali: strumenti/credenziali.local.json  (mai versionato)
     { "apiKey": "...", "username": "...", "password": "..." }
   oppure variabili d'ambiente OS_API_KEY / OS_USER / OS_PASS.

   Uso:
     node strumenti/scarica-sottotitoli.mjs --imdb 4052886 --stagione 3
     node strumenti/scarica-sottotitoli.mjs --imdb 4052886 --stagione 3 --da 1 --a 10
     node strumenti/scarica-sottotitoli.mjs --imdb 4052886 --stagione 3 --prova

   Note:
   - riprende da dove si era fermato: salta i file già scaricati
   - si ferma da solo quando la quota giornaliera è esaurita
   - i file finiscono in sottotitoli/<slug>-s<NN>e<NN>.srt
   ============================================================ */
import fs from "node:fs";
import path from "node:path";

const RADICE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR_SUB = path.join(RADICE, "sottotitoli");
const BASE = "https://api.opensubtitles.com/api/v1";
const UA = "Plotflix v1.0";

/* ---------- argomenti ---------- */
const arg = (nome, def = null) => {
  const i = process.argv.indexOf("--" + nome);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return !v || v.startsWith("--") ? true : v;
};
const IMDB      = arg("imdb");
const STAGIONE  = Number(arg("stagione"));
const DA        = Number(arg("da", 1));
const A         = Number(arg("a", 99));
const LINGUA    = arg("lingua", "it");
const SLUG      = arg("slug", "lucifer");
const PROVA     = !!arg("prova");        // cerca ma non scarica (non consuma quota)

if (!IMDB || !STAGIONE) {
  console.error("Uso: node strumenti/scarica-sottotitoli.mjs --imdb <id> --stagione <n> [--da 1] [--a 26] [--slug lucifer] [--prova]");
  process.exit(1);
}

/* ---------- credenziali ---------- */
let cred = {};
const fileCred = path.join(RADICE, "strumenti", "credenziali.local.json");
if (fs.existsSync(fileCred)) cred = JSON.parse(fs.readFileSync(fileCred, "utf8"));
/* Gli account possono essere uno solo (formato piatto) oppure piu' di uno
   nel campo "account": quando la quota di uno finisce si passa al successivo. */
const ACCOUNT = (Array.isArray(cred.account) && cred.account.length)
  ? cred.account
  : [{ apiKey:   process.env.OS_API_KEY || cred.apiKey,
       username: process.env.OS_USER    || cred.username,
       password: process.env.OS_PASS    || cred.password }];

let iAcc = 0;
let API_KEY = ACCOUNT[0].apiKey;

if (!API_KEY) {
  console.error(`
Manca la API key.

1. Crea un account gratuito su https://www.opensubtitles.com
2. Vai su https://www.opensubtitles.com/consumers e genera una API key
3. Scrivi strumenti/credenziali.local.json:

   {
     "apiKey": "LA_TUA_CHIAVE",
     "username": "il_tuo_utente",
     "password": "la_tua_password"
   }

   (il file è già in .gitignore e non lascia questa cartella)
`);
  process.exit(1);
}

const intestazioni = (extra = {}) => ({
  "Api-Key": API_KEY,
  "User-Agent": UA,
  "Accept": "application/json",
  "Content-Type": "application/json",
  ...extra
});

const attesa = ms => new Promise(r => setTimeout(r, ms));

async function chiamata(url, opzioni = {}, tentativi = 3) {
  for (let t = 1; t <= tentativi; t++) {
    const r = await fetch(url, opzioni);
    if (r.status === 429) {                       // troppe richieste
      const pausa = 2000 * t;
      console.log(`   ⏳ rate limit, aspetto ${pausa / 1000}s...`);
      await attesa(pausa);
      continue;
    }
    const testo = await r.text();
    let dati = null;
    try { dati = JSON.parse(testo); } catch { dati = { raw: testo }; }
    return { ok: r.ok, status: r.status, dati };
  }
  return { ok: false, status: 429, dati: { message: "rate limit persistente" } };
}

/* ---------- login (serve per la quota di download personale) ---------- */
let token = null;

async function accedi(i) {
  const a = ACCOUNT[i];
  if (!a || !a.apiKey) return false;
  API_KEY = a.apiKey;
  token = null;
  if (PROVA) return true;
  if (!a.username || !a.password) {
    console.log(`! account ${i + 1}: manca la password, resta solo la quota anonima.`);
    return true;
  }
  const r = await chiamata(`${BASE}/login`, {
    method: "POST",
    headers: intestazioni(),
    body: JSON.stringify({ username: a.username, password: a.password })
  });
  if (r.ok && r.dati.token) {
    token = r.dati.token;
    console.log(`✓ account ${i + 1}/${ACCOUNT.length}: ${a.username}` +
      (r.dati.user ? ` — download rimasti oggi: ${r.dati.user.allowed_downloads ?? "?"}` : ""));
  } else {
    console.log(`! login fallito per ${a.username} (${r.status}: ${r.dati.message || ""}).`);
  }
  return true;
}

/** passa all'account successivo; restituisce false se non ce ne sono altri */
async function cambiaAccount() {
  if (iAcc + 1 >= ACCOUNT.length) return false;
  iAcc++;
  console.log(`\n🔄 Quota finita, passo all'account ${iAcc + 1} di ${ACCOUNT.length}.`);
  await accedi(iAcc);
  return true;
}

await accedi(0);

fs.mkdirSync(DIR_SUB, { recursive: true });
const pad = n => String(n).padStart(2, "0");

let scaricati = 0, saltati = 0, falliti = [];

for (let ep = DA; ep <= A; ep++) {
  const nomeFile = `${SLUG}-s${pad(STAGIONE)}e${pad(ep)}.srt`;
  const destinazione = path.join(DIR_SUB, nomeFile);
  if (fs.existsSync(destinazione)) { saltati++; continue; }

  /* --- ricerca --- */
  const q = new URLSearchParams({
    parent_imdb_id: String(IMDB),
    season_number: String(STAGIONE),
    episode_number: String(ep),
    languages: LINGUA
  });
  const ric = await chiamata(`${BASE}/subtitles?${q}`, { headers: intestazioni() });
  if (!ric.ok) {
    console.log(`E${pad(ep)}  ✗ ricerca fallita (${ric.status}: ${ric.dati.message || ""})`);
    falliti.push(ep); await attesa(700); continue;
  }
  const risultati = (ric.dati.data || [])
    .filter(s => s.attributes?.files?.length)
    .sort((a, b) => (b.attributes.download_count || 0) - (a.attributes.download_count || 0));

  if (!risultati.length) {
    console.log(`E${pad(ep)}  — nessun sottotitolo ${LINGUA.toUpperCase()} trovato`);
    falliti.push(ep); await attesa(700); continue;
  }
  const scelto = risultati[0];
  const fileId = scelto.attributes.files[0].file_id;
  const etichetta = scelto.attributes.release || scelto.attributes.files[0].file_name || "";

  if (PROVA) {
    console.log(`E${pad(ep)}  ○ trovati ${risultati.length} — userei: ${etichetta}`);
    await attesa(400); continue;
  }

  /* --- download --- */
  const dl = await chiamata(`${BASE}/download`, {
    method: "POST",
    headers: intestazioni(token ? { Authorization: "Bearer " + token } : {}),
    body: JSON.stringify({ file_id: fileId })
  });

  if (!dl.ok || !dl.dati.link) {
    const msg = (dl.dati.message || "").toLowerCase();
    console.log(`E${pad(ep)}  ✗ download negato (${dl.status}: ${dl.dati.message || ""})`);
    if (msg.includes("quota") || msg.includes("limit") || dl.status === 406) {
      if (await cambiaAccount()) { ep--; continue; }   // riprova lo stesso episodio
      console.log("\n⛔ Quota esaurita su tutti gli account. Rilancia domani: riprende da qui.");
      break;
    }
    falliti.push(ep); await attesa(900); continue;
  }

  const contenuto = await fetch(dl.dati.link).then(r => r.text());
  fs.writeFileSync(destinazione, contenuto, "utf8");
  scaricati++;
  console.log(`E${pad(ep)}  ✓ ${nomeFile}  (${Math.round(contenuto.length / 1024)} KB` +
    (dl.dati.remaining != null ? `, restano ${dl.dati.remaining} download oggi` : "") + `)`);

  if (dl.dati.remaining === 0) {
    if (await cambiaAccount()) { await attesa(800); continue; }
    console.log("\n⛔ Ultimo download disponibile per oggi. Rilancia domani: riprende da qui.");
    break;
  }
  await attesa(1100);   // gentile con l'API
}

console.log(`\nFatto — scaricati: ${scaricati} · già presenti: ${saltati}` +
  (falliti.length ? ` · da riprovare: ${falliti.join(", ")}` : ""));
if (scaricati) console.log(`I file sono in sottotitoli/. Traccia leggibile: node strumenti/srt2testo.mjs sottotitoli/<file>.srt`);
