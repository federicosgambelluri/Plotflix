#!/usr/bin/env node
/* Traccia dialoghi compatta: una riga per battuta, marcatore di tempo
   ogni minuto. Uso: node strumenti/compatta.mjs sottotitoli/file.srt */
import fs from "node:fs";
const testo = fs.readFileSync(process.argv[2], "utf8").replace(/\r/g, "").replace(/^﻿/, "");
let ultimoMin = -1, out = [];
for (const blocco of testo.split(/\n\n+/)) {
  const righe = blocco.split("\n").filter(Boolean);
  const iTs = righe.findIndex(r => /-->/.test(r));
  if (iTs < 0) continue;
  const min = Number(righe[iTs].slice(3, 5)) + Number(righe[iTs].slice(0, 2)) * 60;
  const battuta = righe.slice(iTs + 1).join(" ")
    .replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/\s+/g, " ").trim();
  if (!battuta) continue;
  if (min !== ultimoMin) { out.push(`\n[${String(min).padStart(2, "0")}′]`); ultimoMin = min; }
  out.push(battuta);
}
console.log(out.join(" "));
