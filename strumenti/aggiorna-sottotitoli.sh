#!/bin/bash
# Scarica i sottotitoli seguendo una coda di priorita'.
# Ogni riga della coda e': <imdb> <slug> <stagione> <episodi>
# Lo script salta i file gia' presenti e si ferma quando la quota
# giornaliera di OpenSubtitles e' esaurita: il giorno dopo riprende.
#
# Lanciato una volta al giorno dall'agente launchd (vedi README),
# oppure a mano:  bash strumenti/aggiorna-sottotitoli.sh

PROGETTO="/Users/federicosgambelluri/Desktop/Plotflix"
NODE="/opt/homebrew/bin/node"
LOG="$PROGETTO/strumenti/log-download.txt"

# --- ORDINE DECISO: finire Lucifer (3, 2, 4, 5, 6, 1), poi Breaking Bad
#     dall'ultima stagione andando indietro (5, 4, 3, 2, 1) ---
CODA=(
  "4052886 lucifer 3 26"
  "4052886 lucifer 2 18"
  "4052886 lucifer 4 10"
  "4052886 lucifer 5 16"
  "4052886 lucifer 6 10"
  "4052886 lucifer 1 13"
  "903747 breaking-bad 5 16"
  "903747 breaking-bad 4 13"
  "903747 breaking-bad 3 13"
  "903747 breaking-bad 2 13"
  "903747 breaking-bad 1 7"
)

cd "$PROGETTO" || exit 1
echo "=============== $(date '+%Y-%m-%d %H:%M') ===============" >> "$LOG"

for RIGA in "${CODA[@]}"; do
  set -- $RIGA
  IMDB=$1; SLUG=$2; STAGIONE=$3; EPISODI=$4

  PRESENTI=$(ls "$PROGETTO"/sottotitoli/${SLUG}-s$(printf %02d $STAGIONE)e*.srt 2>/dev/null | wc -l | tr -d ' ')
  if [ "$PRESENTI" -ge "$EPISODI" ]; then
    echo "· $SLUG stagione $STAGIONE: gia' completa ($PRESENTI/$EPISODI)" >> "$LOG"
    continue
  fi

  echo "→ $SLUG stagione $STAGIONE: $PRESENTI/$EPISODI, scarico..." >> "$LOG"
  "$NODE" strumenti/scarica-sottotitoli.mjs --imdb $IMDB --slug $SLUG \
      --stagione $STAGIONE --da 1 --a $EPISODI >> "$LOG" 2>&1

  # se la quota e' finita lo script lo scrive nel log: fermiamoci qui
  if tail -20 "$LOG" | grep -q "Quota giornaliera esaurita\|Ultimo download disponibile"; then
    echo "⏸  Quota esaurita: riprendo domani da $SLUG stagione $STAGIONE." >> "$LOG"
    exit 0
  fi
done

echo "✓ Coda completata: non manca piu' nulla da scaricare." >> "$LOG"
