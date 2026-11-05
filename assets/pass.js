/* pass.js · Pass de progression, profil, classement de la question du jour, élèves en ligne.
   Tout est calculé par le serveur (scripts Supabase 03 et 04) : la page ne fait qu'afficher.
   Si les scripts ne sont pas installés, les blocs restent masqués. */
(function () {
  var RARETES = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };
  var SOURCES = { activite: "Activité", entrainement: "Entraînement", jeu: "Jeu", prof: "Bonus du prof" };
  var CALME = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function el() { return window.TH_el.apply(null, arguments); }
  function racine() { return document.body.getAttribute("data-racine") || "./"; }
  function absent(e) { return e && (e.status === 404 || e.code === "PGRST202" || /could not find|not find the function/i.test(e.message || "")); }
  function nb(n) { return Math.round(Number(n) || 0).toLocaleString("fr-FR"); }
  function dateCourte(d) { return new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(/\.$/, ""); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function titreRessource(id) {
    var r = (window.CATALOGUE || []).filter(function (x) { return x.classe + "/" + x.fichier === id; })[0];
    return r ? r.titre : (id || "").split("/").pop();
  }
  var lienProfil = function (onglet, eleve) { return racine() + "profil/index.html" + (eleve ? "?eleve=" + eleve : "") + (onglet ? "#" + onglet : ""); };

  /* ---------- Animations ---------- */
  // Compteur qui défile jusqu'à sa valeur (depuis la dernière valeur vue si une clé est donnée)
  function compteur(n, valeur, cle) {
    valeur = Math.round(Number(valeur) || 0);
    var depart = cle ? Number(lsGet("th-vu-" + cle) || 0) : 0;
    if (cle) lsSet("th-vu-" + cle, valeur);
    if (CALME || depart === valeur) { n.textContent = nb(valeur); return n; }
    if (depart > valeur) depart = 0;
    var t0 = null, duree = Math.min(1600, 500 + Math.abs(valeur - depart) * 3);
    function pas(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / duree), e = 1 - Math.pow(1 - k, 3);
      n.textContent = nb(depart + (valeur - depart) * e);
      if (k < 1) requestAnimationFrame(pas);
    }
    n.textContent = nb(depart);
    setTimeout(function () { requestAnimationFrame(pas); }, 250);
    if (cle && valeur > depart && depart > 0) n.classList.add("pa-gain");
    return n;
  }
  // Barre qui se remplit
  function remplir(i, pct) {
    if (CALME) { i.style.width = pct + "%"; return; }
    i.style.width = "0%";
    requestAnimationFrame(function () { setTimeout(function () { i.style.width = pct + "%"; }, 120); });
  }
  // Apparition en cascade des enfants
  function cascade(zone) {
    if (CALME) return;
    [].slice.call(zone.children).forEach(function (c, k) { c.classList.add("pa-apparait"); c.style.setProperty("--d", (k * 60) + "ms"); });
  }
  function confettis(cible) {
    if (CALME) return;
    var r = (cible || document.body).getBoundingClientRect(), cols = ["#5b8cff", "#2fd39a", "#b07cff", "#f5b74a", "#ff9a3d"];
    for (var k = 0; k < 40; k++) {
      var c = el("i", { class: "pa-confetti" });
      c.style.left = (r.left + r.width / 2) + "px"; c.style.top = (r.top + Math.min(r.height, 120) / 2) + "px";
      c.style.background = cols[k % cols.length];
      c.style.setProperty("--x", (Math.random() * 360 - 180) + "px"); c.style.setProperty("--y", (Math.random() * -220 - 40) + "px");
      c.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      document.body.appendChild(c);
      setTimeout(function (x) { return function () { x.remove(); }; }(c), 1400);
    }
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
  var caches = {};
  function charger(eleve, force) {
    var k = eleve || "moi";
    if (caches[k] && !force) return caches[k];
    caches[k] = TH.rpc("mon_pass", eleve ? { p_eleve: eleve } : {}).catch(function (e) { caches[k] = null; throw e; });
    return caches[k];
  }
  function trouver(p, id) { return (p.recompenses || []).filter(function (r) { return r.id === id; })[0]; }
  function saisonCourante(p) { return (p.saisons || []).filter(function (s) { return s.id === p.courante; })[0]; }

  /* ---------- Bulle de l'élève en haut de page (avatar → Mon profil) ---------- */
  window.TH_BULLE = function (zone, acces) {
    if (!zone || acces.role !== "eleve") return;
    var lien = el("a", { class: "pa-bulle", href: lienProfil(), title: "Mon profil" });
    var av = avatar(null, 26, acces.prenom), pts = el("span", { class: "pa-bulle-pts" });
    lien.appendChild(av);
    lien.appendChild(el("span", { class: "pa-bulle-nom", texte: acces.prenom || "Mon profil" }));
    lien.appendChild(pts);
    zone.parentNode.replaceChild(lien, zone);
    function maj(d) {
      if (!d) return;
      var nouv = avatar(d.avatar, 26, acces.prenom); lien.replaceChild(nouv, lien.firstChild);
      pts.textContent = nb(d.total) + " pts"; pts.hidden = false;
      lien.title = "Mon profil" + (d.titre ? " · " + d.titre : "");
    }
    try { var c = JSON.parse(sessionStorage.getItem("th-equip") || "null"); if (c) maj(c); } catch (e) {}
    TH.rpc("mon_equipement").then(function (d) { try { sessionStorage.setItem("th-equip", JSON.stringify(d)); } catch (e) {} maj(d); }).catch(function () { pts.hidden = true; });
  };
  function oublierBulle() { try { sessionStorage.removeItem("th-equip"); } catch (e) {} }

  /* ---------- Une case de palier (la récompense est visible directement) ---------- */
  function casePalier(p, pl, saison, prochain, nouveau) {
    var r = trouver(p, pl.recompense) || { nom: "—", type: "titre", rarete: "commun" };
    var etat = pl.debloque ? "obtenu" : (pl.en_attente ? "attente" : "avenir");
    var visuel = r.type === "avatar" ? avatar(r, 46) : el("span", { class: "pa-titre-ico", texte: r.nom === "???" ? "?" : "“ ”" });
    var reste = Math.max(0, pl.seuil - saison.points);
    var bas = etat === "obtenu" ? "Obtenu" : etat === "attente" ? "Dès le " + dateCourte(saison.debut)
      : (saison.statut === "a_venir" ? pl.seuil + " pts" : "Encore " + nb(reste) + " pts");
    var c = el("a", { class: "pa-case " + etat + " r-" + r.rarete + (prochain ? " prochain" : "") + (nouveau ? " nouveau" : ""),
      href: lienProfil("collection"), title: (r.type === "avatar" ? "Avatar" : "Titre") + " · " + (RARETES[r.rarete] || "") + " · voir ma collection" }, [
      el("span", { class: "pa-rang", texte: pl.rang }),
      visuel,
      el("span", { class: "pa-nom", texte: r.nom }),
      el("span", { class: "pa-type", texte: (r.type === "avatar" ? "Avatar" : "Titre") + " · " + (RARETES[r.rarete] || "") }),
      el("span", { class: "pa-bas", texte: bas })
    ]);
    if (prochain) {
      var pctCase = Math.max(0, Math.min(100, saison.points / pl.seuil * 100));
      var mini = el("i"); c.appendChild(el("span", { class: "pa-mini-barre" }, [mini])); remplir(mini, pctCase);
    }
    return c;
  }
  // Paliers obtenus depuis la dernière visite (pour les mettre en valeur)
  function nouveauxPaliers(p, s, cle) {
    var obtenus = (s.paliers || []).filter(function (x) { return x.debloque; }).map(function (x) { return x.rang; });
    var k = "th-paliers-" + cle + "-" + s.id, vus = (lsGet(k) || "").split(",").filter(Boolean).map(Number);
    lsSet(k, obtenus.join(","));
    if (lsGet(k + "-init") !== "1") { lsSet(k + "-init", "1"); return []; }   // première visite : rien de « nouveau »
    return obtenus.filter(function (r) { return vus.indexOf(r) < 0; });
  }

  function barreSaison(s) {
    var pct = s.objectif ? Math.min(100, s.points / s.objectif * 100) : 0;
    var i = el("i");
    var b = el("div", { class: "pa-barre" }, [i]);
    (s.paliers || []).forEach(function (pl) {
      b.appendChild(el("span", { class: "pa-cran" + (pl.debloque || pl.en_attente ? " ok" : ""), style: "left:" + pl.pct + "%", title: pl.seuil + " pts" }));
    });
    remplir(i, pct);
    return b;
  }

  /* =================== Carte « Mon pass » de l'accueil (entièrement cliquable) =================== */
  function carteAccueil(zone, p) {
    var s = saisonCourante(p);
    if (!s) return;
    var av = trouver(p, p.avatar), ti = trouver(p, p.titre);
    var restants = (s.paliers || []).filter(function (pl) { return !pl.debloque; });
    var nouveaux = nouveauxPaliers(p, s, "moi");
    var liste = el("div", { class: "pa-mini" });
    restants.slice(0, 3).forEach(function (pl, k) { liste.appendChild(casePalier(p, pl, s, k === 0, false)); });
    if (!restants.length) liste.appendChild(el("p", { class: "aide", texte: "Saison terminée à 100 % ! Tes points vont dans ta réserve pour la saison suivante." }));
    zone.innerHTML = "";
    zone.classList.add("pa-cliquable");
    zone.onclick = function (e) { if (!e.target.closest("a")) location.href = lienProfil("pass"); };
    var pts = el("b");
    zone.appendChild(el("div", { class: "pa-tete" }, [
      avatar(av, 48, (window.TH_ACCES || {}).prenom),
      el("div", {}, [el("div", { class: "pa-sur", texte: "Mon pass · " + s.nom }),
        el("div", { class: "pa-titre-eq", texte: ti ? ti.nom : "Pas encore de titre" })]),
      el("a", { class: "btn", href: lienProfil("pass"), texte: "Voir mon pass →" })
    ]));
    zone.appendChild(el("div", { class: "pa-chiffres" }, [
      el("span", {}, [compteur(pts, s.points, "saison-" + s.id), document.createTextNode(" / " + nb(s.objectif) + " pts cette saison")]),
      p.reserve > 0 ? el("span", { class: "pa-reserve", texte: "🎒 " + nb(p.reserve) + " pts en réserve" }) : null
    ]));
    zone.appendChild(barreSaison(s));
    if (nouveaux.length) {
      zone.appendChild(el("div", { class: "pa-nouveau-msg", texte: "🎉 " + (nouveaux.length > 1 ? nouveaux.length + " nouveaux paliers débloqués !" : "Nouveau palier débloqué !") + " Va voir ta collection." }));
      setTimeout(function () { confettis(zone); }, 700);
    }
    zone.appendChild(el("div", { class: "pa-sur", texte: restants.length ? "Prochaines récompenses" : "" }));
    zone.appendChild(liste);
    zone.hidden = false;
    cascade(liste);
  }

  /* =================== Élèves en ligne =================== */
  function enLigne(zone) {
    var avant = "";
    function dessiner(d) {
      if (!d || !d.visible) { zone.hidden = true; return; }
      var liste = d.liste || [], cle = liste.map(function (x) { return x.prenom + x.initiale; }).join("|");
      if (cle === avant && zone.childNodes.length) return;
      var anciens = avant.split("|"); avant = cle;
      zone.innerHTML = "";
      zone.hidden = false;
      zone.appendChild(el("div", { class: "pa-sur" }, [el("i", { class: "pa-point" }), document.createTextNode("En ligne maintenant · " + liste.length)]));
      var l = el("div", { class: "pa-enligne" });
      liste.forEach(function (x) {
        var arrive = anciens[0] !== "" && anciens.indexOf(x.prenom + x.initiale) < 0;
        l.appendChild(el("span", { class: "pa-qui" + (x.moi ? " moi" : "") + (arrive ? " arrive" : ""), title: x.prenom + " " + x.initiale + "." + (x.titre ? " · " + x.titre : "") }, [
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
    var classeProf = lsGet("th-prof-classe") || "terminale-sti2d";
    function dessiner(liste) {
      zone.innerHTML = "";
      zone.hidden = false;
      var tete = el("div", { class: "pa-tete-cl" }, [el("div", { class: "pa-sur", texte: "🏆 Classement · question du jour" })]);
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
      var max = Math.max(1, liste.reduce(function (m, x) { return Math.max(m, x.points); }, 0));
      liste.slice(0, 10).forEach(function (x) { ol.appendChild(ligne(x, max)); });
      if (moi && liste.indexOf(moi) >= 10) { ol.appendChild(el("li", { class: "pa-sep", texte: "…" })); ol.appendChild(ligne(moi, max)); }
      if (!liste.length) ol.appendChild(el("li", { class: "aide", texte: "Aucun élève." }));
      zone.appendChild(ol);
      cascade(ol);
    }
    function ligne(x, max) {
      var jauge = el("i");
      var li = el("li", { class: (x.moi ? "moi " : "") + (x.rang <= 3 && x.points > 0 ? "podium p" + x.rang : "") }, [
        el("span", { class: "pa-pos", texte: x.rang <= 3 && x.points > 0 ? ["🥇", "🥈", "🥉"][x.rang - 1] : x.rang }), avatar(x.avatar, 26, x.prenom),
        el("span", { class: "pa-n" }, [el("b", { texte: x.prenom + " " + x.initiale + "." }), x.titre ? el("small", { texte: x.titre }) : null]),
        el("span", { class: "pa-pts", texte: nb(x.points) + " pts" }),
        el("span", { class: "pa-jauge" }, [jauge])
      ]);
      remplir(jauge, x.points / max * 100);
      if (x.moi && acces.role === "eleve") { li.classList.add("pa-cliquable"); li.onclick = function () { location.href = lienProfil("quiz"); }; }
      return li;
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

  /* =================== Page « Mon profil » =================== */
  var ONGLETS = [["pass", "Pass"], ["activites", "Activités"], ["quiz", "Question du jour"], ["collection", "Collection"], ["points", "Points"]];
  window.TH_PAGE_PROFIL = async function (acces) {
    var zone = document.getElementById("profil");
    var q = new URLSearchParams(location.search);
    var cible = acces.role === "prof" ? q.get("eleve") : null;
    var moiMeme = !cible;
    if (acces.role !== "eleve" && !cible) {
      zone.appendChild(el("div", { class: "vide" }, [el("h2", { texte: "Profil des élèves" }),
        el("p", { texte: "Ouvre le profil d'un élève depuis Espace prof → Pass → Élèves de la classe (bouton « Profil »)." }),
        el("a", { class: "btn primary", href: racine() + "prof/index.html#pass", texte: "Aller à l'Espace prof" })]));
      return;
    }
    var eleve = { prenom: acces.prenom, nom: acces.nom, classe: acces.classe };
    if (cible) {
      try { eleve = (await TH.rest("profils?select=id,nom,prenom,classe&id=eq." + cible))[0] || eleve; } catch (e) {}
      document.title = "Profil de " + eleve.prenom + " · Techno-Hangar";
    }
    var onglet = (location.hash || "").replace("#", "");
    if (!ONGLETS.some(function (o) { return o[0] === onglet; })) onglet = "pass";
    var vueSaison = null, ongletColl = "avatar";
    var donnees = { pass: null, quiz: null, acts: null, prog: null };

    function erreur(e) {
      zone.innerHTML = "";
      zone.appendChild(el("div", { class: "vide", texte: absent(e) ? "Le profil n'est pas encore activé par ton professeur." : "Impossible de charger le profil. Réessaie dans un instant." }));
    }
    async function toutCharger(force) {
      var id = cible || null;
      var r = await Promise.all([
        charger(id, force),
        TH.rpc("profil_quiz", id ? { p_eleve: id } : {}).catch(function () { return null; }),
        TH.rpc("activites_eleve", id ? { p_eleve: id } : {}).catch(function () { return {}; }),
        TH.rest("progression?select=ressource,avancement,score,termine,maj_le&eleve=eq." + (id || (TH.session() || { user: {} }).user.id)).catch(function () { return []; })
      ]);
      donnees = { pass: r[0], quiz: r[1], acts: r[2] || {}, prog: r[3] || [] };
    }

    function tuile(titre, valeur, sous, cle, lienOnglet) {
      var v = el("b");
      if (typeof valeur === "number") compteur(v, valeur, moiMeme && cle ? cle : null); else v.textContent = valeur;
      var t = el(lienOnglet ? "a" : "div", { class: "pa-tuile", href: lienOnglet ? "#" + lienOnglet : null }, [el("span", { class: "pa-sur", texte: titre }), v, sous ? el("small", { texte: sous }) : null]);
      if (lienOnglet) t.onclick = function (e) { e.preventDefault(); aller(lienOnglet); };
      if (!lienOnglet) t.removeAttribute("href");
      return t;
    }

    function dessiner() {
      var p = donnees.pass, qz = donnees.quiz;
      zone.innerHTML = "";
      var s = saisonCourante(p) || p.saisons[0];
      var av = trouver(p, p.avatar), ti = trouver(p, p.titre);
      var classeNom = ((window.TH_CLASSES || []).filter(function (c) { return c.id === eleve.classe; })[0] || {}).nom || "";

      if (!moiMeme) zone.appendChild(el("div", { class: "pa-vue-prof" }, [
        document.createTextNode("Vue prof · profil de " + eleve.prenom + " " + eleve.nom + " (lecture seule)"),
        el("a", { class: "btn", href: racine() + "prof/index.html#pass", texte: "← Espace prof" })]));

      // En-tête
      var bAv = avatar(av, 84, eleve.prenom);
      if (moiMeme) { bAv.classList.add("pa-cliquable"); bAv.title = "Changer d'avatar"; bAv.onclick = function () { ongletColl = "avatar"; aller("collection"); }; }
      zone.appendChild(el("div", { class: "pa-profil pa-apparait" }, [
        bAv,
        el("div", { class: "pa-qui-txt" }, [
          el("h1", { texte: (eleve.prenom || "") + " " + (eleve.nom || "") }),
          el("div", { class: "pa-titre-eq" + (ti ? " r-" + ti.rarete : "") }, [ti ? puceRarete(ti.rarete) : null, document.createTextNode(ti ? " " + ti.nom : "Pas encore de titre")]),
          el("div", { class: "aide", texte: classeNom })
        ])
      ]));

      // Tuiles de résumé
      var nbAct = Object.keys(donnees.acts).filter(function (k) { return donnees.acts[k].type === "activite"; }).length;
      var faites = donnees.prog.filter(function (x) { return x.termine; }).length;
      var tuiles = el("div", { class: "pa-tuiles" }, [
        tuile("Points au total", p.total, null, "total", "points"),
        tuile(s ? s.nom.split("·")[0].trim() : "Saison", s ? s.points : 0, s ? "sur " + nb(s.objectif) + " · " + Math.round(s.points / s.objectif * 100) + " %" : "", s ? "saison-" + s.id : null, "pass"),
        tuile("Activités terminées", faites, nbAct ? "sur " + nbAct : "", null, "activites"),
        tuile("Question du jour", qz ? (qz.serie || 0) + " j 🔥" : "—", qz ? "série en cours" : "", null, "quiz")
      ]);
      zone.appendChild(tuiles); cascade(tuiles);

      // Onglets
      var bar = el("div", { class: "onglets pa-onglets", role: "tablist" });
      ONGLETS.forEach(function (o) {
        var b = el("button", { type: "button", class: "onglet" + (o[0] === onglet ? " actif" : ""), texte: o[1] });
        b.onclick = function () { aller(o[0]); };
        bar.appendChild(b);
      });
      zone.appendChild(bar);
      var corps = el("div", { class: "pa-corps pa-apparait" });
      zone.appendChild(corps);
      ({ pass: vuePass, activites: vueActivites, quiz: vueQuiz, collection: vueCollection, points: vuePoints })[onglet](corps, p, qz);
    }
    function aller(o) {
      onglet = o;
      try { history.replaceState(null, "", location.search + "#" + o); } catch (e) { location.hash = o; }
      dessiner();
      var b = document.querySelector(".pa-onglets"); if (b && b.getBoundingClientRect().top < 0) b.scrollIntoView({ behavior: CALME ? "auto" : "smooth" });
    }
    window.addEventListener("hashchange", function () { var h = location.hash.replace("#", ""); if (h !== onglet && ONGLETS.some(function (o) { return o[0] === h; })) aller(h); });

    /* ----- Onglet Pass ----- */
    function vuePass(corps, p) {
      if (!vueSaison) vueSaison = p.courante || (p.saisons[0] || {}).id;
      var bar = el("div", { class: "pa-choix pa-saisons" });
      p.saisons.forEach(function (x) {
        var b = el("button", { type: "button", class: x.id === vueSaison ? "actif" : "",
          texte: x.nom.split("·")[0].trim() + (x.statut === "en_cours" ? " ●" : x.statut === "a_venir" ? " 🔒" : " ✓") });
        b.onclick = function () { vueSaison = x.id; dessiner(); };
        bar.appendChild(b);
      });
      corps.appendChild(bar);
      var sv = p.saisons.filter(function (x) { return x.id === vueSaison; })[0];
      if (!sv) return;
      var info = sv.statut === "a_venir"
        ? "Cette saison commence le " + dateCourte(sv.debut) + ". " + (sv.points > 0 ? "Les " + nb(sv.points) + " pts de réserve débloqueront ces récompenses dès l'ouverture." : "Les points au-delà de la saison en cours sont gardés en réserve.")
        : sv.statut === "terminee" ? "Saison terminée (" + dateCourte(sv.debut) + " → " + dateCourte(sv.fin) + ")."
        : "Du " + dateCourte(sv.debut) + " au " + dateCourte(sv.fin) + " · objectif de la saison : " + nb(sv.objectif) + " pts.";
      var score = el("b");
      corps.appendChild(el("div", { class: "pa-saison" }, [
        el("div", { class: "pa-saison-tete" }, [el("h2", { texte: sv.nom }),
          el("span", { class: "pa-score" }, [compteur(score, sv.points), document.createTextNode(" / " + nb(sv.objectif) + " pts")])]),
        barreSaison(sv),
        el("p", { class: "aide", texte: info }),
        sv.id === p.courante && p.reserve > 0 ? el("p", { class: "pa-reserve", texte: "🎒 Réserve : " + nb(p.reserve) + " pts gardés pour la saison suivante (une saison d'avance au maximum)." }) : null
      ]));
      var nouveaux = moiMeme && sv.id === p.courante ? nouveauxPaliers(p, sv, "moi") : [];
      var prochain = (sv.paliers || []).filter(function (x) { return !x.debloque && !x.en_attente; })[0];
      var chemin = el("div", { class: "pa-chemin" });
      sv.paliers.forEach(function (pl) { chemin.appendChild(casePalier(p, pl, sv, sv.statut === "en_cours" && pl === prochain, nouveaux.indexOf(pl.rang) >= 0)); });
      if (!sv.paliers.length) chemin.appendChild(el("p", { class: "aide", texte: "Aucun palier pour cette saison." }));
      corps.appendChild(chemin);
      cascade(chemin);
      if (nouveaux.length) setTimeout(function () { confettis(chemin.querySelector(".nouveau")); }, 600);
      corps.appendChild(el("p", { class: "aide pa-jour", texte: "Entraînement et jeux aujourd'hui : " + nb(p.entrainement_jour) + " / " + nb(p.plafond_jour) + " pts (plafond quotidien : mieux vaut un peu chaque jour)." }));
    }

    /* ----- Onglet Activités ----- */
    function vueActivites(corps) {
      var prog = {}; donnees.prog.forEach(function (x) { prog[x.ressource] = x; });
      var res = (window.CATALOGUE || []).filter(function (r) { return r.classe === eleve.classe && r.fichier && r.en_ligne && !/^https?:/.test(r.fichier) && r.type !== "lien"; });
      if (!res.length) { corps.appendChild(el("div", { class: "vide", texte: "Aucune ressource en ligne pour l'instant." })); return; }
      var parSeq = {}, ordre = [];
      res.forEach(function (r) { var k = r.sequence || "Autres"; if (!parSeq[k]) { parSeq[k] = []; ordre.push(k); } parSeq[k].push(r); });
      ordre.forEach(function (seq) {
        corps.appendChild(el("h3", { class: "pa-seq", texte: seq }));
        var l = el("div", { class: "pa-acts" });
        parSeq[seq].forEach(function (r) {
          var id = r.classe + "/" + r.fichier, g = prog[id], a = donnees.acts[id];
          var pct = g ? (g.termine ? 100 : Math.round(Number(g.avancement) || 0)) : 0;
          var etat = g ? (g.termine ? "Terminé" + (g.score != null ? " · " + String(g.score).replace(".", ",") + "/20" : "") : (g.avancement != null ? pct + " %" : "Commencé")) : "Pas commencé";
          var puce = !a ? null : a.statut === "ferme" ? el("span", { class: "pa-statut ferme", texte: "🔒 Fermée" })
            : a.gagne != null ? el("span", { class: "pa-statut gagne", texte: (a.suspect ? "⏳ " : "✓ +") + (a.suspect ? "en attente du prof" : a.gagne + " pts") })
            : a.statut === "revision" ? el("span", { class: "pa-statut", texte: "Révision" })
            : null;
          var i = el("i");
          var ligne = el(moiMeme ? "a" : "div", { class: "pa-act" + (g && g.termine ? " fini" : ""), href: moiMeme ? racine() + "voir.html?r=" + encodeURIComponent(id) : null }, [
            el("span", { class: "pa-act-t" }, [el("b", { texte: r.titre }), el("small", { texte: etat + (g && g.maj_le ? " · " + new Date(g.maj_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "") })]),
            el("span", { class: "pa-act-b" }, [i]),
            puce
          ]);
          if (!moiMeme) ligne.removeAttribute("href");
          remplir(i, pct);
          l.appendChild(ligne);
        });
        corps.appendChild(l); cascade(l);
      });
    }

    /* ----- Onglet Question du jour ----- */
    function vueQuiz(corps, p, qz) {
      if (!qz) { corps.appendChild(el("div", { class: "vide", texte: "Les statistiques de la question du jour ne sont pas disponibles." })); return; }
      var g = el("div", { class: "pa-tuiles" }, [
        tuile("Série en cours", (qz.serie || 0) + " j 🔥", qz.serie ? "réponds chaque jour pour la garder" : "réponds aujourd'hui pour la lancer"),
        tuile("Meilleure série", (qz.meilleure_serie || 0) + " j", null),
        tuile("Points question du jour", qz.total, null, moiMeme ? "quiz-total" : null),
        tuile("Questions jouées", qz.parties || 0, null)
      ]);
      corps.appendChild(g); cascade(g);
      if (moiMeme) corps.appendChild(el("p", { class: "aide", texte: "Le classement de ta classe est sur l'accueil." }));
    }

    /* ----- Onglet Collection ----- */
    function vueCollection(corps, p) {
      var ob = el("div", { class: "pa-choix" });
      [["avatar", "Avatars"], ["titre", "Titres"]].forEach(function (o) {
        var n = (p.recompenses || []).filter(function (r) { return r.type === o[0]; }).length;
        var k = (p.recompenses || []).filter(function (r) { return r.type === o[0] && (p.obtenues || []).indexOf(r.id) >= 0; }).length;
        var b = el("button", { type: "button", class: ongletColl === o[0] ? "actif" : "", texte: o[1] + " · " + k + "/" + n });
        b.onclick = function () { ongletColl = o[0]; dessiner(); };
        ob.appendChild(b);
      });
      corps.appendChild(ob);
      if (moiMeme) corps.appendChild(el("p", { class: "aide", texte: "Clique sur un objet débloqué pour l'équiper (il s'affiche à côté de ton prénom pour toute la classe)." }));
      var grille = el("div", { class: "pa-grille" });
      var ordre = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
      (p.recompenses || []).filter(function (r) { return r.type === ongletColl; })
        .sort(function (a, b) { return ordre[a.rarete] - ordre[b.rarete]; })
        .forEach(function (r) {
          var ok = (p.obtenues || []).indexOf(r.id) >= 0;
          var equipe = (ongletColl === "avatar" ? p.avatar : p.titre) === r.id;
          var cond = r.condition === "pass" ? "Dans le pass" : r.condition === "ressources" ? "En terminant certaines activités" : "Donné par le prof";
          var b = el("button", { type: "button", class: "pa-objet r-" + r.rarete + (ok ? "" : " verrou") + (equipe ? " equipe" : ""),
            title: ok ? (equipe ? "Équipé · cliquer pour retirer" : "Équiper") : cond }, [
            ongletColl === "avatar" ? avatar(ok ? r : { symbole: "🔒", couleur: "#2e2e36" }, 54) : el("span", { class: "pa-titre-ico", texte: ok ? "“ ”" : "🔒" }),
            el("span", { class: "pa-nom", texte: r.nom }),
            puceRarete(r.rarete),
            el("span", { class: "pa-type", texte: ok ? (equipe ? "✓ Équipé" : (moiMeme ? "Équiper" : "Obtenu")) : cond })
          ]);
          if (ok && moiMeme) b.onclick = function () {
            b.disabled = true; b.classList.add("pa-clic");
            TH.rpc("equiper", { p_type: ongletColl, p_recompense: equipe ? null : r.id })
              .then(function () { oublierBulle(); return charger(null, true); })
              .then(function (np) { donnees.pass = np; dessiner(); majBulle(); })
              .catch(function () { b.disabled = false; });
          };
          if (!moiMeme) b.disabled = true;
          grille.appendChild(b);
        });
      corps.appendChild(grille); cascade(grille);
    }
    function majBulle() {
      TH.rpc("mon_equipement").then(function (d) {
        try { sessionStorage.setItem("th-equip", JSON.stringify(d)); } catch (e) {}
        var b = document.querySelector(".pa-bulle");
        if (b) { b.replaceChild(avatar(d.avatar, 26, acces.prenom), b.firstChild); b.classList.remove("pa-pop"); void b.offsetWidth; b.classList.add("pa-pop"); }
      }).catch(function () {});
    }

    /* ----- Onglet Points ----- */
    function vuePoints(corps, p) {
      var parSource = {};
      (p.journal || []).forEach(function (x) { parSource[x.source] = (parSource[x.source] || 0) + x.points; });
      var g = el("div", { class: "pa-tuiles" }, Object.keys(SOURCES).filter(function (k) { return parSource[k]; }).map(function (k) { return tuile(SOURCES[k], parSource[k], "30 derniers gains"); }));
      if (g.childNodes.length) { corps.appendChild(g); cascade(g); }
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
      corps.appendChild(t);
    }

    zone.appendChild(el("p", { class: "aide", texte: "Chargement…" }));
    try { await toutCharger(); dessiner(); } catch (e) { erreur(e); }
  };

  window.TH_PASS = { avatar: avatar, charger: charger, absent: absent, compteur: compteur, remplir: remplir, confettis: confettis };
})();
