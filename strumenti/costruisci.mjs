#!/usr/bin/env node
/* Rigenera assets/js/data.js a partire da contenuti/opere.json e dai
   file contenuti/<opera>-s<NN>e<NN>.md
   Uso:  node strumenti/costruisci.mjs                                    */
import fs from "node:fs";
import path from "node:path";

const radice = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dirContenuti = path.join(radice, "contenuti");
const opere = JSON.parse(fs.readFileSync(path.join(dirContenuti, "opere.json"), "utf8"));

/* --- legge i .md con intestazione chiave: valore fra --- --- */
function leggiEpisodio(file) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("Intestazione mancante in " + path.basename(file));
  const meta = {};
  for (const riga of m[1].split("\n")) {
    const i = riga.indexOf(":");
    if (i < 0) continue;
    const k = riga.slice(0, i).trim();
    let v = riga.slice(i + 1).trim();
    if (/^\d+$/.test(v)) v = Number(v);
    else if (v === "true" || v === "false") v = v === "true";
    meta[k] = v;
  }
  meta.riassunto = m[2].trim();
  return meta;
}

const catalogo = {};
for (const [id, o] of Object.entries(opere)) {
  catalogo[id] = { id, ...o, stagioni: [] };
  for (const [num, s] of Object.entries(o.stagioni || {}))
    catalogo[id].stagioni.push({ numero: Number(num), episodiTotali: s.episodiTotali || null, episodi: [] });
}

let n = 0;
for (const f of fs.readdirSync(dirContenuti).filter(f => f.endsWith(".md")).sort()) {
  const ep = leggiEpisodio(path.join(dirContenuti, f));
  const opera = catalogo[ep.opera];
  if (!opera) { console.warn("! opera sconosciuta:", ep.opera, "in", f); continue; }
  const numS = opera.tipo === "film" ? 0 : Number(ep.stagione);
  let st = opera.stagioni.find(s => s.numero === numS);
  if (!st) { st = { numero: numS, episodi: [] }; opera.stagioni.push(st); }
  const { opera: _o, stagione: _s, episodio, ...resto } = ep;
  st.episodi.push({ numero: Number(episodio), ...resto });
  n++;
}

for (const o of Object.values(catalogo)) {
  o.stagioni.sort((a, b) => a.numero - b.numero);
  o.stagioni.forEach(s => s.episodi.sort((a, b) => a.numero - b.numero));
  o.stagioni = o.stagioni.filter(s => s.episodi.length || s.episodiTotali);
}

const out = `/* ============================================================
   PLOTFLIX — catalogo iniziale (seed)
   FILE GENERATO da strumenti/costruisci.mjs — non modificarlo a mano.
   Le fonti sono contenuti/opere.json e contenuti/*.md
   ============================================================ */

const PLOTFLIX_SEED = ${JSON.stringify(Object.values(catalogo), null, 2)};
`;
fs.writeFileSync(path.join(radice, "assets", "js", "data.js"), out);
console.log(`data.js rigenerato — ${Object.keys(catalogo).length} opere, ${n} riassunti.`);
