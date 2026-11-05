/* quiz.js · « Question du jour » : carte sur l'accueil + pop-up avec le personnage.
   Le serveur (Supabase) garde la bonne réponse, le chrono et le score : voir supabase/quiz.sql.
   Tant que ce script SQL n'est pas installé (et pour le compte prof), tout fonctionne en mode aperçu :
   mêmes écrans, rejouables à volonté, rien n'est enregistré. */
(function () {
  var LETTRES = ["A", "B", "C", "D"];
  var IMAGE = "assets/quiz-scene.jpg";
  var APERCU = [
    ["Quelle est la capitale de l'Australie ?", "Canberra", "Sydney", "Melbourne", "Perth"],
    ["Quel est le symbole chimique de l'or ?", "Au", "Ag", "Fe", "Pb"],
    ["En quelle année a eu lieu la prise de la Bastille ?", "1789", "1792", "1804", "1815"],
    ["Quelle planète est la plus proche du Soleil ?", "Mercure", "Vénus", "Mars", "La Terre"],
    ["Combien de bits y a-t-il dans un octet ?", "8", "4", "16", "32"],
    ["Que signifie l'acronyme HTML ?", "HyperText Markup Language", "High Tech Modern Language", "Hyper Transfer Mail Link", "Home Tool Markup Language"]
  ];

  function melanger(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- Serveur de remplacement (aperçu) : question au hasard, rejouable ---------- */
  function apiApercu() {
    var q = APERCU[Math.floor(Math.random() * APERCU.length)], ordre = melanger([0, 1, 2, 3]), debut = 0, etat = { statut: "pret", duree: 20, serie: 0, total: 0 };
    function choix() { return ordre.map(function (o) { return q[1 + o]; }); }
    return {
      etat: function () { return Promise.resolve(etat); },
      demarrer: function () {
        debut = performance.now();
        etat = { statut: "en_cours", duree: 20, restant_ms: 20000, enonce: q[0], choix: choix(), categorie: "Aperçu", serie: 0, total: 0, sorties: 0 };
        return Promise.resolve(etat);
      },
      repondre: function (pos) {
        var ec = (performance.now() - debut) / 1000, ok = pos >= 0 && ordre[pos] === 0 && ec <= 23;
        etat = { statut: "termine", duree: 20, correct: ok, points: ok ? 50 + Math.round(50 * Math.max(0, 1 - ec / 20)) : 0, position: pos,
          position_bonne: ordre.indexOf(0), bonne: q[1], enonce: q[0], choix: choix(), serie: 0, total: 0, sorties: 0 };
        return Promise.resolve(etat);
      },
      sortie: function () { return Promise.resolve(); }
    };
  }
  function apiServeur() {
    return {
      etat: function () { return TH.rpc("quiz_etat"); },
      demarrer: function () { return TH.rpc("quiz_demarrer"); },
      repondre: function (pos) { return TH.rpc("quiz_repondre", { p_position: pos }); },
      sortie: function () { return TH.rpc("quiz_sortie").catch(function () {}); }
    };
  }

  window.TH_QUIZ = function (zone, acces) {
    var el = window.TH_el;
    var racine = document.body.getAttribute("data-racine") || "./";
    var api = apiServeur(), apercu = null, minuteur = null, fin = 0, envoye = false, enCours = false, aQuitte = false;
    var derniere = null, modal = null, scene = null, bulle = null, boutons = [];
    (new Image()).src = racine + IMAGE; // pré-chargement : le pop-up s'ouvre sans attendre

    function jourLong() {
      return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
    }
    function arreter() { if (minuteur) { clearInterval(minuteur); minuteur = null; } enCours = false; }
    function vider(c) { arreter(); c.innerHTML = ""; if (c === zone) reduire(false); }
    // Une fois la question du jour jouée, la carte se réduit à une ligne sur l'accueil
    function reduire(oui) {
      zone.classList.toggle("reduit", oui);
      var g = document.getElementById("grille"); if (g) g.classList.toggle("quiz-reduit", oui);
    }
    function ecranReduit(st) {
      vider(zone); reduire(true);
      var perdu = st.position == null || st.position < 0;
      var voir = el("button", { class: "btn q-revoir", type: "button", texte: "Revoir la question" });
      voir.addEventListener("click", function () { ecranResultat(st, false, true); });
      zone.appendChild(el("div", { class: "q-ligne" }, [
        el("span", { class: "q-label" }, [el("i"), document.createTextNode("Question du jour")]),
        el("span", { class: "q-pastille " + (st.correct ? "ok" : "ko"), texte: st.correct ? "✓ Bonne réponse" : (perdu ? "⏱ Temps écoulé" : "✗ Raté") }),
        el("span", { class: "q-points", texte: st.points > 0 ? "+" + st.points + " pts" : "0 pt" }),
        el("span", { class: "q-puce" }, [document.createTextNode("Série "), el("b", { texte: (st.serie || 0) + " j" })]),
        el("span", { class: "q-puce" }, [document.createTextNode("Total "), el("b", { texte: (st.total || 0) + " pts" })]),
        el("span", { class: "q-demain", texte: "Nouvelle question demain" }),
        voir
      ]));
    }

    function tete(st, label) {
      var stats = el("div", { class: "q-stats" });
      if (st && !apercu) {
        stats.appendChild(el("span", { class: "q-puce" }, [document.createTextNode("Série "), el("b", { texte: (st.serie || 0) + " j" })]));
        stats.appendChild(el("span", { class: "q-puce" }, [document.createTextNode("Total "), el("b", { texte: (st.total || 0) + " pts" })]));
      }
      return el("div", { class: "q-tete" }, [el("span", { class: "q-label" }, [el("i"), document.createTextNode(label)]), stats]);
    }
    function bandeau() {
      if (!apercu) return null;
      return el("div", { class: "q-apercu", texte: apercu === "prof"
        ? "Aperçu prof : rien n'est enregistré, tu peux rejouer à volonté."
        : "Mode aperçu : le score n'est pas encore enregistré (script Supabase à installer)." });
    }

    /* ---------- Pop-up ---------- */
    function ouvrirModal() {
      if (modal) return;
      var fond = el("div", { class: "q-fond" });
      fond.style.backgroundImage = "url('" + racine + IMAGE + "')";
      bulle = el("div", { class: "q-bulle", role: "dialog", "aria-live": "polite", "aria-label": "Question du jour" });
      var x = el("button", { class: "q-fermer", type: "button", "aria-label": "Fermer", texte: "×" });
      x.addEventListener("click", function () { if (!enCours) fermerModal(); });
      scene = el("div", { class: "q-scene" }, [fond, x, bulle]);
      modal = el("div", { class: "q-modal verrou" }, [scene]);
      modal.addEventListener("click", function (e) { if (e.target === modal && !enCours) fermerModal(); });
      document.body.appendChild(modal);
      document.body.style.overflow = "hidden";
      requestAnimationFrame(function () { modal && modal.classList.add("ouvert"); });
    }
    function fermerModal(sansCarte) {
      if (!modal) return;
      arreter(); modal.remove(); modal = scene = bulle = null; boutons = [];
      document.body.style.overflow = "";
      if (!sansCarte && derniere) dessinerCarte(derniere);
    }
    function rejouer() {
      fermerModal(true); apercu = apercu || "prof"; api = apiApercu();
      api.etat().then(function (st) { derniere = st; dessinerCarte(st); });
    }

    /* ---------- Carte de l'accueil ---------- */
    function dessinerCarte(st) {
      if (st.statut === "termine") return apercu ? ecranResultat(st, false) : ecranReduit(st);
      ecranPret(st);
    }
    function ecranPret(st) {
      vider(zone);
      var b = el("button", { class: "btn primary q-go", type: "button", texte: "Découvrir la question du jour" });
      b.addEventListener("click", function () {
        b.disabled = true;
        ouvrirModal();
        bulle.appendChild(el("p", { class: "q-texte", texte: "Prépare-toi…" }));
        setTimeout(function () { api.demarrer().then(dessiner).catch(erreur); }, 800);
      });
      if (bandeau()) zone.appendChild(bandeau());
      zone.appendChild(tete(st, "Question du jour · " + jourLong()));
      zone.appendChild(el("h2", { class: "q-titre", texte: "Une question. " + (st.duree || 20) + " secondes." }));
      zone.appendChild(el("p", { class: "q-texte", texte: "La même pour toutes les classes, renouvelée chaque jour. Chaque point compte pour le classement de ta classe." }));
      zone.appendChild(el("ul", { class: "q-regles" }, [
        el("li", { texte: "Le chrono démarre dès que la question apparaît." }),
        el("li", { texte: "Une seule tentative par jour, actualiser la page ne relance rien." }),
        el("li", { texte: "Si tu quittes la page, la question ne rapporte plus de points." })
      ]));
      zone.appendChild(b);
    }

    /* ---------- Pop-up : la question ---------- */
    function ecranQuestion(st) {
      if (!modal) ouvrirModal();
      arreter(); bulle.innerHTML = ""; envoye = false; enCours = true; aQuitte = (st.sorties || 0) > 0;
      modal.classList.add("verrou"); scene.classList.remove("ok", "ko");
      var total = (st.duree || 20) * 1000;
      fin = performance.now() + st.restant_ms;
      var temps = el("span", { class: "q-temps", texte: Math.ceil(st.restant_ms / 1000) });
      var barre = el("i");
      var chrono = el("div", { class: "q-chrono" }, [el("span", { class: "q-barre" }, [barre]), temps]);
      boutons = st.choix.map(function (txt, i) {
        var b = el("button", { class: "q-rep", type: "button", style: "--i:" + i }, [el("span", { class: "l", texte: LETTRES[i] }), el("span", { texte: txt })]);
        b.addEventListener("click", function () { envoyerReponse(i, b); });
        return b;
      });
      bulle.appendChild(tete(null, st.categorie || "Question du jour"));
      bulle.appendChild(chrono);
      bulle.appendChild(el("h2", { class: "q-enonce", texte: st.enonce }));
      bulle.appendChild(el("div", { class: "q-reps" }, boutons));
      bulle.appendChild(el("div", { class: "q-note" + (aQuitte ? " alerte" : ""),
        texte: aQuitte ? "Tu as quitté la page : cette question ne rapportera pas de points." : "Reste sur cette page jusqu'à ta réponse. Touches A à D possibles." }));

      function envoyerReponse(pos, bouton) {
        if (envoye) return; envoye = true; arreter();
        boutons.forEach(function (x) { x.disabled = true; });
        if (bouton) bouton.classList.add("choisi");
        api.repondre(pos).then(dessiner).catch(erreur);
      }
      st._envoyer = envoyerReponse;
      function tick() {
        var reste = fin - performance.now();
        if (reste <= 0) { temps.textContent = "0"; barre.style.width = "0%"; envoyerReponse(-1, null); return; }
        temps.textContent = Math.ceil(reste / 1000);
        barre.style.width = Math.max(0, reste / total * 100) + "%";
        chrono.classList.toggle("urgent", reste <= 5000);
      }
      tick(); minuteur = setInterval(tick, 100);
    }

    /* ---------- Résultat (dans le pop-up, puis sur la carte) ---------- */
    function ecranResultat(st, dansModal, deplie) {
      var cible;
      if (dansModal && modal) {
        arreter(); bulle.innerHTML = ""; cible = bulle; modal.classList.remove("verrou"); scene.classList.add(st.correct ? "ok" : "ko");
      } else { vider(zone); cible = zone; }
      var perdu = st.position == null || st.position < 0;
      var reps = st.choix.map(function (txt, i) {
        var cls = "q-rep" + (i === st.position_bonne ? " bon" : (i === st.position ? " mauvais" : " neutre"));
        return el("div", { class: cls }, [el("span", { class: "l", texte: LETTRES[i] }), el("span", { texte: txt })]);
      });
      if (!dansModal && bandeau()) cible.appendChild(bandeau());
      cible.appendChild(tete(st, "Question du jour · " + jourLong()));
      cible.appendChild(el("div", { class: "q-verdict " + (st.correct ? "ok" : "ko") }, [
        el("h2", { class: "q-titre", texte: st.correct ? "Bonne réponse" : (perdu ? "Temps écoulé" : "Raté") }),
        el("span", { class: "q-points", texte: st.points > 0 ? "+" + st.points + " pts" : "0 pt" })
      ]));
      cible.appendChild(el("p", { class: "q-enonce q-rappel", texte: st.enonce }));
      cible.appendChild(el("div", { class: "q-reps fini" }, reps));
      if (st.correct && (st.sorties || 0) > 0) cible.appendChild(el("div", { class: "q-note alerte", texte: "Bonne réponse, mais tu as quitté la page : aucun point pour cette fois." }));
      cible.appendChild(el("div", { class: "q-note", texte: apercu ? "" : "Reviens demain pour une nouvelle question." }));
      var actions = el("div", { class: "q-actions" });
      if (deplie && !dansModal) {
        var red = el("button", { class: "btn", type: "button", texte: "Réduire" });
        red.addEventListener("click", function () { ecranReduit(st); });
        actions.appendChild(red);
      }
      if (dansModal) {
        var f = el("button", { class: "btn primary", type: "button", texte: "Fermer" });
        f.addEventListener("click", function () { fermerModal(); });
        actions.appendChild(f);
      }
      if (apercu) {
        var r = el("button", { class: "btn", type: "button", texte: "Rejouer avec une autre question" });
        r.addEventListener("click", rejouer);
        actions.appendChild(r);
      }
      if (actions.childNodes.length) cible.appendChild(actions);
    }

    function dessiner(st) {
      if (!st) return erreur({});
      if (st.statut === "non_eleve") { apercu = "prof"; api = apiApercu(); return api.etat().then(dessiner); }
      derniere = st; courant = st;
      if (st.statut === "en_cours") return ecranQuestion(st);
      if (st.statut === "termine") return modal || apercu ? ecranResultat(st, !!modal) : ecranReduit(st);
      if (modal) fermerModal(true);
      ecranPret(st);
    }
    var courant = null;

    function erreur(e) {
      try { console.error("Question du jour :", e); } catch (x) {}
      var absent = e && (e.status === 404 || e.code === "PGRST202" || /could not find|not find the function/i.test(e.message || ""));
      if (absent && !apercu) { apercu = "install"; api = apiApercu(); if (modal) fermerModal(true); return api.etat().then(dessiner); }
      var cible = modal ? bulle : zone;
      if (!cible) return;
      vider(cible);
      var b = el("button", { class: "btn", type: "button", texte: "Réessayer" });
      b.addEventListener("click", function () { if (modal) fermerModal(true); charger(); });
      cible.appendChild(tete(null, "Question du jour"));
      var reseau = e && (e.status === 0 || e.name === "TypeError" && /fetch|network/i.test(e.message || ""));
      cible.appendChild(el("p", { class: "q-texte", texte: reseau
        ? "Impossible de joindre le serveur. Ta tentative du jour n'est pas perdue : réessaie dans un instant."
        : "Un problème est survenu. Ta tentative du jour n'est pas perdue : réessaie dans un instant." }));
      cible.appendChild(el("p", { class: "q-note", texte: "Détail technique : " + ((e && (e.message || e.code)) || "inconnu") }));
      cible.appendChild(b);
    }

    function charger() {
      vider(zone);
      zone.appendChild(tete(null, "Question du jour"));
      zone.appendChild(el("p", { class: "q-texte", texte: "Chargement…" }));
      api.etat().then(dessiner).catch(erreur);
    }

    /* Anti-triche : quitter l'onglet est signalé au serveur ; recharger la page ne remet pas le chrono à zéro */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && enCours && !envoye) {
        aQuitte = true; api.sortie();
        var n = bulle && bulle.querySelector(".q-note");
        if (n) { n.className = "q-note alerte"; n.textContent = "Tu as quitté la page : cette question ne rapportera pas de points."; }
      }
    });
    window.addEventListener("beforeunload", function (e) {
      if (enCours && !envoye) { e.preventDefault(); e.returnValue = ""; }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && !enCours) { fermerModal(); return; }
      if (!enCours || envoye || !boutons.length) return;
      var i = "abcd".indexOf((e.key || "").toLowerCase());
      if (i < 0) i = "1234".indexOf(e.key);
      if (i >= 0 && boutons[i]) boutons[i].click();
    });

    charger();
  };
})();
