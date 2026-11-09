/* pass.js · Pass de progression, profil, classement de la question du jour, élèves en ligne.
   Tout est calculé par le serveur (scripts Supabase 03 et 04) : la page ne fait qu'afficher.
   Si les scripts ne sont pas installés, les blocs restent masqués. */
(function () {
  var RARETES = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire", holo: "Holo" };
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


  /* =================== Pass en pause : aperçu flouté =================== */
  var CADENAS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function bientot(type) {
    var faux = type === "paliers"
      ? el("div", { class: "bt-flou tb-paliers", "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function () { return el("span"); }))
      : el("div", { class: "bt-flou tb-pass", "aria-hidden": "true" }, [el("span", { class: "tb-rond" }), el("span", { class: "tb-lignes" }, [el("i", { style: "width:40%" }), el("i", { class: "j" })])]);
    return el("section", { class: "th-bientot" + (type === "paliers" ? " grand" : "") }, [faux,
      el("div", { class: "bt-voile" }, [el("span", { class: "bt-cadenas", html: CADENAS }),
        el("b", {}, [document.createTextNode("Pass de progression · Prochainement"),
          el("small", { texte: type === "paliers" ? "Titres, bannières, badges et avatars à débloquer en faisant tes activités." : "Bientôt : des récompenses à débloquer en faisant tes activités." })])])]);
  }
  window.TH_PASS_BIENTOT = bientot;

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
      if (!window.TH_PASS_ACTIF) { zPass.hidden = false; zPass.appendChild(bientot()); }
      else {
        var dejaVu = passEnCache();
        if (dejaVu) carteAccueil(zPass, dejaVu);
        charger().then(function (p) { carteAccueil(zPass, p); }).catch(function () {});
      }
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
    saisons: ["Saisons", function (n) { return "Compléter " + n + " saison" + (n > 1 ? "s" : "") + " à 100 %"; }],
    perf: ["Rang", function (n) { return "Atteindre " + nb(n) + " points de performance"; }],
    legende: ["Succès ultime", function () { return "Rang maximum et toutes les activités de l'année à 20/20"; }]
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
  var BCOUL = { commun: ["#c7ced6", "#7c8792", "#2d343c"], rare: ["#9ff5d2", "#22b884", "#0a3f2e"], epique: ["#e2ccff", "#9a5cf2", "#33155e"], legendaire: ["#ffe7a6", "#e9a02c", "#5c3205"] };
  /* Pictogrammes des badges (symbole « ic:nom » dans l'éditeur) : dessinés, pas d'emoji */
  var T = 'fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"';
  var PICTOS = {
    pfs: ["Triangle du PFS", '<path d="M36 60 50 36 64 60Z" ' + T + '/><circle cx="50" cy="36" r="2.6" fill="#fff"/><circle cx="36" cy="60" r="2.6" fill="#fff"/><circle cx="64" cy="60" r="2.6" fill="#fff"/>'],
    vect: ["Vecteur", '<path d="M37 62 61 38M61 38H52M61 38v9" ' + T + '/>'],
    eclair: ["Éclair", '<path d="M53 33 41 52h9l-3 15 12-20h-9z" fill="#fff"/>'],
    cible: ["Cible", '<circle cx="50" cy="50" r="12" ' + T + '/><circle cx="50" cy="50" r="4" fill="#fff"/>'],
    feu: ["Flamme", '<path d="M50 33s10 9 10 18a10 10 0 0 1-20 0c0-4.5 2.5-7 2.5-7s0 5.5 3.5 5.5c0-8 4-11 4-16.5z" fill="#fff"/>'],
    livre: ["Livre", '<path d="M50 40c-4-3-9-4-14-3v22c5-1 10 0 14 3 4-3 9-4 14-3V37c-5-1-10 0-14 3zM50 40v22" ' + T + '/>'],
    pivot: ["Liaison", '<path d="M33 50h34" ' + T + '/><rect x="43" y="41" width="14" height="18" rx="2" ' + T + '/>'],
    poutre: ["Poutre", '<path d="M34 46q16 11 32 0" ' + T + '/><path d="M34 49l-4.5 8h9zM66 49l-4.5 8h9z" fill="#fff"/>'],
    drapeau: ["Drapeau", '<path d="M40 64V36M40 37h20l-5 7 5 7H40" ' + T + '/>'],
    couronne: ["Couronne", '<path d="M35 60 33 42l9 7 8-11 8 11 9-7-2 18z" fill="#fff"/><circle cx="50" cy="34" r="2.6" fill="#fff"/>'],
    engr: ["Engrenage", '<path d="M50 35l3 4 5-1 1 5 4 3-3 4 3 4-4 3-1 5-5-1-3 4-3-4-5 1-1-5-4-3 3-4-3-4 4-3 1-5 5 1z" fill="#fff"/><circle cx="50" cy="50" r="4.5" fill="rgba(0,0,0,.55)"/>'],
    etoile: ["Étoile", '<path d="M50 34l4.5 9.5 10.5 1.2-7.8 7.2 2.1 10.4L50 57l-9.3 5.3 2.1-10.4-7.8-7.2 10.5-1.2z" fill="#fff"/>'],
    check: ["Validé", '<path d="M37 51l9 9 17-19" ' + T + '/>'],
    bulle: ["Question", '<path d="M36 40a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H48l-8 6v-6a4 4 0 0 1-4-4z" ' + T + '/><path d="M47 44a3.5 3.5 0 1 1 4 3.5V50" ' + T + '/>'],
    montagne: ["Sommet", '<path d="M32 62 45 40l6 9 4-5 11 18z" ' + T + '/><path d="M45 40v-7l6 3-6 3" ' + T + '/>'],
    calendrier: ["Calendrier", '<rect x="36" y="38" width="28" height="24" rx="3" ' + T + '/><path d="M36 46h28M43 34v7M57 34v7" ' + T + '/>'],
    chrono: ["Chrono", '<circle cx="50" cy="52" r="12" ' + T + '/><path d="M50 52v-6M47 35h6M50 35v5" ' + T + '/>'],
    cle: ["Clé", '<circle cx="43" cy="45" r="7" ' + T + '/><path d="M48 50l14 14M58 60l4-4" ' + T + '/>'],
    ampoule: ["Ampoule", '<path d="M44 56c0-4-6-6-6-13a12 12 0 0 1 24 0c0 7-6 9-6 13z" ' + T + '/><path d="M45 61h10M46 65h8" ' + T + '/>'],
    camera: ["Caméra", '<rect x="35" y="42" width="22" height="16" rx="3" ' + T + '/><path d="M57 47l8-4v14l-8-4" ' + T + '/>'],
    puce: ["Puce", '<rect x="40" y="40" width="20" height="20" rx="2" ' + T + '/><path d="M45 34v6M55 34v6M45 60v6M55 60v6M34 45h6M34 55h6M60 45h6M60 55h6" ' + T + '/>']
  };
  window.TH_PICTOS = PICTOS;
  var nBdg = 0;
  function badge(b, taille, verrou) {
    var r = (b && b.rarete) || "commun", c = BCOUL[r], id = "bdg" + (++nBdg);
    var fond = r === "holo"
      ? '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fe3ff"/><stop offset=".35" stop-color="#8dffd2"/><stop offset=".65" stop-color="#ff9eea"/><stop offset="1" stop-color="#a98bff"/></linearGradient>'
      : '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + (c || BCOUL.commun)[0] + '"/><stop offset=".5" stop-color="' + (c || BCOUL.commun)[1] + '"/><stop offset="1" stop-color="' + (c || BCOUL.commun)[2] + '"/></linearGradient>';
    var sym = (b && b.symbole) || "", picto = verrou ? null : PICTOS[sym.replace(/^ic:/, "")] && /^ic:/.test(sym) ? PICTOS[sym.slice(3)][1] : !sym ? PICTOS.etoile[1] : null;
    if (verrou) picto = '<rect x="41" y="49" width="18" height="14" rx="2.5" fill="#fff"/><path d="M45 49v-4a5 5 0 0 1 10 0v4" ' + T + '/>';
    var n = el("span", { class: "bdg r-" + r + (verrou ? " verrou" : ""), style: "--t:" + (taille || 44) + "px", title: b && b.nom ? b.nom : "" });
    n.innerHTML = '<svg viewBox="0 0 100 110" aria-hidden="true"><defs>' + fond + '</defs>' +
      '<path d="M50 6 L90 28 L90 74 L50 104 L10 74 L10 28 Z" fill="url(#' + id + ')" stroke="' + (c ? c[2] : "#3a2a6e") + '" stroke-width="2"/>' +
      '<path d="M50 18 L79 34 L79 68 L50 90 L21 68 L21 34 Z" fill="rgba(0,0,0,.32)" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>' +
      '<path d="M50 6 L90 28 L90 38 L50 18 L10 38 L10 28 Z" fill="rgba(255,255,255,.28)"/>' +
      (picto ? '<g transform="translate(0 4)">' + picto + '</g>' : '') + '</svg>';
    if (!picto) n.appendChild(el("span", { class: "bdg-in", texte: sym }));
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
    var passOff = !window.TH_PASS_ACTIF && moiMeme;
    var onglets = passOff ? ONGLETS.filter(function (o) { return o[0] === "activites"; }) : ONGLETS;
    if (!onglets.some(function (o) { return o[0] === onglet; })) onglet = passOff ? "activites" : "pass";
    var vueSaison = null, ongletColl = "avatar";
    var D = { pass: null, quiz: null, acts: {}, prog: [], profil: null };
    var NOUVEAU = !passOff && ((window.TH_CONFIG && window.TH_CONFIG.passClasses) || []).indexOf(eleve.classe) >= 0;

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
        TH.rest("progression?select=ressource,avancement,score,termine,maj_le&eleve=eq." + (id || (TH.session() || { user: {} }).user.id)).catch(function () { return []; }),
        NOUVEAU ? TH.rpc("mon_profil", id ? { p_eleve: id } : {}).catch(function () { return null; }) : null
      ]);
      D = { pass: r[0], quiz: r[1], acts: r[2] || {}, prog: r[3] || [], profil: r[4] };
      if (NOUVEAU && !D.profil) NOUVEAU = false;   // script 09 pas encore installé : ancien profil
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
      if (moiMeme && !passOff) { cad.classList.add("pa-cliquable"); cad.title = "Changer d'avatar"; cad.onclick = function () { ongletColl = "avatar"; aller("collection"); }; }
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
      if (NOUVEAU) { dessinerNouveau(); return; }
      zone.innerHTML = "";
      if (!moiMeme) zone.appendChild(el("div", { class: "pa-vue-prof" }, [
        document.createTextNode("Vue prof · profil de " + eleve.prenom + " " + eleve.nom + " (lecture seule)"),
        el("a", { class: "btn", href: racine() + "prof/index.html#pass", texte: "← Espace prof" })]));
      zone.appendChild(couverture());
      var bar = el("div", { class: "onglets pa-onglets", role: "tablist" });
      onglets.forEach(function (o) {
        var b = el("button", { type: "button", class: "onglet" + (o[0] === onglet ? " actif" : ""), texte: o[1] });
        b.onclick = function () { aller(o[0]); };
        bar.appendChild(b);
      });
      if (passOff) { zone.appendChild(bientot("paliers")); ["Pass", "Badges", "Collection"].forEach(function (t) {
        bar.appendChild(el("span", { class: "onglet verrou", title: "Prochainement" }, [document.createTextNode(t), el("span", { class: "th-puce", texte: "Bientôt" })])); }); }
      zone.appendChild(bar);
      var corps = el("div", { class: "pa-corps pa-apparait" });
      zone.appendChild(corps);
      ({ pass: vuePass, badges: vueBadges, collection: vueCollection, activites: vueActivites, points: vuePoints })[onglet](corps, D.pass);
    }
    function aller(o) {
      if (NOUVEAU) { ouvrir(o); return; }
      onglet = o;
      try { history.replaceState(null, "", location.search + "#" + o); } catch (e) { location.hash = o; }
      dessiner();
      var b = document.querySelector(".pa-onglets"); if (b && b.getBoundingClientRect().top < 0) b.scrollIntoView({ behavior: CALME ? "auto" : "smooth" });
    }
    window.addEventListener("hashchange", function () { var h = location.hash.replace("#", ""); if (h !== onglet && onglets.some(function (o) { return o[0] === h; })) aller(h); });
    async function recharger() {
      oublierBulle(); D.pass = await charger(cible, true);
      if (NOUVEAU) D.profil = await TH.rpc("mon_profil", cible ? { p_eleve: cible } : {}).catch(function () { return D.profil; });
      dessiner(); majBulle();
    }

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
        var r = rec(pl.recompense) || { nom: "Récompense bientôt disponible", type: "bientot", rarete: "commun" };
        var etat = pl.debloque ? "obtenu" : pl.en_attente ? "attente" : "avenir";
        // segment de piste entre le palier précédent et celui-ci
        var seg = el("i");
        var pctSeg = sv.points >= pl.seuil ? 100 : sv.points <= prec ? 0 : (sv.points - prec) / (pl.seuil - prec) * 100;
        var ligne = el("div", { class: "vp-ligne " + etat + " r-" + r.rarete + (nouveaux.indexOf(pl.rang) >= 0 ? " nouveau" : "") + (sv.points > pl.seuil ? " au-dela" : "") });
        ligne.appendChild(el("div", { class: "vp-seuil" }, [el("b", { texte: nb(pl.seuil) }), el("small", { texte: "pts" })]));
        ligne.appendChild(el("div", { class: "vp-rail" }, [el("span", { class: "vp-seg" }, [seg]), el("span", { class: "vp-noeud", texte: etat === "obtenu" ? "✓" : pl.rang })]));
        var visuel = r.type === "bientot" ? badge({ rarete: "commun" }, 46, true) : r.type === "avatar" ? avatar(r, 52) : r.type === "badge" ? badge(r, 52) : r.type === "ornement" ? cadre(null, 40, "?", r.style)
          : r.type === "banniere" ? apercuBanniere(r.style, 44) : el("span", { class: "pa-titre-ico", texte: r.nom === "???" ? "?" : "“ ”" });
        var types = { avatar: "Avatar", titre: "Titre", badge: "Badge", ornement: "Ornement", banniere: "Bannière" };
        var bas = etat === "obtenu" ? "✓ Obtenu" : etat === "attente" ? "🔒 Dès le " + dateCourte(sv.debut) : sv.statut === "a_venir" ? nb(pl.seuil) + " pts" : "Encore " + nb(Math.max(0, pl.seuil - sv.points)) + " pts";
        ligne.appendChild(el("a", { class: "vp-carte", href: "#collection", title: "Voir la collection" }, [
          el("span", { class: "vp-vis" }, [visuel]),
          el("span", { class: "vp-txt" }, [el("b", { texte: r.nom }), el("small", { texte: r.type === "bientot" ? "Bientôt" : (types[r.type] || "") + " · " + (RARETES[r.rarete] || "") }), el("span", { class: "vp-bas", texte: bas })])
        ]));
        ligne.querySelector(".vp-carte").onclick = function (e) { e.preventDefault(); if (r.type === "bientot") return; ongletColl = r.type; aller("collection"); };
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


    /* =================== Nouveau profil (classes du pass : rang, saison, badges) =================== */
    var NOMS_RANGS = ["Apprenti", "Technicien", "Ingénieur", "Expert"];
    var METAUX = [
      { c: "#a99cff", a: "#c9c4d6", b: "#6b6478", d: "#2c2834", s: "#e9e6f0", sym: "bloc" },
      { c: "#ff6fa8", a: "#ffb38a", b: "#d2553a", d: "#5e1d16", s: "#ffe0cc", sym: "cle" },
      { c: "#5fd3ff", a: "#dfe8ff", b: "#5b6fd6", d: "#1c2160", s: "#e8f2ff", sym: "engr", ailes: true },
      { c: "#f5b74a", a: "#ffe3a0", b: "#e58a1f", d: "#6a2a07", s: "#fff3d6", sym: "etoile", ailes: true, couronne: true }
    ];
    var SYMB = {
      bloc: '<rect x="40" y="38" width="9" height="9" rx="1.5"/><rect x="51" y="38" width="9" height="9" rx="1.5"/><rect x="40" y="49" width="9" height="9" rx="1.5"/><rect x="51" y="49" width="9" height="5" rx="1.5"/>',
      cle: '<path d="M43 40a7 7 0 1 0 6 11l9 9 4-4-9-9a7 7 0 0 0-10-7zm2 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>',
      engr: '<path d="M50 36l3 4 5-1 1 5 4 3-3 4 3 4-4 3-1 5-5-1-3 4-3-4-5 1-1-5-4-3 3-4-3-4 4-3 1-5 5 1z"/><circle cx="50" cy="48" r="4.5" fill="#0b0f14"/>',
      etoile: '<path d="M50 34l4.5 9.5 10.5 1.2-7.8 7.2 2.1 10.4L50 57l-9.3 5.3 2.1-10.4-7.8-7.2 10.5-1.2z"/>'
    };
    var nEmb = 0;
    function embleme(i, gris) {
      var m = METAUX[i] || METAUX[0], id = "em" + (++nEmb);
      var ailes = m.ailes ? '<path d="M18 44 C6 38 2 26 4 16 C10 24 16 26 22 28 Z" fill="url(#' + id + 'w)" stroke="' + m.d + '" stroke-width="1.2"/><path d="M82 44 C94 38 98 26 96 16 C90 24 84 26 78 28 Z" fill="url(#' + id + 'w)" stroke="' + m.d + '" stroke-width="1.2"/><path d="M16 54 C6 50 3 42 4 34 C9 40 14 42 21 43 Z" fill="url(#' + id + 'w)" stroke="' + m.d + '" stroke-width="1.2" opacity=".9"/><path d="M84 54 C94 50 97 42 96 34 C91 40 86 42 79 43 Z" fill="url(#' + id + 'w)" stroke="' + m.d + '" stroke-width="1.2" opacity=".9"/>' : "";
      var cour = m.couronne ? '<path d="M36 12 L42 4 L50 11 L58 4 L64 12 Z" fill="url(#' + id + 'm)" stroke="' + m.d + '" stroke-width="1.2"/>' : "";
      var s = el("span", { class: "ps-emb" + (gris ? " gris" : "") });
      s.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><defs>' +
        '<linearGradient id="' + id + 'm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + m.a + '"/><stop offset=".45" stop-color="' + m.b + '"/><stop offset="1" stop-color="' + m.d + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + m.d + '"/><stop offset="1" stop-color="' + m.b + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + m.a + '"/><stop offset="1" stop-color="' + m.d + '"/></linearGradient>' +
        '<linearGradient id="' + id + 'h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
        ailes + cour +
        '<path d="M50 12 L82 30 L82 66 L50 86 L18 66 L18 30 Z" fill="url(#' + id + 'm)" stroke="' + m.d + '" stroke-width="1.5"/>' +
        '<path d="M50 21 L74 35 L74 61 L50 76 L26 61 L26 35 Z" fill="url(#' + id + 'i)" stroke="' + m.a + '" stroke-opacity=".6" stroke-width="1.2"/>' +
        '<path d="M50 12 L82 30 L82 40 L50 24 L18 40 L18 30 Z" fill="url(#' + id + 'h)"/>' +
        '<g fill="' + m.s + '" opacity=".95">' + SYMB[m.sym] + '</g></svg>';
      return s;
    }
    var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
    function chev() { var s = el("span", { class: "ps-chev" }); s.innerHTML = CHEV; return s; }
    function cfgClasse() { return (window.TH_CLASSES || []).filter(function (c) { return c.id === eleve.classe; })[0] || {}; }
    function seqSaison() { return cfgClasse().saisons || {}; }
    function ordreSequences() { var o = (cfgClasse().sequences || []).slice(); (cfgClasse().onglets || []).forEach(function (g) { (g.sequences || []).forEach(function (s) { o.push(s); }); }); return o; }
    function mode() { return cfgClasse().profil || {}; }
    var ANNUEL = !!mode().annuel, SANS_RANG = mode().rang === false, BADGES_BIENTOT = mode().badges === "bientot";
    function court(seq) {
      var t = String(seq || "").replace(/^[^·]*·\s*/, "").replace(/^Comment\s+/i, "").replace(/\s*\?\s*$/, "");
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    function saisonsTriees() { return (D.profil.saisons || []).slice().sort(function (a, b) { return a.debut < b.debut ? -1 : 1; }); }
    function numeroCourant() { var l = saisonsTriees(); for (var i = 0; i < l.length; i++) if (l[i].id === D.profil.courante) return i + 1; return 1; }
    function sequencesDe(n) { if (ANNUEL) return ordreSequences(); var m = seqSaison(); return ordreSequences().filter(function (s) { return m[s] === n; }); }
    function idRes(r) { return r.classe + "/" + r.fichier; }
    function ressourcesDe(seq) {
      return (window.CATALOGUE || []).filter(function (r) {
        return r.classe === eleve.classe && r.sequence === seq && r.fichier && r.en_ligne && !/^https?:/.test(r.fichier) && (r.type === "activite" || r.type === "td")
          && !estDefi(idRes(r));
      });
    }
    function estDefi(id) { return (D.profil.defis || []).some(function (d) { return d.ressource === id; }); }
    function defiDe(seq) {
      return (D.profil.defis || []).filter(function (d) {
        var r = (window.CATALOGUE || []).filter(function (x) { return idRes(x) === d.ressource; })[0];
        return r && r.sequence === seq;
      })[0];
    }
    function progDe(id) { return D.prog.filter(function (x) { return x.ressource === id; })[0]; }
    function rangDe(perf) { var s = [0].concat(D.profil.seuils || []), i = 0; s.forEach(function (v, k) { if (perf >= v) i = k; }); return Math.min(i, 3); }
    function seuilsRangs() { return [0].concat(D.profil.seuils || [1000, 3000, 5000]); }
    function pctTexte(b) { return b.pct + " % " + (D.profil.nb_eleves > 1 ? "de la classe" : ""); }
    function dateFr(d) { return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); }
    function texteBadge(b) {
      var r = b.regle;
      if (r && r.type === "score_min") {
        var l = r.ressources || [], m = Number(r.min) || 0;
        if (l.length === 1 && estDefi(l[0])) return m ? "Obtenir " + Math.round(m / 20 * 100) + " % ou plus au grand défi de fin de séquence." : "Participer au grand défi de fin de séquence, quel que soit le score.";
        return (m ? "Obtenir au moins " + String(m).replace(".", ",") + "/20 à " : "Terminer ") + (l.length === 1 ? "« " + titreRessource(l[0]) + " »" : l.length + " activités") + ".";
      }
      if (r && r.type === "legende") return "Succès ultime : atteindre le rang " + NOMS_RANGS[3] + " et réussir toutes les activités de l'année à 20/20. Vérifié à la fin de la dernière saison.";
      if (r && r.type === "perf") return "Atteindre " + nb(r.seuil) + " points de performance.";
      if (r) return (regleTexte(r) || "Automatique") + ".";
      if (b.ressources && b.ressources.length) return "Terminer " + (b.ressources.length === 1 ? "« " + titreRessource(b.ressources[0]) + " »" : b.ressources.length + " activités") + ".";
      return "Dans le pass ou donné par ton professeur.";
    }
    function badgeDefi(b) { return b.regle && b.regle.type === "score_min" && (b.regle.ressources || []).some(estDefi); }
    function ligneActivite(r) {
      var id = idRes(r), g = progDe(id), gain = (D.profil.gains || {})[id], a = (D.profil.activites || {})[id];
      var st = g && g.termine ? "ok" : g ? "cours" : "afaire";
      var info = st === "ok" ? "Terminé" + (g.score != null ? " · " + String(g.score).replace(".", ",") + "/20" : "") + (gain && gain.perf ? " · perf +" + gain.perf : "")
        : st === "cours" ? "En cours" + (g.avancement != null ? " · " + Math.round(+g.avancement) + " %" : "") : "À faire";
      var pts = gain ? "+" + nb(gain.points) + " pts" : a ? "jusqu'à " + nb(a.points + a.bonus_max) : "";
      var ligne = el(moiMeme ? "a" : "div", { class: "ps-act " + st + (r.partie ? " " + r.partie : "") }, [
        el("span", { class: "ps-st", texte: st === "ok" ? "✓" : st === "cours" ? "…" : "" }),
        el("span", { class: "ps-act-t" }, [el("b", { texte: r.titre }), el("small", { texte: info })]),
        el("span", { class: "ps-pts" + (gain ? "" : " faible"), texte: pts })]);
      if (moiMeme) ligne.setAttribute("href", racine() + "voir.html?r=" + encodeURIComponent(id));
      return ligne;
    }
    function pli(titre, droite, contenu, cls, ouvert) {
      var d = el("details", { class: "ps-pli" + (cls ? " " + cls : "") });
      if (ouvert) d.open = true;
      d.appendChild(el("summary", {}, [el("b", { texte: titre }), el("span", { texte: droite })]));
      d.appendChild(el("div", { class: "ps-pli-in" }, contenu));
      return d;
    }

    /* ----- Panneau (en bas sur téléphone, au centre sur ordinateur) ----- */
    var PAN = null, panVue = null, panArg = null, focusAvant = null;
    function panneau() {
      if (PAN) return PAN;
      var voile = el("div", { class: "ps-voile" });
      var ret = el("button", { class: "ps-ic ps-retour", type: "button", "aria-label": "Retour" }); ret.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>';
      var fer = el("button", { class: "ps-ic", type: "button", "aria-label": "Fermer" }); fer.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      var titre = el("h2", { id: "ps-titre" });
      var corps = el("div", { class: "ps-corps" });
      var sec = el("section", { class: "ps-pan", role: "dialog", "aria-modal": "true", "aria-labelledby": "ps-titre" }, [el("div", { class: "ps-tete" }, [ret, titre, fer]), corps]);
      document.body.appendChild(voile); document.body.appendChild(sec);
      PAN = { voile: voile, sec: sec, titre: titre, corps: corps, ret: ret };
      fer.onclick = fermer; voile.onclick = fermer;
      ret.onclick = function () { ouvrir(ret._vers || "badges"); };
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panVue) fermer(); });
      return PAN;
    }
    var TITRES = { pass: "Pass de saison", collection: "Personnaliser", activites: "Toutes mes activités", points: "Historique des points", rang: "Rang annuel", saison: "Activités de la saison", badges: "Badges" };
    function ouvrir(vue, arg) {
      var p = panneau();
      if (!panVue) focusAvant = document.activeElement;
      var memeVue = panVue === vue && panArg === arg;
      panVue = vue; panArg = arg;
      remplirPanneau(memeVue);
      p.voile.classList.add("ouvert"); p.sec.classList.add("ouvert"); document.body.classList.add("ps-fige");
      try { history.replaceState(null, "", location.search + "#" + vue); } catch (e) {}
    }
    function remplirPanneau(garderDefilement) {
      var p = PAN, haut = garderDefilement ? p.corps.scrollTop : 0;
      p.corps.innerHTML = ""; p.titre.textContent = panVue === "pass" && ANNUEL ? "Pass de l'année" : TITRES[panVue] || "";
      p.ret.hidden = panVue !== "badge"; p.ret._vers = "badges";
      ({ pass: function (c) { vuePass(c, D.pass); }, collection: function (c) { vueCollection(c, D.pass); }, activites: function (c) { vueActivites(c); },
         points: function (c) { vuePoints(c, D.pass); }, rang: vueRang, saison: vueSaison2, badges: vueBadges2, badge: vueFiche })[panVue](p.corps, panArg);
      p.corps.scrollTop = haut;
    }
    function fermer() {
      if (!PAN) return;
      PAN.voile.classList.remove("ouvert"); PAN.sec.classList.remove("ouvert"); document.body.classList.remove("ps-fige");
      panVue = null; panArg = null;
      try { history.replaceState(null, "", location.search); } catch (e) {}
      if (focusAvant && focusAvant.focus) focusAvant.focus({ preventScroll: true });
    }

    /* ----- Page ----- */
    function dessinerNouveau() {
      zone.innerHTML = "";
      zone.classList.add("ps-page");
      if (!moiMeme) zone.appendChild(el("div", { class: "pa-vue-prof" }, [
        document.createTextNode("Vue prof · profil de " + eleve.prenom + " " + eleve.nom + " (lecture seule)"),
        el("a", { class: "btn", href: racine() + "prof/index.html#pass", texte: "← Espace prof" })]));
      var cov = couverture(); cov.classList.add("ps-cover"); if (BADGES_BIENTOT) cov.classList.add("ps-sans-badges"); zone.appendChild(cov);
      var P = D.profil, l = saisonsTriees(), n = numeroCourant(), s = l[n - 1] || {};
      // Bandeau de saison → pass
      var seqs = sequencesDe(n);
      if (ANNUEL) {
        var segA = el("span", { class: "ps-segs", style: "grid-template-columns:repeat(" + Math.max(1, seqs.length) + ",1fr)" });
        var nomsA = el("span", { class: "ps-noms", style: "grid-template-columns:repeat(" + Math.max(1, seqs.length) + ",1fr)" });
        seqs.forEach(function (q) {
          var rs = ressourcesDe(q), f = rs.filter(function (r) { var g = progDe(idRes(r)); return g && g.termine; }).length;
          var fini = rs.length && f === rs.length;
          segA.appendChild(el("i", { class: fini ? "" : "" }, [el("u", { style: "width:" + (rs.length ? f / rs.length * 100 : 0) + "%" })]));
          nomsA.appendChild(el("span", { class: fini ? "fini" : rs.length ? "en" : "", texte: (fini ? "✓ " : "") + court(q) }));
        });
        var banA = el("button", { class: "ps-saison", type: "button" }, [
          el("span", { class: "ps-sh" }, [el("b", { texte: "Pass de l'année" }), el("span", { class: "ps-n", texte: "palier " + (s.debloques || 0) + " / " + (s.paliers || 0) }), chev()]),
          el("span", { class: "ps-jauge" }, [el("i", { style: "width:" + (s.objectif ? Math.min(100, s.points / s.objectif * 100) : 0) + "%" })])]);
        banA.onclick = function () { vueSaison = s.id; ouvrir("pass"); };
        zone.appendChild(banA);
      }
      var seg = el("span", { class: "ps-segs", style: "grid-template-columns:repeat(" + Math.max(1, l.length) + ",1fr)" });
      var noms = el("span", { class: "ps-noms", style: "grid-template-columns:repeat(" + Math.max(1, l.length) + ",1fr)" });
      l.forEach(function (x, k) {
        var pct = x.statut === "terminee" ? 100 : x.statut === "en_cours" ? Math.min(100, x.objectif ? x.points / x.objectif * 100 : 0) : 0;
        seg.appendChild(el("i", { class: k + 1 === n ? "en" : "" }, [el("u", { style: "width:" + pct + "%" })]));
        var sq = sequencesDe(k + 1)[0];
        noms.appendChild(el("span", { class: k + 1 === n ? "en" : x.statut === "terminee" ? "fini" : "", texte: (x.statut === "terminee" ? "✓ " : "") + (sq ? court(sq) : "S" + (k + 1)) }));
      });
      var ban = el("button", { class: "ps-saison", type: "button" }, [
        el("span", { class: "ps-sh" }, [el("b", { texte: "Saison " + n + (s.nom && s.nom.indexOf("·") > 0 ? " · " + s.nom.split("·").slice(1).join("·").trim() : "") }), el("span", { class: "ps-n", texte: n + " / " + l.length })]),
        el("span", { class: "ps-ss", texte: (seqs.length ? seqs.map(court).join(" + ") + " · " : "") + (s.fin ? "fin le " + dateFr(s.fin) : "") }),
        seg, noms,
        el("span", { class: "ps-lien" }, [document.createTextNode("Pass de saison · palier " + (s.debloques || 0) + " / " + (s.paliers || 0)), chev()])]);
      ban.onclick = function () { vueSaison = s.id; ouvrir("pass"); };
      if (!ANNUEL) zone.appendChild(ban);

      // Tuile rang
      var perf = Number(P.perf) || 0, ri = rangDe(perf), se = seuilsRangs(), suiv = se[ri + 1];
      var tR = el("button", { class: "ps-tuile", type: "button" }, [
        el("span", { class: "ps-ic-t" }, [embleme(ri)]),
        el("span", { class: "ps-tx" }, [
          el("span", { class: "ps-h" }, [el("b", { texte: "Rang " + (ri + 1) + " · " + NOMS_RANGS[ri] }), el("span", { class: "ps-chiffre", texte: suiv ? nb(perf) + " / " + nb(suiv) : nb(perf) + " pts" })]),
          el("span", { class: "ps-jauge" }, [el("i", { style: "width:" + (suiv ? Math.min(100, (perf - se[ri]) / (suiv - se[ri]) * 100) : 100) + "%" })]),
          el("small", { texte: suiv ? "Performance · encore " + nb(suiv - perf) + " pts pour " + NOMS_RANGS[ri + 1] : "Rang maximum atteint" })]),
        chev()]);
      tR.onclick = function () { ouvrir("rang"); };
      if (!SANS_RANG) zone.appendChild(tR);

      // Tuile activités de la saison
      var tot = 0, fait = 0, resume = [];
      seqs.forEach(function (q) {
        var rs = ressourcesDe(q), f = rs.filter(function (r) { var g = progDe(idRes(r)); return g && g.termine; }).length;
        tot += rs.length; fait += f; if (rs.length) resume.push(court(q) + " " + f + " / " + rs.length);
      });
      var anneau = el("span", { class: "ps-ic-t" }); var rr = 2 * Math.PI * 23;
      anneau.innerHTML = '<svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="23" fill="none" stroke="var(--border-2,#27313c)" stroke-width="5"/><circle cx="28" cy="28" r="23" fill="none" stroke="var(--accent,#3fd6c6)" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (tot ? rr * fait / tot : 0) + ' 999" transform="rotate(-90 28 28)"/><text x="28" y="33" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">' + (tot ? Math.round(fait / tot * 100) : 0) + '%</text></svg>';
      var tA = el("button", { class: "ps-tuile", type: "button" }, [anneau,
        el("span", { class: "ps-tx" }, [
          el("span", { class: "ps-h" }, [el("b", { texte: ANNUEL ? "Activités de l'année" : "Activités de la saison" }), el("span", { class: "ps-chiffre", texte: fait + " / " + tot })]),
          el("span", { class: "ps-jauge" }, [el("i", { style: "width:" + (tot ? fait / tot * 100 : 0) + "%" })]),
          ANNUEL ? null : el("small", { texte: (resume.join(" · ") || "Aucune activité en ligne pour cette saison") + (s.points != null ? " · pass " + nb(s.points) + " pts" : "") })]),
        chev()]);
      tA.onclick = function () { ouvrir("saison"); };
      zone.appendChild(tA);

      // Tuile badges
      var bs = P.badges || [], ob = bs.filter(function (b) { return b.obtenu; });
      var dern = ob.filter(function (b) { return b.obtenu_le; }).sort(function (a, b) { return a.obtenu_le < b.obtenu_le ? 1 : -1; })[0];
      var tB = el("button", { class: "ps-tuile", type: "button" }, [
        el("span", { class: "ps-ic-t" }, [dern ? badge(dern, 50) : badge({ rarete: "commun", symbole: "ic:etoile" }, 50, true)]),
        el("span", { class: "ps-tx" }, [
          el("span", { class: "ps-h" }, [el("b", { texte: "Badges" }), el("span", { class: "ps-chiffre", texte: ob.length + " / " + bs.length })]),
          dern ? el("small", { class: "ps-dern" }, [document.createTextNode("Dernier : " + dern.nom + " "), el("span", { class: "ps-rar r-" + dern.rarete, texte: (RARETES[dern.rarete] || "") + " · " + dern.pct + " %" })])
            : el("small", { texte: "Pas encore de badge : termine une activité !" })]),
        chev()]);
      tB.onclick = function () { ouvrir("badges"); };
      if (BADGES_BIENTOT) {
        tB = el("button", { class: "ps-tuile", type: "button" }, [
          el("span", { class: "ps-ic-t" }, [badge({ rarete: "commun" }, 50, true)]),
          el("span", { class: "ps-tx" }, [el("span", { class: "ps-h" }, [el("b", { texte: "Badges" }), el("span", { class: "ps-chiffre", texte: "Bientôt" })])]), chev()]);
        tB.onclick = function () { ouvrir("badges"); };
      }
      zone.appendChild(tB);

      // Liens secondaires
      var liens = el("div", { class: "ps-liens" });
      [["activites", "Toutes mes activités"], ["points", "Historique des points"]].forEach(function (x) {
        var b = el("button", { class: "btn", type: "button", texte: x[1] }); b.onclick = function () { if (x[0] === "collection") ongletColl = "avatar"; ouvrir(x[0]); }; liens.appendChild(b);
      });
      if (!ANNUEL) zone.appendChild(liens);
      cascade(zone);
      if (panVue) remplirPanneau(true);
    }

    /* ----- Panneau Rang ----- */
    function vueRang(c) {
      var perf = Number(D.profil.perf) || 0, se = seuilsRangs(), ri = rangDe(perf);
      var recs = (D.pass.recompenses || []).filter(function (r) { return r.regle && r.regle.type === "perf"; });
      c.appendChild(el("p", { class: "ps-info", texte: "Ton rang se gagne avec tes points de performance (ta réussite au-dessus de 10/20, aux activités et aux grands défis). Ils s'additionnent toute l'année." }));
      NOMS_RANGS.forEach(function (nom, i) {
        var atteint = perf >= se[i], ici = i === ri;
        var gains = recs.filter(function (r) { var v = Number(r.regle.seuil) || 0; return v >= se[i] && (i === 3 || v < se[i + 1]); });
        var bulle = el("span", { class: "ps-bulle", role: "tooltip" }, [el("b", { texte: atteint ? "Débloqué" : "À débloquer" })].concat(
          gains.length ? gains.map(function (r) { return el("span", { texte: ({ avatar: "Avatar", titre: "Titre", badge: "Badge", ornement: "Ornement", banniere: "Bannière" })[r.type] + " « " + r.nom + " »" }); })
            : [el("span", { texte: i === 0 ? "Ton profil de départ" : "Récompenses à venir" })]));
        var b = el("button", { type: "button", class: "ps-rang" + (atteint ? "" : " futur") + (ici ? " ici" : ""), style: "--c:" + METAUX[i].c }, [
          embleme(i, !atteint),
          el("span", { class: "ps-rang-t" }, [el("b", { texte: nom }), el("span", { class: "ps-pill", texte: nb(se[i]) + " pts perf" }), ici ? el("span", { class: "ps-ici", texte: moiMeme ? "TU ES ICI" : "ICI" }) : null]),
          el("span", { class: "ps-i", texte: "i", "aria-hidden": "true" }), bulle]);
        b.onclick = function () { var d = b.classList.contains("montre"); [].forEach.call(c.querySelectorAll(".ps-rang.montre"), function (x) { x.classList.remove("montre"); }); if (!d) b.classList.add("montre"); };
        c.appendChild(b);
      });
      var ult = (D.profil.badges || []).filter(function (b) { return b.regle && b.regle.type === "legende"; })[0];
      if (ult) { c.appendChild(el("h3", { class: "ps-sous", texte: "Au-delà du rang " + NOMS_RANGS[3] })); c.appendChild(blocUltime(ult)); }
    }
    function blocUltime(b) {
      var x = el("button", { class: "ps-ultime" + (b.obtenu ? " ok" : ""), type: "button" }, [
        el("span", { class: "ps-ult-b" }, [badge(b, 62, false)]),
        el("span", {}, [el("span", { class: "ps-rar r-holo", texte: "Holo · succès ultime" }), el("b", { texte: b.nom }), el("small", { texte: texteBadge(b) })])]);
      x.onclick = function () { ouvrir("badge", b.id); };
      return x;
    }

    /* ----- Panneau Activités de la saison ----- */
    function vueSaison2(c) {
      var l = saisonsTriees(), n = numeroCourant(), s = l[n - 1] || {};
      PAN.titre.textContent = ANNUEL ? "Activités de l'année" : "Saison " + n + (s.nom && s.nom.indexOf("·") > 0 ? " · " + s.nom.split("·").slice(1).join("·").trim() : "");
      if (!ANNUEL) c.appendChild(el("p", { class: "ps-info" }, [el("b", { texte: "Pass : " + nb(s.points) + " / " + nb(s.objectif) + " pts" }), document.createTextNode(" cette saison · "),
        el("b", { texte: "Performance : +" + nb(D.profil.perf_saison) + " pts" }), document.createTextNode(" pour ton rang.")]));
      var seqs = sequencesDe(n);
      if (!seqs.length) c.appendChild(el("p", { class: "aide", texte: "Aucune séquence n'est encore rattachée à cette saison." }));
      seqs.forEach(function (q) {
        var rs = ressourcesDe(q), f = rs.filter(function (r) { var g = progDe(idRes(r)); return g && g.termine; }).length;
        if (rs.length) c.appendChild(pli(court(q), f + " / " + rs.length, rs.map(ligneActivite)));
        else if (ANNUEL) c.appendChild(el("div", { class: "ps-pli ps-vide" }, [el("span", { texte: court(q) }), el("small", { texte: "bientôt" })]));
        var d = defiDe(q);
        if (d) c.appendChild(blocDefi(d, q));
      });
    }
    function blocDefi(d, q) {
      var req = d.requis || [], ok = req.filter(function (x) { var g = progDe(x); return g && g.termine; }).length;
      var ouvert = d.statut === "ouvert";
      var paliers = (D.profil.badges || []).filter(function (b) { return b.regle && b.regle.type === "score_min" && (b.regle.ressources || []).indexOf(d.ressource) >= 0; })
        .sort(function (a, b) { return (Number(a.regle.min) || 0) - (Number(b.regle.min) || 0); });
      var contenu = [
        el("div", { class: "ps-cond" }, [el("span", { class: "ps-h" }, [el("span", { texte: "Termine toutes les activités de la séquence (le score ne compte pas)" }), el("b", { texte: ok + " / " + req.length })]),
          el("span", { class: "ps-jauge" }, [el("i", { style: "width:" + (req.length ? ok / req.length * 100 : 100) + "%" })])]),
        el("p", { class: "ps-info", texte: "Test de positionnement en jeu, rejouable. Participation : " + d.points + " pts de pass. Score au-dessus de 10/20 : jusqu'à " + d.bonus_max + " pts de performance. Seule l'amélioration de ton meilleur score rapporte." + (d.score != null ? " Ton meilleur score : " + String(d.score).replace(".", ",") + "/20." : "") })];
      paliers.forEach(function (b) {
        var x = el("button", { class: "ps-palier r-" + b.rarete + (b.obtenu ? " ok" : ""), type: "button" }, [badge(b, 40, !b.obtenu && b.nom === "???"),
          el("span", {}, [el("b", { texte: b.nom }), el("small", { texte: texteBadge(b) })]), el("span", { class: "ps-rar r-" + b.rarete, texte: b.pct + " %" })]);
        x.onclick = function () { ouvrir("badge", b.id); };
        contenu.push(x);
      });
      if (ouvert && moiMeme) contenu.push(el("a", { class: "btn primary ps-go", href: racine() + "voir.html?r=" + encodeURIComponent(d.ressource), texte: d.termine ? "Rejouer le défi" : "Relever le défi" }));
      return pli("⚔ Grand défi · " + court(q), ouvert ? (d.termine ? "✓ relevé" : "ouvert") : "🔒 verrouillé", contenu, "ps-defi");
    }

    /* ----- Panneau Badges ----- */
    function caseBadge(b) {
      var x = el("button", { class: "ps-bd" + (b.obtenu ? "" : " verr"), type: "button", "aria-label": b.nom }, [badge(b, 50, !b.obtenu && b.nom === "???")]);
      x.onclick = function () { ouvrir("badge", b.id); };
      return x;
    }
    function vueBadges2(c) {
      if (BADGES_BIENTOT) {
        var msgB = el("p", { class: "ps-info ps-bientot", texte: "🔒 Bientôt disponibles" });
        c.appendChild(msgB);
        ordreSequences().forEach(function (q) {
          var g = el("div", { class: "ps-grille" });
          for (var k = 0; k < 3; k++) {
            var x = el("button", { class: "ps-bd verr", type: "button", "aria-label": "Badge bientôt disponible" }, [badge({ rarete: ["commun", "rare", "epique"][k] }, 50, true)]);
            x.onclick = function () { msgB.classList.remove("flash"); void msgB.offsetWidth; msgB.classList.add("flash"); msgB.scrollIntoView({ block: "nearest", behavior: CALME ? "auto" : "smooth" }); };
            g.appendChild(x);
          }
          c.appendChild(el("div", { class: "ps-gr" }, [el("span", { class: "ps-gr-t", texte: court(q) }), g]));
        });
        return;
      }
      var bs = D.profil.badges || [], l = saisonsTriees(), n = numeroCourant();
      var ult = bs.filter(function (b) { return b.regle && b.regle.type === "legende"; });
      ult.forEach(function (b) { c.appendChild(blocUltime(b)); });
      var reste = bs.filter(function (b) { return ult.indexOf(b) < 0; });
      function groupe(liste) {
        var g = {}, ordre = [];
        liste.forEach(function (b) { var k = b.groupe || ""; if (!g[k]) { g[k] = []; ordre.push(k); } g[k].push(b); });
        return ordre.map(function (k) {
          var base = g[k].filter(function (b) { return !badgeDefi(b); }), df = g[k].filter(badgeDefi);
          return el("div", { class: "ps-gr" }, [k ? el("span", { class: "ps-gr-t", texte: k }) : null,
            base.length ? el("div", { class: "ps-grille" }, base.map(caseBadge)) : null,
            df.length ? el("div", { class: "ps-gr-defi" }, [el("span", { texte: "⚔ Grand défi de fin de séquence" }), el("div", { class: "ps-grille" }, df.map(caseBadge))]) : null]);
        });
      }
      var compte = function (x) { return x.filter(function (b) { return b.obtenu; }).length + " / " + x.length; };
      l.forEach(function (s, k) {
        var x = reste.filter(function (b) { return Number(b.saison) === k + 1; });
        if (!x.length) return;
        var etat = k + 1 < n ? "terminée · " : k + 1 > n ? "à venir · " : "";
        var nom = "Saison " + (k + 1) + (s.nom && s.nom.indexOf("·") > 0 ? " · " + s.nom.split("·").slice(1).join("·").trim() : "");
        c.appendChild(pli(nom, etat + compte(x), groupe(x), "", k + 1 === n));
      });
      var an = reste.filter(function (b) { return !b.saison || b.saison > l.length; });
      if (an.length) c.appendChild(pli("Toute l'année", compte(an), groupe(an), "", !reste.some(function (b) { return Number(b.saison) === n; })));
      if (!bs.length) c.appendChild(el("p", { class: "aide", texte: "Aucun badge pour l'instant." }));
    }
    function vueFiche(c, id) {
      var b = (D.profil.badges || []).filter(function (x) { return x.id === id; })[0];
      if (!b) { ouvrir("badges"); return; }
      var l = saisonsTriees();
      PAN.titre.textContent = b.regle && b.regle.type === "legende" ? "Succès ultime" : b.saison && l[b.saison - 1] ? "Badge · Saison " + b.saison + (b.groupe ? " · " + b.groupe : "") : "Badge" + (b.groupe ? " · " + b.groupe : "");
      var f = el("div", { class: "ps-fiche r-" + b.rarete }, [
        el("span", { class: "ps-gros" + (b.obtenu ? "" : " verr") }, [badge(b, 116, !b.obtenu && b.nom === "???")]),
        el("span", { class: "ps-rar r-" + b.rarete, texte: RARETES[b.rarete] || b.rarete }),
        badgeDefi(b) ? el("span", { class: "ps-tag-defi", texte: "⚔ Grand défi · rejouable, meilleur score gardé" }) : null,
        el("h3", { texte: b.nom }),
        el("p", { texte: (b.obtenu ? "" : "🔒 ") + texteBadge(b) }),
        el("div", { class: "ps-barre" }, [el("span", { class: "ps-h" }, [el("span", { texte: "Obtenu par" }), el("span", { texte: b.pct + " % de la classe" })]),
          el("span", { class: "ps-jauge r" }, [el("i", { style: "width:" + Math.max(b.pct, 1) + "%" })])])]);
      if (b.regle && b.regle.type === "legende") {
        var acts = Object.keys(D.profil.activites || {}).filter(function (k) { var a = D.profil.activites[k]; return a.type === "activite" || a.type === "defi"; });
        var parf = acts.filter(function (k) { var g = progDe(k); return g && g.termine && Number(g.score) >= 20; }).length;
        var se = seuilsRangs(), perf = Number(D.profil.perf) || 0;
        [["Rang " + NOMS_RANGS[3] + " atteint", perf, se[3], "pts perf"], ["Activités réussies à 20/20", parf, acts.length, "activités"]].forEach(function (x) {
          f.appendChild(el("div", { class: "ps-cond" + (x[1] >= x[2] ? " ok" : "") }, [el("span", { class: "ps-h" }, [el("span", { texte: (x[1] >= x[2] ? "✓ " : "○ ") + x[0] }), el("b", { texte: nb(Math.min(x[1], x[2])) + " / " + nb(x[2]) + " " + x[3] })]),
            el("span", { class: "ps-jauge" }, [el("i", { style: "width:" + (x[2] ? Math.min(100, x[1] / x[2] * 100) : 0) + "%" })])]));
        });
      }
      f.appendChild(el("span", { class: "ps-date", texte: b.obtenu ? (b.obtenu_le ? "Débloqué le " + dateFr(b.obtenu_le) : "Débloqué") : "Pas encore débloqué" }));
      if (b.obtenu && moiMeme) {
        var vit = (D.pass.vitrine || []).slice(), dans = vit.indexOf(b.id) >= 0;
        var bt = el("button", { class: "btn" + (dans ? "" : " primary"), type: "button", texte: dans ? "Retirer de ma vitrine" : "📌 Mettre dans ma vitrine" });
        bt.onclick = async function () {
          var i = vit.indexOf(b.id); if (i >= 0) vit.splice(i, 1); else { if (vit.length >= 5) vit.shift(); vit.push(b.id); }
          bt.disabled = true;
          try { await TH.rpc("vitrine_definir", { p_badges: vit }); await recharger(); } catch (e) { bt.disabled = false; }
        };
        f.appendChild(bt);
      }
      c.appendChild(f);
    }

    zone.appendChild(el("p", { class: "aide", texte: "Chargement…" }));
    try {
      await toutCharger(); dessiner();
      var h0 = (location.hash || "").replace("#", "");
      if (NOUVEAU && ({ pass: 1, collection: 1, activites: 1, points: 1, rang: 1, saison: 1, badges: 1 })[h0]) ouvrir(h0);
    } catch (e) { erreur(e); }
  };

  window.TH_PASS = { avatar: avatar, cadre: cadre, badge: badge, charger: charger, absent: absent, compteur: compteur, remplir: remplir, confettis: confettis };
})();
