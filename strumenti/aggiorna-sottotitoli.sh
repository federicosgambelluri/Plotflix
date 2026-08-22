#!/bin/bash
# Riprende il download dei sottotitoli finché le stagioni non sono complete.
# Pensato per essere lanciato una volta al giorno (agente launchd, vedi README).
# Si può anche eseguire a mano:  bash strumenti/aggiorna-sottotitoli.sh

PROGETTO="/Users/federicosgambelluri/Desktop/Plotflix"
NODE="/opt/homebrew/bin/node"
LOG="$PROGETTO/strumenti/log-download.txt"
IMDB=4052886   # Lucifer

cd "$PROGETTO" || exit 1
echo "=============== $(date '+%Y-%m-%d %H:%M') ===============" >> "$LOG"

# prima la stagione 3 (priorità), poi la 2: lo script salta i file già
# presenti e si ferma da solo quando la quota giornaliera è esaurita
"$NODE" strumenti/scarica-sottotitoli.mjs --imdb $IMDB --stagione 3 --da 1 --a 26 >> "$LOG" 2>&1
"$NODE" strumenti/scarica-sottotitoli.mjs --imdb $IMDB --stagione 2 --da 1 --a 18 >> "$LOG" 2>&1

MANCANTI3=$(( 26 - $(ls "$PROGETTO"/sottotitoli/lucifer-s03e*.srt 2>/dev/null | wc -l) ))
MANCANTI2=$(( 18 - $(ls "$PROGETTO"/sottotitoli/lucifer-s02e*.srt 2>/dev/null | wc -l) ))
echo "→ mancano ancora: stagione 3 = $MANCANTI3 · stagione 2 = $MANCANTI2" >> "$LOG"

if [ "$MANCANTI3" -le 0 ] && [ "$MANCANTI2" -le 0 ]; then
  echo "✓ Tutto scaricato: puoi disattivare l'agente giornaliero." >> "$LOG"
fi
