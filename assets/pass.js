/* pass.js · Pass de progression, points, classement de la question du jour, élèves en ligne.
   Tout est calculé par le serveur (script Supabase 03-pass-progression.sql) :
   la page ne fait qu'afficher. Si le script n'est pas encore installé, les blocs restent masqués. */
(function () {
  var RARETES = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };
  var SOURCES = { activite: "Activité", entrainement: "Entraînement", jeu: "Jeu", prof: "Bonus du prof" };
  function el() { return window.TH_el.apply(null, arguments); }
  function racine() { return document.body.getAttribute("data-racine") || "./"; }
  function absent(e) { return e && (e.status === 404 || e.code === "PGRST202" || /could not find|not find the function/i.test(e.message || "")); }
  function nb(n) { return Math.round(Number(n) || 0).toLocaleString("fr-FR"); }
  function dateCourte(d) { return new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); }
  function titreRessource(id) {
    var r = (window.CATALOGUE || []).filter(function (x) { return x.classe + "/" + x.fichier === id; })[0];
    return r ? r.titre : (id || "").split("/").pop();
  }

  /* ---------- Avatar : image si le prof en a mis une, sinon symbole sur un rond de couleur ---------- */
  function avatar(a, taille, prenom) {
    taille = taille || 40;
    var n = el("span", { class: "pa-avatar" + (a && a.rarete ? " r-" + a.rarete : ""), style: "--t:" + taille + "px;--ac:" + ((a && a.couleur) || "#2e2e36") });
    if (a && a.image) n.appendChild(el("img", { src: racine() + a.image.replace(/^\//, ""), alt: "" }));
    else n.textContent = (a && a.symbole) || (prenom ? prenom.charAt(0).toUpperCase() : "?");
    return n;
  }
  function puceRarete(r) { return el("span", { class: "pa-rar r-" + r, texte: RARETES[r] || r }); }

  /* ---------- Données ---------- */
  var cache = null;
  function charger(force) {
    if (cache && !force) return cache;
    cache = TH.rpc("mon_pass").catch(function (e) { cache = null; throw e; });
    return cache;
  }
  function trouver(p, id) { return (p.recompenses || []).filter(function (r) { return r.id === id; })[0]; }
  function saisonCourante(p) { return (p.saisons || []).filter(function (s) { return s.id === p.courante; })[0]; }
  function suivante(p) { var i = (p.saisons || []).indexOf(saisonCourante(p)); return i >= 0 ? p.saisons[i + 1] : null; }

  /* ---------- Une case de palier (la récompense est visible directement) ---------- */
  function casePalier(p, pl, saison) {
    var r = trouver(p, pl.recompense) || { nom: "—", type: "titre", rarete: "commun" };
    var etat = pl.debloque ? "obtenu" : (pl.en_attente ? "attente" : "avenir");
    var visuel = r.type === "avatar" ? avatar(r, 46) : el("span", { class: "pa-titre-ico", texte: r.nom === "???" ? "?" : "“ ”" });
    var reste = Math.max(0, pl.seuil - saison.points);
    var bas = etat === "obtenu" ? "Obtenu" : etat === "attente" ? "Dès le " + dateCourte(saison.debut)
      : (saison.statut === "a_venir" ? pl.seuil + " pts" : "Encore " + nb(reste) + " pts");
    return el("div", { class: "pa-case " + etat + " r-" + r.rarete, title: (r.type === "avatar" ? "Avatar" : "Titre") + " · " + (RARETES[r.rarete] || "") }, [
      el("span", { class: "pa-rang", texte: pl.rang }),
      visuel,
      el("span", { class: "pa-nom", texte: r.nom }),
      el("span", { class: "pa-type", texte: (r.type === "avatar" ? "Avatar" : "Titre") + " · " + (RARETES[r.rarete] || "") }),
      el("span", { class: "pa-bas", texte: bas })
    ]);
  }

  function barreSaison(s) {
    var pct = s.objectif ? Math.min(100, s.points / s.objectif * 100) : 0;
    var b = el("div", { class: "pa-barre" }, [el("i", { style: "width:" + pct + "%" })]);
    (s.paliers || []).forEach(function (pl) {
      b.appendChild(el("span", { class: "pa-cran" + (pl.debloque || pl.en_attente ? " ok" : ""), style: "left:" + pl.pct + "%", title: pl.seuil + " pts" }));
    });
    return b;
  }

  /* =================== Carte « Mon pass » de l'accueil =================== */
  function carteAccueil(zone, p) {
    var s = saisonCourante(p);
    if (!s) return;
    var av = trouver(p, p.avatar), ti = trouver(p, p.titre);
    var prochaines = (s.paliers || []).filter(function (pl) { return !pl.debloque; }).slice(0, 3);
    var liste = el("div", { class: "pa-mini" });
    prochaines.forEach(function (pl) { liste.appendChild(casePalier(p, pl, s)); });
    if (!prochaines.length) liste.appendChild(el("p", { class: "aide", texte: "Saison terminée à 100 % ! Tes points vont dans ta réserve pour la saison suivante." }));
    zone.innerHTML = "";
    zone.appendChild(el("div", { class: "pa-tete" }, [
      avatar(av, 48, (window.TH_ACCES || {}).prenom),
      el("div", {}, [el("div", { class: "pa-sur", texte: "Mon pass · " + s.nom }),
        el("div", { class: "pa-titre-eq", texte: ti ? ti.nom : "Pas encore de titre" })]),
      el("a", { class: "btn", href: racine() + "pass/index.html", texte: "Voir mon pass" })
    ]));
    zone.appendChild(el("div", { class: "pa-chiffres" }, [
      el("span", {}, [el("b", { texte: nb(s.points) }), document.createTextNode(" / " + nb(s.objectif) + " pts cette saison")]),
      p.reserve > 0 ? el("span", { class: "pa-reserve", texte: "🎒 " + nb(p.reserve) + " pts en réserve" }) : null
    ]));
    zone.appendChild(barreSaison(s));
    zone.appendChild(el("div", { class: "pa-sur", texte: prochaines.length ? "Prochaines récompenses" : "" }));
    zone.appendChild(liste);
    zone.hidden = false;
  }

  /* =================== Élèves en ligne =================== */
  function enLigne(zone) {
    function dessiner(d) {
      zone.innerHTML = "";
      if (!d || !d.visible) { zone.hidden = true; return; }
      var liste = d.liste || [];
      zone.hidden = false;
      zone.appendChild(el("div", { class: "pa-sur" }, [el("i", { class: "pa-point" }), document.createTextNode("En ligne maintenant · " + liste.length)]));
      var l = el("div", { class: "pa-enligne" });
      liste.forEach(function (x) {
        l.appendChild(el("span", { class: "pa-qui" + (x.moi ? " moi" : ""), title: x.prenom + " " + x.initiale + "." + (x.titre ? " · " + x.titre : "") }, [
          avatar(x.avatar, 34, x.prenom), el("span", { texte: x.prenom })]));
      });
      if (!liste.length) l.appendChild(el("span", { class: "aide", texte: "Personne pour l'instant." }));
      zone.appendChild(l);
    }
    function tour() { TH.rpc("connectes").then(dessiner).catch(function () { zone.hidden = true; }); }
    tour(); setInterval(function () { if (!document.hidden) tour(); }, 20000);
  }

  /* =================== Classement de la question du jour =================== */
  function classement(zone, acces) {
    var periode = "saison";
    var classeProf = (function () { try { return localStorage.getItem("th-prof-classe"); } catch (e) { return null; } })() || "terminale-sti2d";
    function dessiner(liste) {
      zone.innerHTML = "";
      zone.hidden = false;
      var tete = el("div", { class: "pa-tete-cl" }, [el("div", { class: "pa-sur", texte: "Classement · question du jour" })]);
      var choix = el("div", { class: "pa-choix" });
      [["semaine", "Semaine"], ["saison", "Saison"], ["total", "Année"]].forEach(function (c) {
        var b = el("button", { type: "button", class: c[0] === periode ? "actif" : "", texte: c[1] });
        b.onclick = function () { periode = c[0]; tour(); };
        choix.appendChild(b);
      });
      if (acces.role === "prof") {
        var sel = el("select", { class: "pa-sel" });
        (window.TH_CLASSES || []).forEach(function (c) { var o = el("option", { value: c.id, texte: c.court }); if (c.id === classeProf) o.selected = true; sel.appendChild(o); });
        sel.onchange = function () { classeProf = sel.value; tour(); };
        choix.appendChild(sel);
      }
      tete.appendChild(choix);
      zone.appendChild(tete);
      var ol = el("ol", { class: "pa-classement" });
      var moi = liste.filter(function (x) { return x.moi; })[0];
      liste.slice(0, 10).forEach(function (x) { ol.appendChild(ligne(x)); });
      if (moi && liste.indexOf(moi) >= 10) { ol.appendChild(el("li", { class: "pa-sep", texte: "…" })); ol.appendChild(ligne(moi)); }
      if (!liste.length) ol.appendChild(el("li", { class: "aide", texte: "Aucun élève." }));
      zone.appendChild(ol);
    }
    function ligne(x) {
      return el("li", { class: (x.moi ? "moi " : "") + (x.rang <= 3 && x.points > 0 ? "podium p" + x.rang : "") }, [
        el("span", { class: "pa-pos", texte: x.rang }), avatar(x.avatar, 26, x.prenom),
        el("span", { class: "pa-n" }, [el("b", { texte: x.prenom + " " + x.initiale + "." }), x.titre ? el("small", { texte: x.titre }) : null]),
        el("span", { class: "pa-pts", texte: nb(x.points) + " pts" })
      ]);
    }
    function tour() {
      TH.rpc("quiz_classement", { p_periode: periode, p_classe: acces.role === "prof" ? classeProf : null })
        .then(dessiner).catch(function () { zone.hidden = true; });
    }
    tour();
  }

  /* =================== Accueil =================== */
  window.TH_ACCUEIL_PASS = function (acces) {
    var grille = document.getElementById("grille");
    if (!grille) return;
    var bloc = el("section", { class: "pa-accueil" + (acces.role === "prof" ? " prof" : "") });
    var zPass = el("div", { class: "pa-carte", hidden: "" });
    var zCote = el("div", { class: "pa-col" });
    var zLigne = el("div", { class: "pa-carte", hidden: "" });
    var zClass = el("div", { class: "pa-carte", hidden: "" });
    if (acces.role === "eleve") { bloc.appendChild(zPass); zCote.appendChild(zLigne); }
    zCote.appendChild(zClass);
    bloc.appendChild(zCote);
    grille.parentNode.insertBefore(bloc, grille.nextSibling);
    if (acces.role === "eleve") {
      charger().then(function (p) { carteAccueil(zPass, p); }).catch(function () {});
      enLigne(zLigne);
    }
    classement(zClass, acces);
  };

  /* =================== Page « Mon pass » =================== */
  window.TH_PAGE_PASS = function (acces) {
    var main = document.querySelector("main");
    var zone = document.getElementById("pass");
    if (acces.role !== "eleve") {
      zone.appendChild(el("div", { class: "vide", texte: "Cette page est celle des élèves. Pour voir le pass d'un élève : Espace prof → Pass & points." }));
      return;
    }
    var vue = null, onglet = "avatar";
    function erreur(e) {
      zone.innerHTML = "";
      zone.appendChild(el("div", { class: "vide", texte: absent(e) ? "Le pass n'est pas encore activé par ton professeur." : "Impossible de charger le pass. Réessaie dans un instant." }));
    }
    function dessiner(p) {
      zone.innerHTML = "";
      var s = saisonCourante(p) || p.saisons[0];
      if (!vue) vue = s ? s.id : null;
      var av = trouver(p, p.avatar), ti = trouver(p, p.titre);

      // En-tête : avatar, titre, points
      zone.appendChild(el("div", { class: "pa-profil" }, [
        avatar(av, 72, acces.prenom),
        el("div", { class: "pa-qui-txt" }, [
          el("h1", { texte: (acces.prenom || "") + " " + (acces.nom || "") }),
          el("div", { class: "pa-titre-eq", texte: ti ? ti.nom : "Pas encore de titre" })
        ]),
        el("div", { class: "pa-total" }, [el("b", { texte: nb(p.total) }), el("span", { texte: "points au total" })])
      ]));

      // Onglets de saisons
      var bar = el("div", { class: "onglets" });
      p.saisons.forEach(function (x) {
        var b = el("button", { type: "button", class: "onglet" + (x.id === vue ? " actif" : ""),
          texte: x.nom.split("·")[0].trim() + (x.statut === "en_cours" ? " ●" : x.statut === "a_venir" ? " 🔒" : "") });
        b.onclick = function () { vue = x.id; dessiner(p); };
        bar.appendChild(b);
      });
      zone.appendChild(bar);

      var sv = p.saisons.filter(function (x) { return x.id === vue; })[0];
      var info = sv.statut === "a_venir"
        ? "Cette saison commence le " + dateCourte(sv.debut) + ". " + (sv.points > 0 ? "Tes " + nb(sv.points) + " pts de réserve débloqueront ces récompenses dès l'ouverture." : "Prends de l'avance : les points au-delà de la saison en cours sont gardés en réserve.")
        : sv.statut === "terminee" ? "Saison terminée (" + dateCourte(sv.debut) + " → " + dateCourte(sv.fin) + ")."
        : "Du " + dateCourte(sv.debut) + " au " + dateCourte(sv.fin) + " · objectif de la saison : " + nb(sv.objectif) + " pts.";
      zone.appendChild(el("div", { class: "pa-saison" }, [
        el("div", { class: "pa-saison-tete" }, [el("h2", { texte: sv.nom }),
          el("span", { class: "pa-score" }, [el("b", { texte: nb(sv.points) }), document.createTextNode(" / " + nb(sv.objectif) + " pts")])]),
        barreSaison(sv),
        el("p", { class: "aide", texte: info }),
        sv.id === p.courante && p.reserve > 0 ? el("p", { class: "pa-reserve", texte: "🎒 Réserve : " + nb(p.reserve) + " pts gardés pour la saison suivante (une saison d'avance au maximum)." }) : null
      ]));

      // Les paliers : la récompense de chacun est visible
      var chemin = el("div", { class: "pa-chemin" });
      sv.paliers.forEach(function (pl) { chemin.appendChild(casePalier(p, pl, sv)); });
      if (!sv.paliers.length) chemin.appendChild(el("p", { class: "aide", texte: "Aucun palier pour cette saison." }));
      zone.appendChild(chemin);

      // Entraînement du jour
      zone.appendChild(el("p", { class: "aide pa-jour", texte: "Entraînement et jeux aujourd'hui : " + nb(p.entrainement_jour) + " / " + nb(p.plafond_jour) + " pts (plafond quotidien : mieux vaut un peu chaque jour)." }));

      // Collection
      var col = el("section", { class: "pa-collection" });
      col.appendChild(el("h2", { texte: "Ma collection" }));
      var ob = el("div", { class: "onglets" });
      [["avatar", "Avatars"], ["titre", "Titres"]].forEach(function (o) {
        var b = el("button", { type: "button", class: "onglet" + (onglet === o[0] ? " actif" : ""), texte: o[1] });
        b.onclick = function () { onglet = o[0]; dessiner(p); };
        ob.appendChild(b);
      });
      col.appendChild(ob);
      var grille = el("div", { class: "pa-grille" });
      var ordre = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
      (p.recompenses || []).filter(function (r) { return r.type === onglet; })
        .sort(function (a, b) { return ordre[a.rarete] - ordre[b.rarete]; })
        .forEach(function (r) {
          var ok = (p.obtenues || []).indexOf(r.id) >= 0;
          var equipe = (onglet === "avatar" ? p.avatar : p.titre) === r.id;
          var cond = r.condition === "pass" ? "Dans le pass" : r.condition === "ressources" ? "En terminant certaines activités" : "Donné par le prof";
          var b = el("button", { type: "button", class: "pa-objet r-" + r.rarete + (ok ? "" : " verrou") + (equipe ? " equipe" : ""),
            title: ok ? (equipe ? "Équipé · cliquer pour retirer" : "Équiper") : cond }, [
            onglet === "avatar" ? avatar(ok ? r : { symbole: "🔒", couleur: "#2e2e36" }, 54) : el("span", { class: "pa-titre-ico", texte: ok ? "“ ”" : "🔒" }),
            el("span", { class: "pa-nom", texte: r.nom }),
            puceRarete(r.rarete),
            el("span", { class: "pa-type", texte: ok ? (equipe ? "✓ Équipé" : "Équiper") : cond })
          ]);
          if (ok) b.onclick = function () {
            b.disabled = true;
            TH.rpc("equiper", { p_type: onglet, p_recompense: equipe ? null : r.id })
              .then(function () { return charger(true); }).then(dessiner).catch(function () { b.disabled = false; });
          };
          grille.appendChild(b);
        });
      col.appendChild(grille);
      zone.appendChild(col);

      // Journal
      var j = el("section", { class: "pa-journal" }, [el("h2", { texte: "Mes derniers points" })]);
      var t = el("table", { class: "pa-table" });
      (p.journal || []).forEach(function (x) {
        var quoi = x.ressource ? titreRessource(x.ressource) : (SOURCES[x.source] || x.source);
        var note = x.suspect && x.points === 0 ? " · terminé trop vite, en attente du prof" : "";
        t.appendChild(el("tr", {}, [
          el("td", { texte: new Date(x.cree_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) }),
          el("td", { texte: (SOURCES[x.source] || x.source) }),
          el("td", { texte: quoi + note }),
          el("td", { class: "pa-pts", texte: (x.points > 0 ? "+" : "") + x.points })
        ]));
      });
      if (!(p.journal || []).length) t.appendChild(el("tr", {}, [el("td", { texte: "Termine une activité pour gagner tes premiers points." })]));
      j.appendChild(t);
      zone.appendChild(j);
    }
    zone.appendChild(el("p", { class: "aide", texte: "Chargement…" }));
    charger().then(dessiner).catch(erreur);
  };

  window.TH_PASS = { avatar: avatar, charger: charger, absent: absent };
})();
