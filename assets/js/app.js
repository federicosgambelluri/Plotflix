/* ============================================================
   PLOTFLIX — logica condivisa (nessun backend, nessun database)
   ============================================================ */
const PF = (() => {
  const KEY_CONTRIB = "plotflix.contributi.v1";
  const KEY_LETTI   = "plotflix.letti.v1";

  /* ---------------- utility ---------------- */
  const slug = s => (s || "").toString().toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const esc = s => (s || "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const parole = t => (t || "").trim().split(/\s+/).filter(Boolean).length;
  const minutiLettura = t => Math.max(1, Math.round(parole(t) / 200));

  const jsonRead = (k, fb) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
  };
  const jsonWrite = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  };

  /* ---------------- contributi (localStorage) ---------------- */
  const getContributi = () => jsonRead(KEY_CONTRIB, []);
  const setContributi = list => jsonWrite(KEY_CONTRIB, list);
  const addContributo = c => {
    const list = getContributi();
    c.id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    c.data = c.data || new Date().toISOString().slice(0, 10);
    list.push(c);
    setContributi(list);
    return c;
  };
  const removeContributo = id => setContributi(getContributi().filter(c => c.id !== id));

  /* ---------------- letture (progresso) ---------------- */
  const getLetti = () => jsonRead(KEY_LETTI, {});
  const chiaveEp = (operaId, s, e) => `${operaId}|${s}|${e}`;
  const segnaLetto = (operaId, s, e, minuti, lettura) => {
    const l = getLetti();
    const k = chiaveEp(operaId, s, e);
    const gia = l[k];
    l[k] = { ts: Date.now(), min: minuti || 0, lettura: lettura || (gia && gia.lettura) || 0 };
    jsonWrite(KEY_LETTI, l);
    return !gia;                       // true se e' la prima lettura
  };
  const minutiRisparmiati = () =>
    Object.values(getLetti()).reduce((tot, v) => tot + (v.min || 0), 0);

  /** minuti effettivamente guadagnati: durata dell'episodio meno il tempo di lettura */
  const minutiGuadagnati = () =>
    Object.values(getLetti()).reduce((tot, v) => tot + Math.max(0, (v.min || 0) - (v.lettura || 0)), 0);

  /** 138 -> "2h 18m" */
  function durata(min) {
    min = Math.round(min);
    if (min < 60) return min + "m";
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  /* ---------------- catalogo (seed + contributi) ---------------- */
  function catalogo() {
    const cat = JSON.parse(JSON.stringify(typeof PLOTFLIX_SEED !== "undefined" ? PLOTFLIX_SEED : []));
    const byId = Object.fromEntries(cat.map(o => [o.id, o]));

    getContributi().forEach(c => {
      const id = slug(c.titolo);
      let opera = byId[id];
      if (!opera) {
        opera = {
          id, titolo: c.titolo, tipo: c.tipo || "serie", anno: Number(c.anno) || null,
          generi: (c.generi || "").toString().split(",").map(g => g.trim()).filter(Boolean),
          descrizione: "", stagioni: [], community: true
        };
        byId[id] = opera; cat.push(opera);
      }
      if (!opera.generi?.length && c.generi)
        opera.generi = c.generi.toString().split(",").map(g => g.trim()).filter(Boolean);
      if (!opera.anno && c.anno) opera.anno = Number(c.anno);

      const numS = opera.tipo === "film" ? 0 : (Number(c.stagione) || 1);
      let st = opera.stagioni.find(s => s.numero === numS);
      if (!st) { st = { numero: numS, episodi: [] }; opera.stagioni.push(st); }

      const numE = opera.tipo === "film" ? 0 : (Number(c.episodio) || 1);
      const nuovo = {
        numero: numE,
        titolo: c.titoloEpisodio || (opera.tipo === "film" ? c.titolo : `Episodio ${numE}`),
        durata: Number(c.durata) || null,
        riassunto: c.riassunto,
        autore: c.autore || "Anonimo",
        data: c.data,
        contributoId: c.id,
        community: true
      };
      const esistente = st.episodi.find(e => e.numero === numE);
      if (esistente) { (esistente.versioni = esistente.versioni || []).push(nuovo); }
      else { st.episodi.push(nuovo); }
    });

    cat.forEach(o => {
      o.stagioni.sort((a, b) => a.numero - b.numero);
      o.stagioni.forEach(s => s.episodi.sort((a, b) => a.numero - b.numero));
    });
    return cat;
  }

  const opera = id => catalogo().find(o => o.id === id);

  /** tutti gli episodi con riassunto, dal più recente */
  function episodiRecenti() {
    const out = [];
    catalogo().forEach(o => o.stagioni.forEach(s => s.episodi.forEach(e => {
      if (e.riassunto) out.push({ opera: o, stagione: s.numero, ep: e });
    })));
    return out.sort((a, b) => (b.ep.data || "").localeCompare(a.ep.data || ""));
  }

  const contaRiassunti = o =>
    o.stagioni.reduce((t, s) => t + s.episodi.reduce((x, e) => x + 1 + (e.versioni?.length || 0), 0), 0);

  /* ---------------- grafica ---------------- */
  function colori(o) {
    if (o.colori) return o.colori;
    let h = 0;
    for (const ch of o.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return [`hsl(${h} 62% 28%)`, `hsl(${(h + 28) % 360} 70% 9%)`];
  }

  function poster(o, { flag } = {}) {
    const [a, b] = colori(o);
    const n = contaRiassunti(o);
    const etichetta = `${o.tipo === "film" ? "Film" : "Serie TV"} · ${n} riassunt${n === 1 ? "o" : "i"}`;
    // se l'opera ha una copertina, la usa; altrimenti ricade sul poster generato
    if (o.copertina) {
      return `
        <div class="poster poster-img" style="background:linear-gradient(155deg,${a},${b})">
          <img src="${esc(o.copertina)}" alt="${esc(o.titolo)}" loading="lazy">
          ${flag ? `<div class="poster-flag">${esc(flag)}</div>` : ""}
          <div class="poster-type">${etichetta}</div>
        </div>`;
    }
    return `
      <div class="poster" style="background:linear-gradient(155deg,${a},${b})">
        <div class="poster-noise"></div>
        ${flag ? `<div class="poster-flag">${esc(flag)}</div>` : ""}
        <div class="poster-title">${esc(o.titolo)}</div>
        <div class="poster-type">${etichetta}</div>
      </div>`;
  }

  function card(o, opts = {}) {
    const n = contaRiassunti(o);
    return `
      <a class="card" href="serie.html?id=${encodeURIComponent(o.id)}">
        ${poster(o, opts)}
        <div class="card-hover">
          <div class="ch-title">${esc(o.titolo)}</div>
          <div class="ch-meta">
            <span class="badge-green">Leggibile</span>
            <span>${o.anno || ""}</span>
            <span>${n} riassunt${n === 1 ? "o" : "i"}</span>
          </div>
        </div>
      </a>`;
  }

  const cardAggiungi = (testo = "Manca qualcosa?<br>Scrivi tu un riassunto") => `
    <a class="card-add" href="aggiungi.html">
      <div class="plus">+</div><span>${testo}</span>
    </a>`;

  function riga(titolo, sottotitolo, contenutoHTML) {
    return `
      <section class="row">
        <div class="row-head">
          <h2>${esc(titolo)}</h2>
          ${sottotitolo ? `<span class="row-sub">${esc(sottotitolo)}</span>` : ""}
        </div>
        <div class="slider">${contenutoHTML}</div>
      </section>`;
  }

  /* ---------------- prosa ---------------- */
  function prosa(testo) {
    const blocchi = (testo || "").trim().split(/\n{2,}/);
    return blocchi.map(b => {
      const t = b.trim();
      if (t.startsWith("### ")) return `<h3>${esc(t.slice(4))}</h3>`;
      return `<p>${esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, " ")}</p>`;
    }).join("");
  }

  /* ---------------- navbar / footer ---------------- */
  function nav(attiva) {
    const link = (href, label) =>
      `<li><a href="${href}" class="${attiva === label ? "active" : ""}">${label}</a></li>`;
    return `
      <nav class="nav" id="nav">
        <a href="index.html" class="logo">PLOT<span>FLIX</span></a>
        <ul class="nav-links">
          ${link("index.html", "Catalogo")}
          ${link("index.html#serie", "Serie TV")}
          ${link("index.html#film", "Film")}
          ${link("info.html", "La nostra missione")}
          ${link("aggiungi.html", "Aggiungi un riassunto")}
        </ul>
        <div class="nav-right">
          <a class="risparmio" href="index.html#tempo" id="risparmio" title="Tempo di divano che ti sei ripreso">
            <span class="ico">⏳</span><b id="risparmio-val">0m</b>
          </a>
          <label class="search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
              <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
            </svg>
            <input type="search" id="q" placeholder="Titoli, generi..." aria-label="Cerca">
          </label>
          <a class="nav-cta btn-sm" href="aggiungi.html">+ Riassunto</a>
          <div class="avatar">P</div>
        </div>
      </nav>`;
  }

  const footer = () => `
    <footer class="footer">
      <div class="footer-inner">
        <p style="font-size:15px">Domande? Scrivile a chi ti ha convinto ad aprire l'ultima puntata alle 2 di notte.</p>
        <div class="flinks">
          <a href="info.html">La missione</a>
          <a href="info.html#valori">I valori</a>
          <a href="info.html#come-funziona">Come funziona</a>
          <a href="aggiungi.html">Aggiungi un riassunto</a>
          <a href="index.html">Catalogo</a>
          <a href="info.html#faq">Domande frequenti</a>
        </div>
        <p class="fnote">
          Plotflix non trasmette, ospita né collega contenuti video. Contiene riassunti scritti da
          persone, pensati per chiudere una storia senza restare incollati allo schermo.
          Titoli, marchi e opere citate appartengono ai rispettivi proprietari.
          Progetto indipendente, non affiliato a Netflix.
        </p>
        <p class="fnote">© ${new Date().getFullYear()} Plotflix — leggi la storia, riprenditi la serata.</p>
      </div>
    </footer>`;

  function montaChrome(attiva) {
    document.body.insertAdjacentHTML("afterbegin", nav(attiva));
    document.body.insertAdjacentHTML("beforeend", footer());
    const n = document.getElementById("nav");
    const onScroll = () => n.classList.toggle("scrolled", window.scrollY > 30);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });

    aggiornaContatore(false);

    const q = document.getElementById("q");
    if (q) {
      const inHome = !!document.getElementById("rows");
      q.addEventListener("input", e => {
        if (inHome && typeof window.filtraCatalogo === "function") window.filtraCatalogo(e.target.value);
      });
      q.addEventListener("keydown", e => {
        if (e.key === "Enter" && !inHome)
          location.href = "index.html?q=" + encodeURIComponent(e.target.value);
      });
    }
  }

  /* ---------------- reader ---------------- */
  function montaReader() {
    if (document.getElementById("reader")) return;
    document.body.insertAdjacentHTML("beforeend",
      `<div class="reader-overlay" id="reader"><div class="reader" id="reader-box"></div></div>`);
    const ov = document.getElementById("reader");
    ov.addEventListener("click", e => { if (e.target === ov) chiudiReader(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") chiudiReader(); });
  }

  function chiudiReader() {
    const ov = document.getElementById("reader");
    if (!ov) return;
    ov.classList.remove("open");
    document.body.style.overflow = "";
  }

  function apriReader(operaId, numS, numE, indiceVersione = 0, modo = "riassunto") {
    const o = opera(operaId); if (!o) return;
    const st = o.stagioni.find(s => s.numero === Number(numS)); if (!st) return;
    const base = st.episodi.find(e => e.numero === Number(numE)); if (!base) return;
    const versioni = [base, ...(base.versioni || [])];
    const ep = versioni[indiceVersione] || base;

    /* due modi di lettura: riassunto secco o racconto in stile libro */
    const haRacconto = !!ep.racconto;
    if (modo === "racconto" && !haRacconto) modo = "riassunto";
    const testo = modo === "racconto" ? ep.racconto : ep.riassunto;

    montaReader();
    const min = minutiLettura(testo);
    const etichetta = o.tipo === "film"
      ? "Film" : `Stagione ${st.numero} · Episodio ${ep.numero}${ep.finale ? " · Finale di stagione" : ""}`;
    const [ca, cb] = colori(o);

    const switcher = versioni.length > 1
      ? `<div style="margin-bottom:18px;display:flex;gap:8px;flex-wrap:wrap">
           ${versioni.map((v, i) => `<button class="btn btn-sm ${i === indiceVersione ? "btn-play" : "btn-info"}"
             onclick="PF.apriReader('${operaId}',${st.numero},${ep.numero},${i},'${modo}')">Versione ${i + 1} · ${esc(v.autore || "Anonimo")}</button>`).join("")}
         </div>` : "";

    const bottoneModo = (id, etichetta, sotto) => `
      <button class="btn btn-sm ${modo === id ? "btn-play" : "btn-info"}"
        onclick="PF.apriReader('${operaId}',${st.numero},${ep.numero},${indiceVersione},'${id}')"
        title="${sotto}">${etichetta}</button>`;

    const modi = haRacconto
      ? `<div class="modi-lettura">
           <span class="modi-label">Come vuoi leggerlo?</span>
           <div class="modi-bottoni">
             ${bottoneModo("riassunto", "Riassunto", "Cosa succede, in breve")}
             ${bottoneModo("racconto", "Racconto", "L'episodio narrato, con i dialoghi")}
           </div>
         </div>` : "";

    document.getElementById("reader-box").innerHTML = `
      <div class="reader-hero" style="background:linear-gradient(160deg,${ca},#141414)">
        <button class="reader-close" onclick="PF.chiudiReader()" aria-label="Chiudi">✕</button>
        <div class="reader-kicker">${esc(o.titolo)} · ${esc(etichetta)}</div>
        <h2>${esc(ep.titolo)}</h2>
        <div class="reader-meta">
          ${ep.titoloOriginale ? `<span>“${esc(ep.titoloOriginale)}”</span>` : ""}
          ${ep.durata ? `<span class="badge">${ep.durata} min di visione</span>` : ""}
          <span class="badge badge-red">${min} min di lettura</span>
          <span>${modo === "racconto" ? "Racconto" : "Riassunto"} di ${esc(ep.autore || "Anonimo")}</span>
        </div>
      </div>
      <div class="reader-body">
        ${switcher}
        ${modi}
        <div class="spoiler-wall" id="wall">
          <span><b style="color:#fff">Attenzione:</b> ${modo === "racconto"
            ? "questo è l'episodio raccontato per intero, finale compreso."
            : "questo è il riassunto completo, finale compreso."} È il punto.</span>
          <button class="btn btn-sm btn-play" onclick="PF.svela()">Mostra ${modo === "racconto" ? "il racconto" : "il riassunto"}</button>
        </div>
        <div class="prose ${modo === "racconto" ? "prose-racconto" : ""} blurred" id="prose">${prosa(testo)}</div>
        <div class="guadagno-ep">
          <span class="big">+${durata(Math.max(0, (ep.durata || 45) - min))}</span>
          <span>Hai chiuso questo episodio in <b style="color:#fff">${min} min</b> di lettura
          invece di <b style="color:#fff">${ep.durata || 45} min</b> di visione.<br>
          In totale ti sei ripreso <b class="js-guadagno" style="color:#46d369">0m</b>.</span>
        </div>
        <div class="reader-foot">
          <span>${ep.fonte ? esc(ep.fonte) : "Contributo della community"}${ep.data ? " · " + esc(ep.data) : ""}</span>
        </div>
      </div>`;

    document.getElementById("reader").classList.add("open");
    document.getElementById("reader").scrollTop = 0;
    document.body.style.overflow = "hidden";
    const nuova = segnaLetto(operaId, st.numero, ep.numero, ep.durata || 45, min);
    aggiornaContatore(nuova);
  }

  function svela() {
    document.getElementById("prose")?.classList.remove("blurred");
    document.getElementById("wall")?.remove();
  }

  /* ---------------- toast ---------------- */
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div"); t.id = "toast"; t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 3800);
  }

  /** aggiorna (e fa pulsare) tutti i contatori di tempo guadagnato in pagina */
  function aggiornaContatore(pulsa) {
    const g = minutiGuadagnati();
    document.querySelectorAll("#risparmio-val, .js-guadagno").forEach(el => {
      el.textContent = durata(g);
    });
    if (pulsa) {
      const box = document.getElementById("risparmio");
      if (box) {
        box.classList.remove("pulsa");
        void box.offsetWidth;
        box.classList.add("pulsa");
      }
    }
  }

  return {
    slug, esc, minutiLettura, prosa, colori, poster, card, cardAggiungi, riga, durata,
    catalogo, opera, episodiRecenti, contaRiassunti,
    getContributi, addContributo, removeContributo, setContributi,
    getLetti, chiaveEp, segnaLetto, minutiRisparmiati, minutiGuadagnati, aggiornaContatore,
    montaChrome, apriReader, chiudiReader, svela, toast
  };
})();
