# Plotflix

Sito statico (nessun database, nessun backend) che presenta **riassunti completi di episodi**
con la grafica di una piattaforma di streaming. Obiettivo: chiudere la storia leggendo,
invece di restare incollati al divano.

## Aprire il sito

Basta un doppio clic su `index.html`. Funziona anche da `file://`.
Per una prova più fedele: `python3 -m http.server 8000` e poi `http://localhost:8000`.

## Struttura

```
index.html          catalogo (hero + righe di card, ricerca, statistiche)
serie.html?id=...   pagina di un titolo: stagioni, elenco episodi, lettore
aggiungi.html       form pubblico per aggiungere un riassunto (+ esporta/importa JSON)
info.html           missione, valori, come funziona, cosa non siamo, FAQ
assets/css/style.css
assets/js/data.js   catalogo di partenza — GENERATO, non si modifica a mano
assets/js/app.js    logica condivisa: catalogo, lettore, form, localStorage
contenuti/          la vera fonte dei contenuti (vedi sotto)
strumenti/          script per generare il catalogo e per pulire i sottotitoli
```

## Come si aggiunge un riassunto

**Dal sito** (chiunque, senza account): `aggiungi.html`. Il contributo resta nel
`localStorage` del browser e compare subito nel catalogo. Dal form si esporta in JSON
e si reimporta altrove.

**Nel catalogo stabile** (quello che vede chiunque apra il sito):

1. crea `contenuti/<opera>-s<NN>e<NN>.md`, per esempio `contenuti/lucifer-s03e01.md`:

```markdown
---
opera: lucifer
stagione: 3
episodio: 1
titolo: Titolo italiano dell'episodio
titoloOriginale: Original Title
durata: 43
anno: 2017
finale: false
autore: Redazione Plotflix
fonte: Riassunto scritto sull'episodio (traccia dialoghi ITA)
data: 2026-08-23
---

### Prima sezione

Testo del riassunto. `###` fa un titoletto, `**doppio asterisco**` fa il grassetto.
```

2. se l'opera è nuova, aggiungila in `contenuti/opere.json`;
3. rigenera il catalogo:

```bash
node strumenti/costruisci.mjs
```

## Dai sottotitoli al riassunto

I file `.srt` sono un'ottima traccia per ricostruire cosa succede davvero in un episodio.
Per ripulirne uno e ottenere il testo leggibile:

```bash
node strumenti/srt2testo.mjs "percorso/episodio.srt" > /tmp/episodio.txt
```

Il riassunto poi si **scrive**, non si incolla: il testo dei sottotitoli è di chi l'ha
tradotto, il riassunto è un'opera nuova.

## Cosa manca (se un giorno servirà un backend)

I contributi pubblici sono per-browser: senza database non esiste un catalogo condiviso.
Le vie d'uscita, in ordine di fatica: file JSON scambiati a mano (già supportato) →
un repo con pull request → un backend vero con moderazione.
