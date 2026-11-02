/* Script commun : garde de connexion, en-tête, thème, pages de classe générées depuis catalogue.js.
   Chaque page déclare sur <body> :
     data-racine="./" ou "../"   (chemin vers la racine du site)
     data-page="accueil" | "classe" | "connexion" | "prof" | "voir"
     data-classe="terminale-sti2d" (pages de classe uniquement)              */

(function () {
  /* onglets : sous-parties d'une classe (champ "onglet" du catalogue). Laisser [] si pas d'onglets. */
  var CLASSES = [
    { id: "terminale-sti2d", nom: "Terminale STI2D", court: "Tle STI2D", couleur: "--c-sti2d",
      onglets: [ { id: "2i2d", nom: "2I2D" }, { id: "itec", nom: "ITEC" } ] },
    { id: "premiere-it", nom: "1ère IT", court: "1ère IT", couleur: "--c-it", onglets: [] },
    { id: "snt", nom: "SNT seconde", court: "SNT", couleur: "--c-snt", onglets: [],
      sequences: [ "Séquence 1 · Renseignement & découverte de la SNT", "Thème 0 · Python", "Thème 1 · Les réseaux sociaux",
                   "Thème 2 · Le Web", "Thème 3 · Internet", "Thème 4 · La géolocalisation" ] },
    { id: "bts-maintenance", nom: "BTS maintenance", court: "BTS MS", couleur: "--c-bts", onglets: [] }
  ];
  window.TH_CLASSES = CLASSES;
  var TYPES = { activite: "Activité", td: "TD", pdf: "PDF", video: "Vidéo", lien: "Lien" };

  var body = document.body;
  var racine = body.getAttribute("data-racine") || "./";
  var page = body.getAttribute("data-page") || "";
  var classeCourante = body.getAttribute("data-classe") || "";
  var catalogue = Array.isArray(window.CATALOGUE) ? window.CATALOGUE : [];

  /* ---------- Thème (clair / sombre) ---------- */
  function lireTheme() { try { return localStorage.getItem("th-theme"); } catch (e) { return null; } }
  function ecrireTheme(t) { try { localStorage.setItem("th-theme", t); } catch (e) {} }
  var themeSauve = lireTheme();
  if (themeSauve) document.documentElement.setAttribute("data-theme", themeSauve);
  function themeActuel() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "texte") n.textContent = attrs[k];
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
    var btnTheme = el("button", { class: "btn", type: "button", title: "Changer de thème" });
    function majBtnTheme() { btnTheme.textContent = themeActuel() === "dark" ? "☀" : "☾"; }
    btnTheme.addEventListener("click", function () {
      var t = themeActuel() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", t); ecrireTheme(t); majBtnTheme();
    });
    majBtnTheme();
    var outils = el("div", { class: "tools" }, [btnTheme]);
    if (acces) {
      var nom = ((acces.prenom || "") + " " + (acces.nom || "")).trim();
      if (nom) outils.appendChild(el("span", { class: "qui", texte: nom }));
      var out = el("button", { class: "btn", type: "button", texte: "Déconnexion" });
      out.addEventListener("click", async function () {
        await TH.deconnexion(); location.href = racine + "connexion/index.html";
      });
      outils.appendChild(out);
    }
    var header = el("header", { class: "top" }, [
      el("div", { class: "top-in" }, [
        el("a", { class: "brand", href: racine + "index.html", texte: "Techno-Hangar" }),
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
      grille.appendChild(el("a", { class: "niveau", href: racine + c.id + "/index.html",
        style: "--c: var(" + c.couleur + ")", texte: c.nom }));
    });
  }

  /* ---------- Page de classe ---------- */
  function pageClasse(acces) {
    if (acces.role !== "prof" && acces.classe !== classeCourante) {
      location.replace(racine + acces.classe + "/index.html"); return;
    }
    var infos = CLASSES.filter(function (c) { return c.id === classeCourante; })[0] || { nom: "", onglets: [] };
    document.title = infos.nom + " · Techno-Hangar";
    document.getElementById("titre").textContent = infos.nom;
    var zone = document.getElementById("sequences");
    var barre = document.getElementById("onglets");
    var liste = catalogue.filter(function (r) { return r.classe === classeCourante; });
    var onglets = infos.onglets || [];
    var actif = null;

    function ongletDepuisHash() {
      var h = (location.hash || "").replace("#", "");
      return onglets.some(function (o) { return o.id === h; }) ? h : (onglets[0] ? onglets[0].id : null);
    }
    function dessinerOnglets() {
      barre.innerHTML = "";
      if (!onglets.length) { barre.style.display = "none"; return; }
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
    function afficher() {
      zone.innerHTML = "";
      var vis = liste.filter(function (r) { return !actif || r.onglet === actif; });
      if (!vis.length && !(infos.sequences || []).length) { zone.appendChild(el("div", { class: "vide", texte: "Les ressources arrivent bientôt." })); return; }
      var ordre = (infos.sequences || []).slice(), groupes = {};
      ordre.forEach(function (s) { groupes[s] = []; });
      vis.forEach(function (r) {
        if (!groupes[r.sequence]) { groupes[r.sequence] = []; ordre.push(r.sequence); }
        groupes[r.sequence].push(r);
      });
      ordre.forEach(function (s) {
        var grille = el("div", { class: "ressources" });
        if (!groupes[s].length) grille.appendChild(el("div", { class: "vide", texte: "Bientôt disponible." }));
        groupes[s].forEach(function (r) {
          var dispo = r.en_ligne && r.fichier;
          var action = dispo
            ? el("a", { class: "btn primary", href: lienRessource(r), texte: "Ouvrir" })
            : el("span", { class: "bientot", texte: "Bientôt disponible" });
          grille.appendChild(el("article", { class: "res" + (dispo ? "" : " off") }, [
            el("h3", { texte: r.titre }),
            el("div", { class: "bas" }, [ el("span", { class: "badge", texte: TYPES[r.type] || r.type }), action ])
          ]));
        });
        zone.appendChild(el("section", { class: "sequence" }, [ el("h2", { texte: s }), grille ]));
      });
    }
    actif = ongletDepuisHash();
    window.addEventListener("hashchange", function () { actif = ongletDepuisHash(); dessinerOnglets(); afficher(); });
    dessinerOnglets(); afficher();
  }

  /* ---------- Démarrage ---------- */
  async function demarrer() {
    if (page === "connexion") { construireEntete(null); document.documentElement.classList.add("th-ok"); return; }
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
