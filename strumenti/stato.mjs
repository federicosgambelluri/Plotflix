#!/usr/bin/env node
/* Genera stato.json leggendo il filesystem: per ogni episodio di ogni opera
   segna se il sottotitolo e' presente e se il riassunto e' stato scritto.
   Uso:  node strumenti/stato.mjs          -> rigenera e stampa il riepilogo
         node strumenti/stato.mjs --next   -> stampa solo il prossimo da fare */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOT = path.join(RADICE, "sottotitoli");
const CON = path.join(RADICE, "contenuti");

/* ordine di lavorazione deciso con l'utente:
   Lucifer per stagioni (6 poi 1), poi Breaking Bad a ritroso */
const PIANO = [
  { slug: "lucifer",      imdb: "4052886", stagione: 6, episodi: 10 },
  { slug: "lucifer",      imdb: "4052886", stagione: 1, episodi: 13 },
  { slug: "breaking-bad", imdb: "903747",  stagione: 4, episodi: 13 },
  { slug: "breaking-bad", imdb: "903747",  stagione: 3, episodi: 13 },
  { slug: "breaking-bad", imdb: "903747",  stagione: 2, episodi: 13 },
  { slug: "breaking-bad", imdb: "903747",  stagione: 1, episodi: 7  },
  /* gia' completate, tenute per il conteggio */
  { slug: "lucifer",      imdb: "4052886", stagione: 2, episodi: 18 },
  { slug: "lucifer",      imdb: "4052886", stagione: 3, episodi: 26 },
  { slug: "lucifer",      imdb: "4052886", stagione: 4, episodi: 10 },
  { slug: "lucifer",      imdb: "4052886", stagione: 5, episodi: 16 },
  { slug: "breaking-bad", imdb: "903747",  stagione: 5, episodi: 16 },
];

const pad = (n) => String(n).padStart(2, "0");
const nome = (slug, s, e) => `${slug}-s${pad(s)}e${pad(e)}`;

const stato = { aggiornato: new Date().toISOString(), opere: [] };
let daFare = null;

for (const blocco of PIANO) {
  const ep = [];
  for (let e = 1; e <= blocco.episodi; e++) {
    const base = nome(blocco.slug, blocco.stagione, e);
    const srt = fs.existsSync(path.join(SOT, base + ".srt"));
    const md  = fs.existsSync(path.join(CON, base + ".md"));
    ep.push({ episodio: e, id: base, sottotitolo: srt, riassunto: md });
    if (!md && !daFare) daFare = { ...blocco, episodio: e, id: base, sottotitolo: srt };
  }
  stato.opere.push({
    slug: blocco.slug, imdb: blocco.imdb, stagione: blocco.stagione,
    totale: blocco.episodi,
    sottotitoli: ep.filter(x => x.sottotitolo).length,
    riassunti:   ep.filter(x => x.riassunto).length,
    completa:    ep.every(x => x.riassunto),
    episodi: ep,
  });
}
stato.prossimo = daFare;

fs.writeFileSync(path.join(RADICE, "stato.json"), JSON.stringify(stato, null, 2));

if (process.argv.includes("--next")) {
  if (!daFare) { console.log("TUTTO COMPLETATO"); process.exit(0); }
  console.log(`${daFare.id} imdb=${daFare.imdb} stagione=${daFare.stagione} episodio=${daFare.episodio} srt=${daFare.sottotitolo ? "si" : "NO"}`);
  process.exit(0);
}

let tS = 0, tR = 0, tT = 0;
for (const o of stato.opere) {
  tS += o.sottotitoli; tR += o.riassunti; tT += o.totale;
  const barra = o.completa ? "COMPLETA" : `${o.riassunti}/${o.totale}`;
  console.log(`${o.slug.padEnd(13)} S${pad(o.stagione)}  srt ${String(o.sottotitoli).padStart(2)}/${String(o.totale).padEnd(2)}  riassunti ${barra}`);
}
console.log(`\nTOTALE  sottotitoli ${tS}/${tT}  ·  riassunti ${tR}/${tT}`);
console.log(daFare ? `PROSSIMO: ${daFare.id} (sottotitolo ${daFare.sottotitolo ? "presente" : "DA SCARICARE"})` : "PROSSIMO: nulla, tutto completato");
