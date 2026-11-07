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
    caches[k] = TH.rpc("mon_pass", eleve ? { p_eleve: eleve } : {}).then(function (p) {
      if (!eleve) try { sessionStorage.setItem("th-pass", JSON.stringify(p)); } catch (e) {}
      return p;
    }).catch(function (e) { caches[k] = null; throw e; });
    return caches[k];
  }
  function passEnCache() { try { return JSON.parse(sessionStorage.getItem("th-pass") || "null"); } catch (e) { return null; } }
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
      var nouv = cadre(d.avatar, 26, acces.prenom, d.ornement); lien.replaceChild(nouv, lien.firstChild);
      pts.textContent = nb(d.total) + " pts"; pts.hidden = false;
      lien.title = "Mon profil" + (d.titre ? " · " + d.titre : "");
    }
    var c = null;
    try { c = JSON.parse(sessionStorage.getItem("th-equip") || "null"); if (c) maj(c); } catch (e) {}
    var frais = c && c._t && Date.now() - c._t < 5 * 60000;
    if (!frais) TH.rpc("mon_equipement").then(function (d) { d._t = Date.now(); try { sessionStorage.setItem("th-equip", JSON.stringify(d)); } catch (e) {} maj(d); }).catch(function () { pts.hidden = true; });
  };
  function oublierBulle() { try { sessionStorage.removeItem("th-equip"); sessionStorage.removeItem("th-pass"); } catch (e) {} }

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

  /* =================== Fiche d'un élève au survol (façon Dofus) =================== */
  var fiche = null, ficheCache = {}, ficheId = null, ficheMasque = null;
  var NOMS_CLASSES = function (id) { return ((window.TH_CLASSES || []).filter(function (c) { return c.id === id; })[0] || {}).nom || ""; };
  function placerFiche(x, y) {
    if (!fiche) return;
    var w = fiche.offsetWidth, h = fiche.offsetHeight, m = 14;
    var gx = x + m + w > innerWidth - 8 ? x - m - w : x + m;
    var gy = y + m + h > innerHeight - 8 ? y - m - h : y + m;
    fiche.style.left = Math.max(8, gx) + "px"; fiche.style.top = Math.max(8, gy) + "px";
  }
  function remplirFiche(base, d) {
    fiche.innerHTML = "";
    var orn = d && d.ornement && d.ornement.style, bnr = d && d.banniere && d.banniere.style;
    fiche.className = "pa-fiche vue" + (orn ? " orn-" + orn : "");
    if (bnr) fiche.appendChild(el("span", { class: "pf-fond bn bn-" + bnr }));
    if (orn) { fiche.appendChild(el("span", { class: "pf-coin hg" })); fiche.appendChild(el("span", { class: "pf-coin hd" })); fiche.appendChild(el("span", { class: "pf-coin bg" })); fiche.appendChild(el("span", { class: "pf-coin bd" })); }
    var av = (d && d.avatar) || base.avatar, ti = d && !d.simple ? d.titre : (base.titre ? { nom: base.titre, rarete: base.titre_rarete || "commun" } : null);
    var tete = el("div", { class: "pf-tete" }, [
      cadre(av, 54, base.prenom, orn),
      el("div", { class: "pf-id" }, [
        el("div", { class: "pf-nom" }, [document.createTextNode(base.prenom + " " + base.initiale + "."),
          d && d.saison ? el("span", { class: "pf-niveau", texte: "Palier " + d.saison.palier }) : null]),
        ti ? el("div", { class: "pf-titre r-" + ti.rarete, texte: "« " + ti.nom + " »" }) : el("div", { class: "pf-titre pf-sans", texte: "Sans titre" }),
        el("div", { class: "pf-classe" }, [d && d.en_ligne ? el("i", { class: "pa-point" }) : null, document.createTextNode(NOMS_CLASSES((d && d.classe) || base.classe) + (d && d.en_ligne ? " · en ligne" : ""))])
      ])
    ]);
    fiche.appendChild(tete);
    if (!d) { fiche.appendChild(el("div", { class: "pf-charge", texte: "…" })); return; }
    if (d.simple) return;
    if (d.saison) {
      var pct = d.saison.objectif ? Math.min(100, d.saison.points / d.saison.objectif * 100) : 0;
      fiche.appendChild(el("div", { class: "pf-saison" }, [
        el("div", { class: "pf-ligne" }, [el("span", { texte: d.saison.nom.split("·")[0].trim() }), el("b", { texte: d.saison.palier + " / " + d.saison.paliers + " paliers" })]),
        el("div", { class: "pf-barre" }, [el("i", { style: "width:" + pct + "%" })])
      ]));
    }
    if (d.vitrine && d.vitrine.length) fiche.appendChild(el("div", { class: "pf-vitrine" }, d.vitrine.map(function (b) { return badge(b, 30); })));
    fiche.appendChild(el("div", { class: "pf-stats" }, [
      el("span", {}, [el("b", { texte: "🔥 " + d.serie + " j" }), el("small", { texte: "série" })]),
      el("span", {}, [el("b", { texte: "🏅 " + d.recompenses }), el("small", { texte: "récompenses" })]),
      el("span", {}, [el("b", { texte: "✓ " + d.termines }), el("small", { texte: "activités finies" })])
    ]));
  }
  function attacherFiche(noeud, base) {
    if (!base) return;
    base.id = base.id || null;   // sans le script 05, pas d'identifiant : fiche simple (avatar, prénom, titre)
    function montrer(e) {
      clearTimeout(ficheMasque);
      if (!fiche) { fiche = el("div", { class: "pa-fiche", role: "tooltip" }); document.body.appendChild(fiche); }
      ficheId = base.id || base.prenom;
      remplirFiche(base, ficheCache[base.id] && ficheCache[base.id].d);
      fiche.classList.add("vue");
      placerFiche(e.clientX, e.clientY);
      var c = ficheCache[base.id];
      if (!base.id) { remplirFiche(base, { simple: true }); placerFiche(e.clientX, e.clientY); return; }
      if (!c || Date.now() - c.t > 60000) {
        TH.rpc("fiche_eleve", { p_id: base.id }).then(function (d) {
          ficheCache[base.id] = { d: d, t: Date.now() };
          if (ficheId === base.id && fiche.classList.contains("vue")) { remplirFiche(base, d); placerFiche(e.clientX, e.clientY); }
        }).catch(function (err) {
          try { console.warn("Fiche élève :", err && err.message); } catch (x) {}
          if (ficheId === base.id && fiche.classList.contains("vue")) { remplirFiche(base, { simple: true }); }
        });
      }
    }
    function cacher() { ficheMasque = setTimeout(function () { if (fiche) fiche.classList.remove("vue"); ficheId = null; }, 60); }
    noeud.addEventListener("mouseenter", montrer);
    noeud.addEventListener("mousemove", function (e) { placerFiche(e.clientX, e.clientY); });
    noeud.addEventListener("mouseleave", cacher);
    // tablette / téléphone : un appui montre la fiche quelques secondes
    noeud.addEventListener("touchstart", function (e) { var t = e.touches[0]; montrer({ clientX: t.clientX, clientY: t.clientY }); ficheMasque = setTimeout(cacher, 3500); }, { passive: true });
  }

  /* =================== Bandeau « Mon pass » de l'accueil (fin, entièrement cliquable) =================== */
  function carteAccueil(zone, p) {
    var s = saisonCourante(p);
    if (!s) return;
    var av = trouver(p, p.avatar), ti = trouver(p, p.titre);
    var prochain = (s.paliers || []).filter(function (pl) { return !pl.debloque; })[0];
    var nouveaux = nouveauxPaliers(p, s, "moi");
    zone.innerHTML = "";
    zone.className = "pa-accueil pa-bandeau-pass pa-cliquable";
    zone.onclick = function (e) { if (!e.target.closest("a")) location.href = lienProfil("pass"); };
    var pts = el("b");
    var r = prochain ? trouver(p, prochain.recompense) : null;
    zone.appendChild(avatar(av, 40, (window.TH_ACCES || {}).prenom));
    zone.appendChild(el("div", { class: "pb-id" }, [el("div", { class: "pa-sur", texte: "Mon pass · " + s.nom.split("·")[0].trim() }),
      el("div", { class: "pa-titre-eq", texte: ti ? ti.nom : "Pas encore de titre" })]));
    zone.appendChild(el("div", { class: "pb-prog" }, [
      el("div", { class: "pb-chiffres" }, [el("span", {}, [compteur(pts, s.points, "saison-" + s.id), document.createTextNode(" / " + nb(s.objectif) + " pts")]),
        p.reserve > 0 ? el("span", { class: "pa-reserve", texte: "🎒 " + nb(p.reserve) }) : null]),
      barreSaison(s)]));
    if (r) zone.appendChild(el("a", { class: "pb-prochain r-" + r.rarete, href: lienProfil("pass"), title: "Prochaine récompense" }, [
      r.type === "avatar" ? avatar(r, 30) : el("span", { class: "pa-titre-ico petit", texte: r.nom === "???" ? "?" : "“ ”" }),
      el("span", {}, [el("b", { texte: r.nom }), el("small", { texte: "encore " + nb(Math.max(0, prochain.seuil - s.points)) + " pts" })])]));
    zone.appendChild(el("span", { class: "pb-fleche", texte: "→" }));
    if (nouveaux.length) { zone.classList.add("nouveau"); setTimeout(function () { confettis(zone); }, 700);
      zone.title = (nouveaux.length > 1 ? nouveaux.length + " nouveaux paliers" : "Nouveau palier") + " débloqué !"; }
    zone.hidden = false;
  }

  /* =================== Élèves en ligne =================== */
  function enLigne(zone) {
    var avant = "";
    function dessiner(d) {
      if (!d || !d.visible) { zone.hidden = true; return; }
      var liste = d.liste || [], cle = liste.map(function (x) { return x.id || x.prenom; }).join("|");
      if (cle === avant && zone.childNodes.length) return;
      var anciens = avant.split("|"); avant = cle;
      zone.innerHTML = "";
      zone.hidden = false;
      zone.appendChild(el("div", { class: "pa-sur" }, [el("i", { class: "pa-point" }), document.createTextNode("En ligne · " + liste.length)]));
      var l = el("div", { class: "pa-enligne" });
      liste.forEach(function (x) {
        var arrive = anciens[0] !== "" && anciens.indexOf(x.id || x.prenom) < 0;
        var q = el("span", { class: "pa-qui" + (x.moi ? " moi" : "") + (arrive ? " arrive" : "") }, [avatar(x.avatar, 34, x.prenom), el("span", { texte: x.prenom })]);
        attacherFiche(q, x);
        l.appendChild(q);
      });
      if (!liste.length) l.appendChild(el("span", { class: "aide", texte: "Personne pour l'instant." }));
      zone.appendChild(l);
    }
    function tour() { TH.rpc("connectes").then(dessiner).catch(function () { zone.hidden = true; }); }
    tour(); setInterval(function () { if (!document.hidden) tour(); }, 20000);
  }

  /* =================== Classement de la question du jour =================== */
  function classement(zone, acces) {
    var periode = "saison", tout = false;
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
      var n = tout ? liste.length : 5;
      liste.slice(0, n).forEach(function (x) { ol.appendChild(ligne(x, max)); });
      if (moi && liste.indexOf(moi) >= n) { ol.appendChild(el("li", { class: "pa-sep", texte: "…" })); ol.appendChild(ligne(moi, max)); }
      if (!liste.length) ol.appendChild(el("li", { class: "aide", texte: "Aucun élève." }));
      zone.appendChild(ol);
      if (liste.length > 5) {
        var b = el("button", { type: "button", class: "pa-voir", texte: tout ? "Réduire" : "Voir toute la classe (" + liste.length + ")" });
        b.onclick = function () { tout = !tout; dessiner(liste); };
        zone.appendChild(b);
      }
      cascade(ol);
    }
    function ligne(x, max) {
      var jauge = el("i");
      var li = el("li", { class: (x.moi ? "moi " : "") + (x.rang <= 3 && x.points > 0 ? "podium p" + x.rang : "") }, [
        el("span", { class: "pa-pos", texte: x.rang <= 3 && x.points > 0 ? ["🥇", "🥈", "🥉"][x.rang - 1] : x.rang }), avatar(x.avatar, 26, x.prenom),
        el("span", { class: "pa-n" }, [el("b", { texte: x.prenom + " " + x.initiale + "." }), x.titre ? el("small", { class: x.titre_rarete ? "r-" + x.titre_rarete : "", texte: x.titre }) : null]),
        el("span", { class: "pa-pts", texte: nb(x.points) + " pts" }),
        el("span", { class: "pa-jauge" }, [jauge])
      ]);
      remplir(jauge, x.points / max * 100);
      attacherFiche(li, x);
      return li;
    }
    function tour() {
      TH.rpc("quiz_classement", { p_periode: periode, p_classe: acces.role === "prof" ? classeProf : null })
        .then(dessiner).catch(function () { zone.hidden = true; });
    }
    tour();
  }

  /* =================== Accueil : les cours d'abord, puis le pass (fin) et la classe =================== */
  window.TH_ACCUEIL_PASS = function (acces) {
    var grille = document.getElementById("grille"), droite = document.getElementById("droite");
    if (!grille) return;
    var zPass = el("section", { class: "pa-accueil", hidden: "" });
    var zLigne = el("div", { class: "pa-carte", hidden: "" });
    var zClass = el("div", { class: "pa-carte", hidden: "" });
    var colonne = droite || grille;
    if (acces.role === "eleve") {
      grille.parentNode.insertBefore(zPass, grille.nextSibling);
      colonne.appendChild(zLigne);
      var dejaVu = passEnCache();
      if (dejaVu) carteAccueil(zPass, dejaVu);
      charger().then(function (p) { carteAccueil(zPass, p); }).catch(function () {});
      enLigne(zLigne);
    }
    colonne.appendChild(zClass);
    classement(zClass, acces);
  };

  /* =================== Page « Mon profil » =================== */
  var REGLES = {
    activites: ["Activités", function (n) { return n === 0 ? "Offert" : "Terminer " + n + " activité" + (n > 1 ? "s" : ""); }],
    sans_faute: ["Sans faute", function (n) { return "Obtenir 20/20 à " + n + " activité" + (n > 1 ? "s" : ""); }],
    points: ["Points", function (n) { return "Atteindre " + nb(n) + " points"; }],
    quiz_justes: ["Question du jour", function (n) { return n + " bonne" + (n > 1 ? "s" : "") + " réponse" + (n > 1 ? "s" : "") + " à la question du jour"; }],
    serie: ["Séries", function (n) { return "Série de " + n + " jours à la question du jour"; }],
    entrainements: ["Entraînement", function (n) { return n + " entraînement" + (n > 1 ? "s" : "") + " réussi" + (n > 1 ? "s" : ""); }],
    paliers: ["Pass", function (n) { return "Débloquer " + n + " palier" + (n > 1 ? "s" : "") + " du pass"; }],
    saisons: ["Saisons", function (n) { return "Compléter " + n + " saison" + (n > 1 ? "s" : "") + " à 100 %"; }]
  };
  function regleTexte(r) {
    if (!r || !r.type) return null;
    var g = REGLES[r.type]; return g ? g[1](Number(r.seuil) || 0) : null;
  }
  function conditionTexte(r) {
    if (r.condition === "auto") return regleTexte(r.regle) || "Automatique";
    return r.condition === "pass" ? "Dans le pass" : r.condition === "ressources" ? "En terminant certaines activités" : "Donné par le prof";
  }
  // Avatar dans son cadre (ornement)
  function cadre(a, taille, prenom, orn) {
    var c = el("span", { class: "orn-cadre" + (orn ? " orn-" + orn : ""), style: "--t:" + taille + "px" }, [avatar(a, taille, prenom)]);
    return c;
  }
  // Badge hexagonal
  function badge(b, taille, verrou) {
    var n = el("span", { class: "bdg r-" + ((b && b.rarete) || "commun") + (verrou ? " verrou" : ""), style: "--t:" + (taille || 44) + "px", title: b ? b.nom : "" },
      [el("span", { class: "bdg-in", texte: verrou ? "🔒" : ((b && b.symbole) || "★") })]);
    return n;
  }
  function apercuBanniere(style, h) { return el("span", { class: "bn bn-" + (style || "atelier") + " bn-mini", style: "height:" + (h || 56) + "px" }); }

  var ONGLETS = [["pass", "Pass"], ["badges", "Badges"], ["collection", "Collection"], ["activites", "Activités"], ["points", "Points"]];
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
    if (onglet === "quiz" || onglet === "collection-badges") onglet = "badges";
    if (!ONGLETS.some(function (o) { return o[0] === onglet; })) onglet = "pass";
    var vueSaison = null, ongletColl = "avatar";
    var D = { pass: null, quiz: null, acts: {}, prog: [] };

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
      D = { pass: r[0], quiz: r[1], acts: r[2] || {}, prog: r[3] || [] };
    }
    var rec = function (id) { return trouver(D.pass, id); };
    var possede = function (id) { return (D.pass.obtenues || []).indexOf(id) >= 0; };

    /* ----- Couverture façon Clash Royale ----- */
    function couverture() {
      var p = D.pass, s = saisonCourante(p) || p.saisons[0];
      var av = rec(p.avatar), ti = rec(p.titre), orn = rec(p.ornement), bn = rec(p.banniere);
      var paliers = (p.stats && p.stats.paliers) || 0;
      var classeNom = ((window.TH_CLASSES || []).filter(function (c) { return c.id === eleve.classe; })[0] || {}).nom || "";
      var cov = el("section", { class: "pr-cover bn bn-" + ((bn && bn.style) || "atelier") });
      var cad = cadre(av, 112, eleve.prenom, orn && orn.style);
      cad.appendChild(el("span", { class: "pr-niveau", title: "Paliers débloqués", texte: paliers }));
      if (moiMeme) { cad.classList.add("pa-cliquable"); cad.title = "Changer d'avatar"; cad.onclick = function () { ongletColl = "avatar"; aller("collection"); }; }
      var trophee = el("b");
      cov.appendChild(el("div", { class: "pr-haut" }, [
        cad,
        el("div", { class: "pr-id" }, [
          el("h1", { texte: (eleve.prenom || "") + " " + (eleve.nom || "") }),
          ti ? el("div", { class: "pr-titre r-" + ti.rarete, texte: ti.nom }) : el("div", { class: "pr-titre vide-t", texte: moiMeme ? "Choisis un titre dans ta collection" : "Sans titre" }),
          el("div", { class: "pr-classe", texte: classeNom })
        ]),
        el("div", { class: "pr-trophees" }, [
          el("div", { class: "pr-tr" }, [el("span", { class: "pr-tr-ico", texte: "🏆" }), compteur(trophee, p.total, moiMeme ? "total" : null), el("small", { texte: "points" })]),
          s ? el("div", { class: "pr-saison-mini" }, [el("small", { texte: s.nom.split("·")[0].trim() + " · " + Math.round(s.points / s.objectif * 100) + " %" }), barreSaison(s)]) : null,
          D.quiz ? el("div", { class: "pr-serie", texte: "🔥 " + (D.quiz.serie || 0) + " j de série" }) : null
        ])
      ]));
      // Vitrine de badges (5 emplacements)
      var vit = el("div", { class: "pr-vitrine" });
      var liste = (p.vitrine || []).map(rec).filter(Boolean);
      for (var k = 0; k < 5; k++) {
        var b = liste[k];
        var slot = el(moiMeme ? "button" : "span", { class: "pr-slot" + (b ? "" : " vide"), type: moiMeme ? "button" : null, title: b ? b.nom + " · " + (regleTexte(b.regle) || "") : (moiMeme ? "Ajouter un badge" : "") },
          [b ? badge(b, 54) : el("span", { class: "pr-plus", texte: moiMeme ? "+" : "" })]);
        if (!moiMeme) slot.removeAttribute("type");
        if (moiMeme) slot.onclick = function () { aller("badges"); };
        vit.appendChild(slot);
      }
      var nbB = (p.recompenses || []).filter(function (r) { return r.type === "badge"; }).length;
      var nbO = (p.recompenses || []).filter(function (r) { return r.type === "badge" && possede(r.id); }).length;
      cov.appendChild(el("div", { class: "pr-bas" }, [
        el("div", {}, [el("div", { class: "pr-lab", texte: "Vitrine · " + nbO + " / " + nbB + " badges" }), vit]),
        moiMeme ? el("button", { class: "btn pr-perso", type: "button", texte: "🎨 Personnaliser" }) : null
      ]));
      var bp = cov.querySelector(".pr-perso"); if (bp) bp.onclick = function () { ongletColl = "banniere"; aller("collection"); };
      return cov;
    }

    function dessiner() {
      zone.innerHTML = "";
      if (!moiMeme) zone.appendChild(el("div", { class: "pa-vue-prof" }, [
        document.createTextNode("Vue prof · profil de " + eleve.prenom + " " + eleve.nom + " (lecture seule)"),
        el("a", { class: "btn", href: racine() + "prof/index.html#pass", texte: "← Espace prof" })]));
      zone.appendChild(couverture());
      var bar = el("div", { class: "onglets pa-onglets", role: "tablist" });
      ONGLETS.forEach(function (o) {
        var b = el("button", { type: "button", class: "onglet" + (o[0] === onglet ? " actif" : ""), texte: o[1] });
        b.onclick = function () { aller(o[0]); };
        bar.appendChild(b);
      });
      zone.appendChild(bar);
      var corps = el("div", { class: "pa-corps pa-apparait" });
      zone.appendChild(corps);
      ({ pass: vuePass, badges: vueBadges, collection: vueCollection, activites: vueActivites, points: vuePoints })[onglet](corps, D.pass);
    }
    function aller(o) {
      onglet = o;
      try { history.replaceState(null, "", location.search + "#" + o); } catch (e) { location.hash = o; }
      dessiner();
      var b = document.querySelector(".pa-onglets"); if (b && b.getBoundingClientRect().top < 0) b.scrollIntoView({ behavior: CALME ? "auto" : "smooth" });
    }
    window.addEventListener("hashchange", function () { var h = location.hash.replace("#", ""); if (h !== onglet && ONGLETS.some(function (o) { return o[0] === h; })) aller(h); });
    async function recharger() { oublierBulle(); D.pass = await charger(cible, true); dessiner(); majBulle(); }

    /* ----- Onglet Pass : piste verticale façon Brawl Stars ----- */
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
      var info = sv.statut === "a_venir" ? "Commence le " + dateCourte(sv.debut) + (sv.points > 0 ? " · " + nb(sv.points) + " pts de réserve t'attendent" : "")
        : sv.statut === "terminee" ? "Terminée (" + dateCourte(sv.debut) + " → " + dateCourte(sv.fin) + ")"
        : "Du " + dateCourte(sv.debut) + " au " + dateCourte(sv.fin);
      var sc = el("b");
      corps.appendChild(el("div", { class: "vp-tete" }, [
        el("div", {}, [el("h2", { texte: sv.nom }), el("small", { texte: info })]),
        el("div", { class: "vp-score" }, [compteur(sc, sv.points), el("span", { texte: " / " + nb(sv.objectif) + " pts" })]),
        sv.id === p.courante && p.reserve > 0 ? el("div", { class: "pa-reserve", texte: "🎒 " + nb(p.reserve) + " pts en réserve pour la saison suivante" }) : null
      ]));
      var nouveaux = moiMeme && sv.id === p.courante ? nouveauxPaliers(p, sv, "moi") : [];
      var piste = el("div", { class: "vp-piste" });
      var prec = 0, marque = false;
      (sv.paliers || []).forEach(function (pl, k) {
        var r = rec(pl.recompense) || { nom: "—", type: "titre", rarete: "commun" };
        var etat = pl.debloque ? "obtenu" : pl.en_attente ? "attente" : "avenir";
        // segment de piste entre le palier précédent et celui-ci
        var seg = el("i");
        var pctSeg = sv.points >= pl.seuil ? 100 : sv.points <= prec ? 0 : (sv.points - prec) / (pl.seuil - prec) * 100;
        var ligne = el("div", { class: "vp-ligne " + etat + " r-" + r.rarete + (nouveaux.indexOf(pl.rang) >= 0 ? " nouveau" : "") + (sv.points > pl.seuil ? " au-dela" : "") });
        ligne.appendChild(el("div", { class: "vp-seuil" }, [el("b", { texte: nb(pl.seuil) }), el("small", { texte: "pts" })]));
        ligne.appendChild(el("div", { class: "vp-rail" }, [el("span", { class: "vp-seg" }, [seg]), el("span", { class: "vp-noeud", texte: etat === "obtenu" ? "✓" : pl.rang })]));
        var visuel = r.type === "avatar" ? avatar(r, 52) : r.type === "badge" ? badge(r, 52) : r.type === "ornement" ? cadre(null, 40, "?", r.style)
          : r.type === "banniere" ? apercuBanniere(r.style, 44) : el("span", { class: "pa-titre-ico", texte: r.nom === "???" ? "?" : "“ ”" });
        var types = { avatar: "Avatar", titre: "Titre", badge: "Badge", ornement: "Ornement", banniere: "Bannière" };
        var bas = etat === "obtenu" ? "✓ Obtenu" : etat === "attente" ? "🔒 Dès le " + dateCourte(sv.debut) : sv.statut === "a_venir" ? nb(pl.seuil) + " pts" : "Encore " + nb(Math.max(0, pl.seuil - sv.points)) + " pts";
        ligne.appendChild(el("a", { class: "vp-carte", href: "#collection", title: "Voir la collection" }, [
          el("span", { class: "vp-vis" }, [visuel]),
          el("span", { class: "vp-txt" }, [el("b", { texte: r.nom }), el("small", { texte: (types[r.type] || "") + " · " + (RARETES[r.rarete] || "") }), el("span", { class: "vp-bas", texte: bas })])
        ]));
        ligne.querySelector(".vp-carte").onclick = function (e) { e.preventDefault(); ongletColl = r.type; aller("collection"); };
        piste.appendChild(ligne);
        (function (i, v) { if (CALME) { i.style.height = v + "%"; return; } setTimeout(function () { i.style.height = v + "%"; }, 200 + k * 90); })(seg, pctSeg);
        // marqueur « tu es ici » juste avant le premier palier non atteint
        if (!marque && sv.statut === "en_cours" && !pl.debloque) {
          marque = true;
          var m = el("div", { class: "vp-ici" }, [el("span"),
            el("span", { class: "vp-ici-rail" }, [cadre(rec(p.avatar), 30, eleve.prenom, rec(p.ornement) && rec(p.ornement).style)]),
            el("span", { class: "vp-ici-txt", texte: (moiMeme ? "Tu es ici · " : "Ici · ") + nb(sv.points) + " pts" })]);
          piste.insertBefore(m, ligne);
        }
        prec = pl.seuil;
      });
      if (!(sv.paliers || []).length) piste.appendChild(el("p", { class: "aide", texte: "Aucun palier pour cette saison." }));
      corps.appendChild(piste);
      cascade(piste);
      var ici = piste.querySelector(".vp-ici");
      if (ici && moiMeme) setTimeout(function () { var r = ici.getBoundingClientRect(); if (r.top > innerHeight * .7) ici.scrollIntoView({ behavior: CALME ? "auto" : "smooth", block: "center" }); }, 900);
      if (nouveaux.length) setTimeout(function () { confettis(piste.querySelector(".nouveau")); }, 700);
      corps.appendChild(el("p", { class: "aide pa-jour", texte: "Entraînement et jeux aujourd'hui : " + nb(p.entrainement_jour) + " / " + nb(p.plafond_jour) + " pts." }));
    }

    /* ----- Onglet Badges ----- */
    function vueBadges(corps, p) {
      var badges = (p.recompenses || []).filter(function (r) { return r.type === "badge"; });
      var vitrine = (p.vitrine || []).slice();
      var obt = badges.filter(function (b) { return possede(b.id); }).length;
      corps.appendChild(el("div", { class: "bg-tete" }, [
        el("div", {}, [el("h2", { texte: obt + " / " + badges.length + " badges" }),
          el("small", { texte: moiMeme ? "Clique sur un badge obtenu pour l'ajouter ou le retirer de ta vitrine (5 maximum)." : "Badges obtenus par l'élève." })]),
        el("div", { class: "pa-barre bg-barre" }, [el("i", { style: "width:" + (badges.length ? obt / badges.length * 100 : 0) + "%" })])
      ]));
      var groupes = {}, ordre = [];
      badges.forEach(function (b) {
        var k = b.regle && REGLES[b.regle.type] ? REGLES[b.regle.type][0] : (b.condition === "pass" ? "Pass" : "Spéciaux");
        if (!groupes[k]) { groupes[k] = []; ordre.push(k); } groupes[k].push(b);
      });
      ordre.forEach(function (k) {
        corps.appendChild(el("h3", { class: "pa-seq", texte: k }));
        var g = el("div", { class: "bg-grille" });
        groupes[k].forEach(function (b) {
          var ok = possede(b.id), dans = vitrine.indexOf(b.id) >= 0;
          var val = b.regle && p.stats ? Number(p.stats[b.regle.type]) || 0 : null, seuil = b.regle ? Number(b.regle.seuil) || 0 : null;
          var prog = !ok && val != null && seuil ? el("span", { class: "bg-prog" }, [el("span", { class: "pa-act-b" }, [el("i", { style: "width:" + Math.min(100, val / seuil * 100) + "%" })]),
            el("small", { texte: nb(Math.min(val, seuil)) + " / " + nb(seuil) })]) : null;
          var c = el(ok && moiMeme ? "button" : "div", { class: "bg-carte r-" + b.rarete + (ok ? " ok" : "") + (dans ? " vitrine" : ""), type: ok && moiMeme ? "button" : null }, [
            badge(b, 62, !ok && b.nom === "???"),
            el("b", { texte: b.nom }),
            el("small", { texte: regleTexte(b.regle) || conditionTexte(b) }),
            prog,
            dans ? el("span", { class: "bg-epingle", texte: "📌 En vitrine" }) : null
          ]);
          if (!(ok && moiMeme)) c.removeAttribute("type");
          if (ok && moiMeme) c.onclick = async function () {
            var v = vitrine.slice(), i = v.indexOf(b.id);
            if (i >= 0) v.splice(i, 1); else { if (v.length >= 5) v.shift(); v.push(b.id); }
            c.disabled = true;
            try { await TH.rpc("vitrine_definir", { p_badges: v }); await recharger(); } catch (e) { c.disabled = false; }
          };
          g.appendChild(c);
        });
        corps.appendChild(g); cascade(g);
      });
    }

    /* ----- Onglet Collection : avatars, titres, ornements, bannières ----- */
    function vueCollection(corps, p) {
      var TYPES = [["avatar", "Avatars"], ["titre", "Titres"], ["ornement", "Ornements"], ["banniere", "Bannières"]];
      if (!TYPES.some(function (t) { return t[0] === ongletColl; })) ongletColl = "avatar";
      var ob = el("div", { class: "pa-choix" });
      TYPES.forEach(function (o) {
        var n = (p.recompenses || []).filter(function (r) { return r.type === o[0]; }).length;
        var k = (p.recompenses || []).filter(function (r) { return r.type === o[0] && possede(r.id); }).length;
        var b = el("button", { type: "button", class: ongletColl === o[0] ? "actif" : "", texte: o[1] + " · " + k + "/" + n });
        b.onclick = function () { ongletColl = o[0]; dessiner(); };
        ob.appendChild(b);
      });
      corps.appendChild(ob);
      var aides = { avatar: "ton portrait, visible par toute la classe", titre: "affiché sous ton nom", ornement: "le cadre autour de ton avatar et de ta fiche quand on te survole", banniere: "le fond de ta page de profil et de ta fiche" };
      if (moiMeme) corps.appendChild(el("p", { class: "aide", texte: "Clique sur un objet débloqué pour l'équiper : " + aides[ongletColl] + "." }));
      var grille = el("div", { class: "pa-grille" + (ongletColl === "banniere" ? " larges" : "") });
      var ordreR = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
      (p.recompenses || []).filter(function (r) { return r.type === ongletColl; })
        .sort(function (a, b) { return ordreR[a.rarete] - ordreR[b.rarete]; })
        .forEach(function (r) {
          var ok = possede(r.id), equipe = p[ongletColl] === r.id;
          var vis = ongletColl === "avatar" ? avatar(ok ? r : { symbole: "🔒", couleur: "#2e2e36" }, 54)
            : ongletColl === "ornement" ? cadre(rec(p.avatar), 48, eleve.prenom, r.style)
            : ongletColl === "banniere" ? apercuBanniere(r.style, 70)
            : el("span", { class: "pa-titre-ico", texte: ok ? "“ ”" : "🔒" });
          var b = el("button", { type: "button", class: "pa-objet r-" + r.rarete + (ok ? "" : " verrou") + (equipe ? " equipe" : ""),
            title: ok ? (equipe ? "Équipé · cliquer pour retirer" : "Équiper") : conditionTexte(r) }, [
            vis, el("span", { class: "pa-nom", texte: r.nom }), puceRarete(r.rarete),
            el("span", { class: "pa-type", texte: ok ? (equipe ? "✓ Équipé" : (moiMeme ? "Équiper" : "Obtenu")) : conditionTexte(r) })
          ]);
          if (ok && moiMeme) b.onclick = async function () {
            b.disabled = true; b.classList.add("pa-clic");
            try { await TH.rpc("equiper", { p_type: ongletColl, p_recompense: equipe ? null : r.id }); await recharger(); } catch (e) { b.disabled = false; }
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
        if (b) { b.replaceChild(cadre(d.avatar, 26, acces.prenom, d.ornement), b.firstChild); b.classList.remove("pa-pop"); void b.offsetWidth; b.classList.add("pa-pop"); }
      }).catch(function () {});
    }

    /* ----- Onglet Activités ----- */
    function vueActivites(corps) {
      var prog = {}; D.prog.forEach(function (x) { prog[x.ressource] = x; });
      var res = (window.CATALOGUE || []).filter(function (r) { return r.classe === eleve.classe && r.fichier && r.en_ligne && !/^https?:/.test(r.fichier) && r.type !== "lien"; });
      if (!res.length) { corps.appendChild(el("div", { class: "vide", texte: "Aucune ressource en ligne pour l'instant." })); return; }
      var parSeq = {}, ordre = [];
      res.forEach(function (r) { var k = r.sequence || "Autres"; if (!parSeq[k]) { parSeq[k] = []; ordre.push(k); } parSeq[k].push(r); });
      ordre.forEach(function (seq) {
        corps.appendChild(el("h3", { class: "pa-seq", texte: seq }));
        var l = el("div", { class: "pa-acts" });
        parSeq[seq].forEach(function (r) {
          var id = r.classe + "/" + r.fichier, g = prog[id], a = D.acts[id];
          var pct = g ? (g.termine ? 100 : Math.round(Number(g.avancement) || 0)) : 0;
          var etat = g ? (g.termine ? "Terminé" + (g.score != null ? " · " + String(g.score).replace(".", ",") + "/20" : "") : (g.avancement != null ? pct + " %" : "Commencé")) : "Pas commencé";
          var puce = !a ? null : a.statut === "ferme" ? el("span", { class: "pa-statut ferme", texte: "🔒 Fermée" })
            : a.gagne != null ? el("span", { class: "pa-statut gagne", texte: (a.suspect ? "⏳ " : "✓ +") + (a.suspect ? "en attente du prof" : a.gagne + " pts") })
            : a.statut === "revision" ? el("span", { class: "pa-statut", texte: "Révision" }) : null;
          var i = el("i");
          var ligne = el(moiMeme ? "a" : "div", { class: "pa-act" + (g && g.termine ? " fini" : ""), href: moiMeme ? racine() + "voir.html?r=" + encodeURIComponent(id) : null }, [
            el("span", { class: "pa-act-t" }, [el("b", { texte: r.titre }), el("small", { texte: etat + (g && g.maj_le ? " · " + new Date(g.maj_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "") })]),
            el("span", { class: "pa-act-b" }, [i]), puce]);
          if (!moiMeme) ligne.removeAttribute("href");
          remplir(i, pct);
          l.appendChild(ligne);
        });
        corps.appendChild(l); cascade(l);
      });
    }

    /* ----- Onglet Points ----- */
    function vuePoints(corps, p) {
      var t = el("table", { class: "pa-table" });
      (p.journal || []).forEach(function (x) {
        var quoi = x.ressource ? titreRessource(x.ressource) : (SOURCES[x.source] || x.source);
        var note = x.suspect && x.points === 0 ? " · terminé trop vite, en attente du prof" : "";
        t.appendChild(el("tr", {}, [
          el("td", { texte: new Date(x.cree_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) }),
          el("td", { texte: (SOURCES[x.source] || x.source) }), el("td", { texte: quoi + note }),
          el("td", { class: "pa-pts", texte: (x.points > 0 ? "+" : "") + x.points })]));
      });
      if (!(p.journal || []).length) t.appendChild(el("tr", {}, [el("td", { texte: "Termine une activité pour gagner tes premiers points." })]));
      corps.appendChild(t);
    }

    zone.appendChild(el("p", { class: "aide", texte: "Chargement…" }));
    try { await toutCharger(); dessiner(); } catch (e) { erreur(e); }
  };

  window.TH_PASS = { avatar: avatar, cadre: cadre, badge: badge, charger: charger, absent: absent, compteur: compteur, remplir: remplir, confettis: confettis };
})();
