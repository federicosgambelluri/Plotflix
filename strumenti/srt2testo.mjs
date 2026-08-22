#!/usr/bin/env node
/* Converte un .srt in una traccia dialoghi pulita, pronta da leggere.
   Uso:  node strumenti/srt2testo.mjs percorso/file.srt [> out.txt]        */
import fs from "node:fs";

const file = process.argv[2];
if (!file) { console.error("Uso: node strumenti/srt2testo.mjs file.srt"); process.exit(1); }

let testo = fs.readFileSync(file, "utf8").replace(/\r/g, "").replace(/^﻿/, "");
const righe = [];
let ts = "";
for (const r of testo.split("\n")) {
  if (/^\d+$/.test(r.trim())) continue;
  const m = r.match(/^(\d{2}:\d{2}:\d{2})[,.]\d+\s*-->/);
  if (m) { ts = m[1]; continue; }
  const pulita = r.replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
  if (pulita) righe.push(ts + "  " + pulita);
}
console.log(righe.join("\n"));
