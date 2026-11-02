/* Script commun : garde de connexion, en-tête, effets, pages de classe générées depuis catalogue.js.
   Chaque page déclare sur <body> :
     data-racine="./" ou "../"   (chemin vers la racine du site)
     data-page="accueil" | "classe" | "connexion" | "prof" | "voir"
     data-classe="terminale-sti2d" (pages de classe uniquement)              */

(function () {
  /* onglets : sous-parties d'une classe (champ "onglet" du catalogue). Laisser [] si pas d'onglets.
     sequences : ordre d'affichage des séquences (les séquences sans ressource affichent « Bientôt »). */
  var CLASSES = [
    { id: "terminale-sti2d", nom: "Terminale STI2D", court: "Tle STI2D", code: "TLE", det: "2I2D · ITEC", couleur: "--c-sti2d",
      onglets: [ { id: "2i2d", nom: "2I2D" }, { id: "itec", nom: "ITEC" } ] },
    { id: "premiere-it", nom: "1ère IT", court: "1ère IT", code: "1RE", det: "Innovation technologique", couleur: "--c-it", onglets: [] },
    { id: "snt", nom: "SNT seconde", court: "SNT", code: "2DE", det: "Sciences numériques", couleur: "--c-snt", onglets: [],
      sequences: [ "Séquence 1 · Renseignement & découverte de la SNT", "Thème 0 · Python", "Thème 1 · Les réseaux sociaux",
                   "Thème 2 · Le Web", "Thème 3 · Internet", "Thème 4 · La géolocalisation" ] },
    { id: "bts-maintenance", nom: "BTS maintenance", court: "BTS MS", code: "BTS", det: "MS · ETLV", couleur: "--c-bts", onglets: [] }
  ];
  window.TH_CLASSES = CLASSES;
  var TYPES = { activite: "Activité", td: "TD", pdf: "PDF", video: "Vidéo", lien: "Lien" };
  var LOGO = '<svg width="15" height="14" viewBox="0 0 34 30" fill="none" stroke="#ededf0" stroke-width="3" stroke-linejoin="round"><path d="M3 28V14a14 11 0 0 1 28 0v14"/><path d="M11 28V18h12v10"/></svg>';
  window.TH_LOGO = LOGO;

  var body = document.body;
  var racine = body.getAttribute("data-racine") || "./";
  var page = body.getAttribute("data-page") || "";
  var classeCourante = body.getAttribute("data-classe") || "";
  var catalogue = Array.isArray(window.CATALOGUE) ? window.CATALOGUE : [];
  function infosClasse(id) { return CLASSES.filter(function (c) { return c.id === id; })[0]; }
  function couleurVar(id) { var c = infosClasse(id); return c ? "var(" + c.couleur + ")" : "var(--accent)"; }

  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "texte") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (enfants || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  window.TH_el = el;

  function lienRessource(r) {
    if (/^https?:\/\//.test(r.fichier)) return r.fichier;
    return racine + "voir.html?r=" + encodeURIComponent(r.classe + "/" + r.fichier);
  }

  /* ---------- Effets : halo qui suit la souris + petit éclat au clic ---------- */
  function effets() {
    document.addEventListener("pointermove", function (e) {
      var c = e.target.closest && e.target.closest(".carte"); if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cv = el("canvas", { id: "th-fx", "aria-hidden": "true" }); body.appendChild(cv);
    var cx = cv.getContext("2d"), parts = [], dpr = 1, actif = false;
    function taille() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px"; }
    window.addEventListener("resize", taille); taille();
    function couleur(t) {
      var c = t && t.closest && t.closest("[data-c]");
      var v = c ? getComputedStyle(document.documentElement).getPropertyValue(c.getAttribute("data-c")).trim() : "";
      return v || "#5b8cff";
    }
    document.addEventListener("pointerdown", function (e) {
      var col = couleur(e.target);
      parts.push({ anneau: true, x: e.clientX, y: e.clientY, r: 2, vie: 1, c: col });
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2 + Math.random() * .5, v = 1.2 + Math.random() * 1.2;
        parts.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vie: 1, c: col });
      }
      if (!actif) { actif = true; requestAnimationFrame(boucle); }
    });
    function boucle() {
      cx.clearRect(0, 0, cv.width, cv.height);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        if (p.anneau) {
          p.r += 1.6; p.vie -= .06;
          cx.globalAlpha = Math.max(0, p.vie) * .45; cx.strokeStyle = p.c; cx.lineWidth = dpr;
          cx.beginPath(); cx.arc(p.x * dpr, p.y * dpr, p.r * dpr, 0, 7); cx.stroke();
        } else {
          p.vx *= .9; p.vy *= .9; p.x += p.vx; p.y += p.vy; p.vie -= .05;
          cx.globalAlpha = Math.max(0, p.vie) * .8; cx.fillStyle = p.c;
          cx.beginPath(); cx.arc(p.x * dpr, p.y * dpr, 1.1 * dpr, 0, 7); cx.fill();
        }
        if (p.vie <= 0) parts.splice(i, 1);
      }
      if (parts.length) requestAnimationFrame(boucle); else { actif = false; cx.clearRect(0, 0, cv.width, cv.height); }
    }
  }

  /* ---------- En-tête ---------- */
  function construireEntete(acces) {
    var nav = el("nav", { class: "nav", "aria-label": "Classes" });
    var visibles = !acces ? [] : (acces.role === "prof" ? CLASSES
      : CLASSES.filter(function (c) { return c.id === acces.classe; }));
    visibles.forEach(function (c) {
      var a = el("a", { href: racine + c.id + "/index.html", texte: c.court });
      if (c.id === classeCourante) a.className = "actif";
      nav.appendChild(a);
    });
    if (acces && acces.role === "prof") {
      var p = el("a", { href: racine + "prof/index.html", texte: "Espace prof" });
      if (page === "prof") p.className = "actif";
      nav.appendChild(p);
    }
    var outils = el("div", { class: "tools" });
    if (acces) {
      var nom = ((acces.prenom || "") + " " + (acces.nom || "")).trim() || (acces.role === "prof" ? "Prof" : "");
      outils.appendChild(el("span", { class: "qui", style: "--c: " + (acces.role === "prof" ? "var(--accent)" : couleurVar(acces.classe)) },
        [el("i"), el("span", { texte: nom })]));
      var out = el("button", { class: "btn", type: "button", texte: "Déconnexion" });
      out.addEventListener("click", async function () {
        await TH.deconnexion(); location.href = racine + "connexion/index.html";
      });
      outils.appendChild(out);
    }
    var header = el("header", { class: "top" }, [
      el("div", { class: "top-in" }, [
        el("a", { class: "brand", href: racine + "index.html" }, [el("span", { class: "marque", html: LOGO }), document.createTextNode("Techno-Hangar")]),
        nav, outils
      ])
    ]);
    body.insertBefore(header, body.firstChild);
  }

  /* ---------- Accueil ---------- */
  function pageAccueil(acces) {
    if (acces.role !== "prof") { location.replace(racine + acces.classe + "/index.html"); return; }
    var grille = document.getElementById("classes");
    CLASSES.forEach(function (c) {
      grille.appendChild(el("a", { class: "carte niveau", href: racine + c.id + "/index.html",
        style: "--c: var(" + c.couleur + ")", "data-c": c.couleur }, [
        el("div", { class: "haut" }, [el("span", { class: "pastille" }, [el("i"), document.createTextNode(c.code)]), el("span", { class: "fl", texte: "↗" })]),
        el("div", {}, [el("div", { class: "nom", texte: c.nom }), el("div", { class: "det", texte: c.det })])
      ]));
    });
  }

  /* ---------- Page de classe ---------- */
  async function pageClasse(acces) {
    if (acces.role !== "prof" && acces.classe !== classeCourante) {
      location.replace(racine + acces.classe + "/index.html"); return;
    }
    var infos = infosClasse(classeCourante) || { nom: "", onglets: [], couleur: "--accent" };
    document.title = infos.nom + " · Techno-Hangar";
    var main = document.querySelector("main");
    main.style.setProperty("--c", "var(" + infos.couleur + ")");
    main.setAttribute("data-c", infos.couleur);
    var titre = document.getElementById("titre");
    titre.textContent = infos.nom;
    titre.parentNode.insertBefore(el("div", { class: "fil" }, [
      el("a", { href: racine + "index.html", texte: "Techno-Hangar" }), el("b", { texte: " / " }), document.createTextNode(infos.nom)]), titre);
    var bloc = el("div", { class: "classe-titre" }, [el("span", { class: "pastille" }, [el("i")])]);
    titre.parentNode.insertBefore(bloc, titre); bloc.appendChild(titre);

    var zone = document.getElementById("sequences");
    var barre = document.getElementById("onglets");
    var liste = catalogue.filter(function (r) { return r.classe === classeCourante; });
    var onglets = infos.onglets || [];
    var actif = null, progression = {};

    function ongletDepuisHash() {
      var h = (location.hash || "").replace("#", "");
      return onglets.some(function (o) { return o.id === h; }) ? h : (onglets[0] ? onglets[0].id : null);
    }
    function dessinerOnglets() {
      barre.innerHTML = "";
      if (!onglets.length) { barre.style.display = "none"; zone.style.marginTop = "2.4rem"; return; }
      onglets.forEach(function (o) {
        var b = el("button", { type: "button", class: "onglet" + (o.id === actif ? " actif" : ""),
          role: "tab", "aria-selected": o.id === actif ? "true" : "false", texte: o.nom });
        b.addEventListener("click", function () {
          actif = o.id;
          try { history.replaceState(null, "", "#" + o.id); } catch (e) { location.hash = o.id; }
          dessinerOnglets(); afficher();
        });
        barre.appendChild(b);
      });
    }
    function etatRessource(r) {
      var p = progression[r.classe + "/" + r.fichier];
      if (!p) return null;
      if (p.termine) {
        var t = p.score != null ? String(p.score).replace(".", ",") + " / 20" : "Terminé";
        return el("span", { class: "prog ok" }, [el("span", { class: "barre" }, [el("i", { style: "width:100%" })]), document.createTextNode(t)]);
      }
      var a = p.avancement != null ? Math.round(p.avancement) : null;
      return el("span", { class: "prog" }, [el("span", { class: "barre" }, [el("i", { style: "width:" + (a == null ? 8 : a) + "%" })]),
        document.createTextNode(a == null ? "Commencé" : a + " %")]);
    }
    function afficher() {
      zone.innerHTML = "";
      var vis = liste.filter(function (r) { return !actif || r.onglet === actif; });
      var ordre = actif ? [] : (infos.sequences || []).slice(), groupes = {};
      ordre.forEach(function (s) { groupes[s] = []; });
      vis.forEach(function (r) {
        if (!groupes[r.sequence]) { groupes[r.sequence] = []; ordre.push(r.sequence); }
        groupes[r.sequence].push(r);
      });
      if (!ordre.length) { zone.appendChild(el("div", { class: "vide", texte: "Les ressources arrivent bientôt." })); return; }
      ordre.forEach(function (s) {
        var grille = el("div", { class: "ressources" });
        if (!groupes[s].length) grille.appendChild(el("div", { class: "a-venir", texte: "Bientôt disponible" }));
        groupes[s].forEach(function (r) {
          var dispo = r.en_ligne && r.fichier;
          var etat = dispo ? etatRessource(r) : null;
          var bas = el("div", { class: "bas" }, [
            etat || el("span", { class: "badge", texte: TYPES[r.type] || r.type }),
            dispo ? el("span", { class: "btn" + (etat && !etat.classList.contains("ok") ? " primary" : ""),
                     texte: etat ? (etat.classList.contains("ok") ? "Revoir" : "Reprendre") : "Ouvrir" })
                  : el("span", { class: "bientot", texte: "Bientôt" })
          ]);
          var carte = dispo
            ? el("a", { class: "carte res", href: lienRessource(r), "data-c": infos.couleur }, [el("h3", { texte: r.titre }), bas])
            : el("div", { class: "carte res off" }, [el("h3", { texte: r.titre }), bas]);
          grille.appendChild(carte);
        });
        zone.appendChild(el("section", { class: "sequence" }, [ el("h2", { texte: s }), grille ]));
      });
    }
    actif = ongletDepuisHash();
    window.addEventListener("hashchange", function () { actif = ongletDepuisHash(); dessinerOnglets(); afficher(); });
    dessinerOnglets(); afficher();

    // Progression de l'élève (affichée sur les cartes)
    if (acces.role === "eleve") {
      try {
        var s = TH.session();
        var lignes = await TH.rest("progression?select=ressource,avancement,score,termine&eleve=eq." + s.user.id);
        lignes.forEach(function (l) { progression[l.ressource] = l; });
        afficher();
      } catch (e) {}
    }
  }

  /* ---------- Démarrage ---------- */
  async function demarrer() {
    effets();
    if (page === "connexion") { document.documentElement.classList.add("th-ok"); return; }
    var acces = await TH.garde(racine);
    construireEntete(acces);
    if (!acces) return;
    window.TH_ACCES = acces;
    if (page === "accueil") pageAccueil(acces);
    if (page === "classe") pageClasse(acces);
    if (page === "prof") {
      if (acces.role !== "prof") { location.replace(racine + "index.html"); return; }
      if (window.TH_PROF) window.TH_PROF(acces);
    }
    if (page === "voir" && window.TH_VOIR) window.TH_VOIR(acces);
  }
  demarrer();
})();
