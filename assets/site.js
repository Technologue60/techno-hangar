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
      onglets: [
        { id: "revision", nom: "Révision de 1re", sequences: [ "0 · Révision de 1re" ] },
        { id: "2i2d", nom: "2I2D", defaut: true,
          sequences: [ "Thème 1 · Gérer la ville du futur", "Thème 2 · Comment sécuriser un bâtiment ?", "Thème 3 · Robotique", "Étude de système" ] },
        { id: "itec", nom: "ITEC",
          sequences: [ "1 · Force, couple & torseur", "2 · Statique", "3 · RDM" ] } ] },
    { id: "premiere-it", nom: "1ère IT", court: "1ère IT", code: "1RE", det: "Innovation technologique · ETLV", couleur: "--c-it",
      onglets: [
        { id: "it", nom: "Innovation technologique", defaut: true,
          sequences: [ "Séquence 1 · Représentation du réel", "Séquence 2 · Support téléphone",
                       "Projet 1 · Le casque connecté", "Projet 2", "Projet final" ] },
        { id: "etlv", nom: "ETLV",
          sequences: [ "Séance 1", "Séance 2", "Séance 3", "Séance 4 · Hydropower", "Séance 5" ] } ] },
    { id: "snt", nom: "SNT seconde", court: "SNT", code: "2DE", det: "Sciences numériques", couleur: "--c-snt", onglets: [],
      sequences: [ "Séquence 1 · Renseignement & découverte de la SNT", "Thème 0 · Python", "Thème 1 · Les réseaux sociaux",
                   "Thème 2 · Le Web", "Thème 3 · Internet", "Thème 4 · La géolocalisation" ] },
    { id: "bts-maintenance", nom: "BTS maintenance", court: "BTS MS", code: "BTS", det: "MS · ETLV", couleur: "--c-bts", onglets: [] }
  ];
  window.TH_CLASSES = CLASSES;
  /* Illustrations (traits fins, couleur de la classe). Utilisées par les champs « icone » et « groupe_icone » du catalogue. */
  var I = function (c) { return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + c + '</svg>'; };
  var FL = function (x1, y1, x2, y2) { var a = Math.atan2(y2 - y1, x2 - x1), l = 5;
    return '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + 'M' + x2 + ' ' + y2 + 'L' + (x2 - l * Math.cos(a - .45)).toFixed(1) + ' ' + (y2 - l * Math.sin(a - .45)).toFixed(1) +
      'M' + x2 + ' ' + y2 + 'L' + (x2 - l * Math.cos(a + .45)).toFixed(1) + ' ' + (y2 - l * Math.sin(a + .45)).toFixed(1) + '"/>'; };
  var ICONES = {
    forces: I('<rect x="16" y="18" width="16" height="12" rx="2"/>' + FL(4, 24, 15, 24) + FL(24, 6, 24, 17) + FL(33, 31, 43, 41) + '<circle cx="24" cy="24" r="1.4" fill="currentColor"/>'),
    pfs: I('<path d="M6 30h36"/><path d="M24 30l-6 10h12z"/>' + FL(10, 12, 10, 29) + FL(38, 12, 38, 29) + '<path d="M17 18a9 9 0 0 1 14 0" stroke-dasharray="2 3"/>'),
    echelle: I('<path d="M6 40h30"/><rect x="8" y="34" width="22" height="6" rx="1.5"/><path d="M14 34L38 8M19 34L42 11"/><path d="M19 28l5 3M23 24l5 3M27 19l5 3M31 15l5 3"/>'),
    structure: I('<path d="M6 8v34"/><path d="M6 12h30L6 34"/><path d="M6 12l12 10M18 12v10"/><circle cx="36" cy="12" r="1.6" fill="currentColor"/>' + FL(36, 14, 36, 30) + '<path d="M3 8v6M3 30v6" />'),
    moto: I('<circle cx="12" cy="30" r="6"/><circle cx="36" cy="30" r="6"/><path d="M12 30l8-10h8l8 10M20 20l-3-5h-4M28 20l3-6h5"/><path d="M8 42h32M14 42l4-6M34 42l-4-6"/>'),
    voiture: I('<path d="M5 32v-6l5-2 6-8h14l7 8 6 2v6z"/><circle cx="14" cy="33" r="4"/><circle cx="35" cy="33" r="4"/>' + FL(14, 44, 14, 38) + FL(35, 44, 35, 38) + '<circle cx="24" cy="27" r="1.4" fill="currentColor"/>' + FL(24, 28, 24, 36).replace('<path','<path stroke-dasharray="2 2"')),
    statgraph: I('<path d="M8 38l14-26 18 18z" stroke-dasharray="0"/>' + FL(8, 38, 21, 14) + FL(22, 12, 38, 28) + FL(40, 30, 10, 38) + '<circle cx="8" cy="38" r="1.6" fill="currentColor"/>'),
    portail: I('<path d="M6 40V12M42 40V12"/><path d="M6 14h36v20H6z"/><path d="M12 14v20M18 14v20M24 14v20M30 14v20M36 14v20"/><path d="M42 24h3"/>'),
    camera: I('<rect x="10" y="12" width="22" height="16" rx="3"/><circle cx="21" cy="20" r="5"/><path d="M32 17l8-4v14l-8-4"/><path d="M21 28v8M13 40h16"/>'),
    doc: I('<path d="M12 6h17l9 9v27H12z"/><path d="M29 6v9h9M17 24h14M17 30h14M17 36h9"/>'),
    web: I('<circle cx="24" cy="24" r="16"/><path d="M8 24h32M24 8c-6 6-6 26 0 32M24 8c6 6 6 26 0 32"/>'),
    quiz: I('<rect x="8" y="8" width="32" height="32" rx="4"/><path d="M14 18l3 3 5-6M26 18h8M14 30l3 3 5-6M26 30h8"/>'),
    casque: I('<path d="M8 30a16 16 0 0 1 32 0v3H8z"/><path d="M14 22c3-4 7-6 10-6M30 17l4 3M20 30v3M28 30v3"/><circle cx="38" cy="12" r="2.2" fill="currentColor"/><path d="M41.5 8.5a5 5 0 0 1 0 7M44.5 5.5a9 9 0 0 1 0 13"/>'),
    telephone: I('<rect x="17" y="6" width="14" height="24" rx="3"/><path d="M22 26h4"/><path d="M10 42h28M14 42l6-12h8l6 12"/>'),
    pompe: I('<circle cx="22" cy="26" r="11"/><circle cx="22" cy="26" r="4"/><path d="M33 26h9M22 15V6M18 6h8M6 26h5"/>')
  };
  window.TH_ICONES = ICONES;

  var TYPES = { activite: "Activité", td: "TD", pdf: "PDF", video: "Vidéo", lien: "Lien", outil: "Outil" };
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
    if (acces && acces.role === "collegue") {
      visibles.forEach(function (c) {
        var a = el("a", { href: racine + c.id + "/index.html", texte: c.court });
        if (c.id === classeCourante) a.className = "actif";
        nav.appendChild(a);
      });
      var sv = el("a", { href: racine + "prof/index.html#suivi", texte: "Suivi des élèves" });
      if (page === "prof") sv.className = "actif";
      nav.appendChild(sv);
      visibles = [];
    }
    visibles.forEach(function (c) {
      var a = el("a", { href: racine + c.id + "/index.html", texte: c.court });
      if (c.id === classeCourante) a.className = "actif";
      nav.appendChild(a);
    });
    if (acces && acces.role === "eleve") {
      var mp = el("a", { href: racine + "profil/index.html#pass", texte: "Mon pass" });
      if (page === "profil") mp.className = "actif";
      nav.appendChild(mp);
    }
    if (acces && acces.role === "prof") {
      var p = el("a", { href: racine + "prof/index.html", texte: "Espace prof" });
      if (page === "prof") p.className = "actif";
      nav.appendChild(p);
    }
    var outils = el("div", { class: "tools" });
    if (acces) {
      var nom = ((acces.prenom || "") + " " + (acces.nom || "")).trim() || (acces.role === "prof" ? "Prof" : "");
      var qui = el("span", { class: "qui", style: "--c: " + (acces.role === "prof" ? "var(--accent)" : couleurVar(acces.classe)) },
        [el("i"), el("span", { texte: nom })]);
      outils.appendChild(qui);
      if (acces.role === "eleve" && window.TH_BULLE) window.TH_BULLE(qui, acces);
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
    var grille = document.getElementById("classes");
    var enveloppe = document.getElementById("grille");
    var estEleve = acces.role === "eleve" && infosClasse(acces.classe);
    if (acces.role !== "prof" && !estEleve) { location.replace(racine + acces.classe + "/index.html"); return; }
    if (estEleve) {
      var m = infosClasse(acces.classe);
      if (acces.prenom) document.getElementById("salut").textContent = "Bonjour " + acces.prenom;
      grille.appendChild(el("a", { class: "carte niveau mon-cours", href: racine + m.id + "/index.html",
        style: "--c: var(" + m.couleur + ")", "data-c": m.couleur }, [
        el("div", { class: "haut" }, [el("span", { class: "pastille" }, [el("i"), document.createTextNode(m.code)]), el("span", { class: "fl", texte: "↗" })]),
        el("div", {}, [el("div", { class: "nom", texte: m.nom }), el("div", { class: "det", texte: m.det }),
          el("span", { class: "btn primary", texte: "Ouvrir mes cours" })])
      ]));
      reprendre(grille, acces, m);
    } else {
      enveloppe.classList.add("prof");
      CLASSES.forEach(function (c) {
        grille.appendChild(el("a", { class: "carte niveau", href: racine + c.id + "/index.html",
          style: "--c: var(" + c.couleur + ")", "data-c": c.couleur }, [
          el("div", { class: "haut" }, [el("span", { class: "pastille" }, [el("i"), document.createTextNode(c.code)]), el("span", { class: "fl", texte: "↗" })]),
          el("div", {}, [el("div", { class: "nom", texte: c.nom }), el("div", { class: "det", texte: c.det })])
        ]));
      });
    }
    if (window.TH_QUIZ) window.TH_QUIZ(document.getElementById("quiz"), acces);
    if (window.TH_ACCUEIL_PASS) window.TH_ACCUEIL_PASS(acces);
  }

  /* ---------- Accueil élève : reprendre là où on s'est arrêté ---------- */
  async function reprendre(zone, acces, m) {
    var bloc = el("div", { class: "carte reprendre", style: "--c: var(" + m.couleur + ")", "data-c": m.couleur });
    zone.appendChild(bloc);
    var res = catalogue.filter(function (r) { return r.classe === m.id && r.en_ligne && r.fichier && !/^https?:/.test(r.fichier) && r.type !== "lien" && r.type !== "outil"; });
    var prog = [];
    try { prog = await TH.rest("progression?select=ressource,avancement,termine,maj_le&eleve=eq." + TH.session().user.id + "&order=maj_le.desc"); } catch (e) {}
    var trouve = function (id) { return res.filter(function (r) { return r.classe + "/" + r.fichier === id; })[0]; };
    var enCours = prog.filter(function (p) { return !p.termine && trouve(p.ressource); }).slice(0, 3);
    var titre = "Reprendre là où tu t'es arrêté", liste = enCours.map(function (p) { return { r: trouve(p.ressource), p: p }; });
    if (!liste.length) {
      var vus = prog.map(function (p) { return p.ressource; });
      liste = res.filter(function (r) { return vus.indexOf(r.classe + "/" + r.fichier) < 0; }).slice(0, 3).map(function (r) { return { r: r }; });
      titre = "À découvrir";
    }
    if (!liste.length) { bloc.remove(); return; }
    bloc.appendChild(el("div", { class: "rep-titre", texte: titre }));
    liste.forEach(function (x) {
      var pct = x.p ? Math.round(Number(x.p.avancement) || 0) : 0;
      bloc.appendChild(el("a", { class: "rep-ligne", href: lienRessource(x.r) }, [
        x.r.icone && ICONES[x.r.icone] ? el("span", { class: "illu", html: ICONES[x.r.icone] }) : el("span", { class: "illu vide-illu" }),
        el("span", { class: "rep-txt" }, [el("b", { texte: x.r.titre }), el("small", { texte: x.r.sequence || "" })]),
        x.p ? el("span", { class: "prog" }, [el("span", { class: "barre" }, [el("i", { style: "width:" + Math.max(6, pct) + "%" })]), document.createTextNode(x.p.avancement != null ? pct + " %" : "Commencé")]) : null,
        el("span", { class: "btn" + (x.p ? " primary" : ""), texte: x.p ? "Reprendre" : "Ouvrir" })
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
    var collegue = acces.role === "collegue";
    if (collegue) {
      var autorisees = acces.ressources || [];
      liste = liste.filter(function (r) { return autorisees.indexOf(r.classe + "/" + r.fichier) >= 0; });
      onglets = onglets.filter(function (o) { return liste.some(function (r) { return r.onglet === o.id; }); })
                       .map(function (o) { return Object.assign({}, o, { sequences: [], defaut: false }); });
    }
    var actif = null, progression = {}, statuts = {};

    function ongletDepuisHash() {
      var h = (location.hash || "").replace("#", "");
      if (onglets.some(function (o) { return o.id === h; })) return h;
      var d = onglets.filter(function (o) { return o.defaut; })[0] || onglets[0];
      return d ? d.id : null;
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
    /* Statut de l'activité (script Supabase 03) : points à gagner, gagnés, révision, fermée */
    function statutRessource(r) {
      var s = statuts[r.classe + "/" + r.fichier];
      if (!s) return null;
      var puces = [];
      if (s.statut === "ferme") puces.push(el("span", { class: "pa-statut ferme", texte: "🔒 Fermée" + (s.ouvre_le && new Date(s.ouvre_le) > new Date() ? " · ouvre le " + new Date(s.ouvre_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "") }));
      else if (s.statut === "revision") puces.push(el("span", { class: "pa-statut", texte: "Révision · sans points" }));
      if (s.gagne != null) puces.push(el("span", { class: "pa-statut gagne", texte: "✓ +" + s.gagne + " pts" }));
      else if (s.type !== "activite" && s.statut === "ouvert") puces.push(el("span", { class: "pa-statut", texte: "Entraînement" }));
      return puces.length ? el("div", { class: "res-statut" }, puces) : null;
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
      var og = onglets.filter(function (o) { return o.id === actif; })[0];
      var ordre = collegue ? [] : ((og ? og.sequences : infos.sequences) || []).slice(), groupes = {};
      ordre.forEach(function (s) { groupes[s] = []; });
      vis.forEach(function (r) {
        if (!groupes[r.sequence]) { groupes[r.sequence] = []; ordre.push(r.sequence); }
        groupes[r.sequence].push(r);
      });
      if (!ordre.length) { zone.appendChild(el("div", { class: "vide", texte: "Les ressources arrivent bientôt." })); return; }
      function carteRessource(r) {
        var dispo = r.en_ligne && r.fichier;
        if (r.type === "outil") {
          var contenu = [
            r.icone && ICONES[r.icone] ? el("span", { class: "illu grande", html: ICONES[r.icone] }) : el("span", { class: "illu grande vide-illu" }),
            el("span", { class: "g-txt" }, [el("span", { class: "g-titre", texte: r.titre }),
              el("span", { class: "g-sous", texte: dispo ? (r.note || "Outil · s'ouvre directement") : "Bientôt disponible" })]),
            el("span", { class: "chevron", "aria-hidden": "true", texte: dispo ? "↗" : "" })
          ];
          return dispo
            ? el("a", { class: "carte outil", href: lienRessource(r), "data-c": infos.couleur }, contenu)
            : el("div", { class: "carte outil off" }, contenu);
        }
        var etat = dispo ? etatRessource(r) : null;
        var bas = el("div", { class: "bas" }, [
          etat || el("span", { class: "badge", texte: TYPES[r.type] || r.type }),
          dispo ? el("span", { class: "btn" + (etat && !etat.classList.contains("ok") ? " primary" : ""),
                   texte: etat ? (etat.classList.contains("ok") ? "Revoir" : "Reprendre") : "Ouvrir" })
                : el("span", { class: "bientot", texte: "Bientôt" })
        ]);
        var haut = el("div", { class: "res-haut" }, [
          r.icone && ICONES[r.icone] ? el("span", { class: "illu", html: ICONES[r.icone] }) : null,
          el("h3", { texte: r.titre })]);
        var stat = dispo ? statutRessource(r) : null;
        if (stat) haut = el("div", {}, [haut, stat]);
        var docs = null;
        if (r.documents && r.documents.length) {
          docs = el("div", { class: "docs-carte" });
          r.documents.forEach(function (d) {
            docs.appendChild(el("a", { class: "doc-lien", href: d.url, target: "_blank", rel: "noopener", texte: "📎 " + d.titre }));
          });
        }
        if (!dispo) return el("div", { class: "carte res off" + (docs ? " avec-docs" : "") }, [haut, docs, bas]);
        if (!docs) return el("a", { class: "carte res", href: lienRessource(r), "data-c": infos.couleur }, [haut, bas]);
        // Carte avec documents : liens séparés (pas de lien dans un lien)
        var carte = el("div", { class: "carte res cliquable", "data-c": infos.couleur, role: "link", tabindex: "0" }, [haut, docs, bas]);
        var aller = function () { location.href = lienRessource(r); };
        carte.addEventListener("click", function (e) { if (!e.target.closest(".doc-lien")) aller(); });
        carte.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.target.closest(".doc-lien")) aller(); });
        return carte;
      }
      function ouvertsLire() { try { return JSON.parse(localStorage.getItem("th-groupes") || "{}"); } catch (e) { return {}; } }
      function ouvertsEcrire(o) { try { localStorage.setItem("th-groupes", JSON.stringify(o)); } catch (e) {} }
      ordre.forEach(function (s) {
        var grille = el("div", { class: "ressources" });
        var bloc = el("div", { class: "seq-contenu" });
        if (!groupes[s].length) grille.appendChild(el("div", { class: "a-venir", texte: "Bientôt disponible" }));
        var vus = {};
        var morceau = null;
        groupes[s].forEach(function (r) {
          if (!r.groupe) {
            if (r.type === "outil") { morceau = null; bloc.appendChild(carteRessource(r)); return; }
            if (!morceau) { morceau = el("div", { class: "ressources" }); bloc.appendChild(morceau); }
            morceau.appendChild(carteRessource(r)); return;
          }
          morceau = null;
          if (vus[r.groupe]) return;
          vus[r.groupe] = true;
          var membres = groupes[s].filter(function (x) { return x.groupe === r.groupe; });
          var reels = membres.filter(function (x) { return x.fichier; });
          var dispo = reels.filter(function (x) { return x.en_ligne; }).length;
          var cle = classeCourante + "|" + s + "|" + r.groupe, ouverts = ouvertsLire();
          var icone = catalogue.filter(function (x) { return x.classe === classeCourante && x.groupe === r.groupe && x.groupe_icone; })
            .map(function (x) { return x.groupe_icone; })[0];
          var d = el("details", { class: "groupe", "data-c": infos.couleur });
          if (ouverts[cle]) d.setAttribute("open", "");
          var sous = reels.length ? (reels.length + " ressource" + (reels.length > 1 ? "s" : "") + (dispo < reels.length ? " · " + dispo + " en ligne" : "")) : "Bientôt disponible";
          d.appendChild(el("summary", {}, [
            icone && ICONES[icone] ? el("span", { class: "illu grande", html: ICONES[icone] }) : el("span", { class: "illu grande vide-illu" }),
            el("span", { class: "g-txt" }, [el("span", { class: "g-titre", texte: r.groupe }), el("span", { class: "g-sous", texte: sous })]),
            el("span", { class: "chevron", "aria-hidden": "true", texte: "›" })
          ]));
          var g = el("div", { class: "ressources g-corps" });
          if (!reels.length) g.appendChild(el("div", { class: "a-venir", texte: "Bientôt disponible" }));
          reels.forEach(function (x) { g.appendChild(carteRessource(x)); });
          d.appendChild(g);
          d.addEventListener("toggle", function () { var o = ouvertsLire(); if (d.open) o[cle] = 1; else delete o[cle]; ouvertsEcrire(o); });
          bloc.appendChild(d);
        });
        if (grille.childNodes.length) bloc.insertBefore(grille, bloc.firstChild);
        zone.appendChild(el("section", { class: "sequence" }, [ el("h2", { texte: s }), bloc ]));
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
    if (acces.role === "eleve" || acces.role === "prof") {
      try {
        statuts = (await TH.rpc("mes_activites")) || {};
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
      if (acces.role !== "prof" && acces.role !== "collegue") { location.replace(racine + "index.html"); return; }
      if (window.TH_PROF) window.TH_PROF(acces);
    }
    if (page === "profil" && window.TH_PAGE_PROFIL) window.TH_PAGE_PROFIL(acces);
    if (window.TH_PRESENCE && acces.role === "eleve" && page !== "voir") window.TH_PRESENCE.demarrer(acces);
    if (page === "voir" && window.TH_VOIR) window.TH_VOIR(acces);
  }
  demarrer();
})();
