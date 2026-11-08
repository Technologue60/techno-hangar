/* prof-pass.js · Espace prof : En direct, Activités & points, Pass, Alertes & stats.
   Nécessite le script Supabase 03-pass-progression.sql. */
(function () {
  var el = function () { return window.TH_el.apply(null, arguments); };
  var CAT = window.CATALOGUE || [];
  var JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  var JC = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
  var RARETES = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };
  var ETATS = { actif: "Actif", inactif: "Inactif", ailleurs: "Onglet quitté", hors_ligne: "Hors ligne" };
  var SYMBOLES = ["⚙️","🔧","🔩","💡","🔋","⚡","🤖","🚀","🛰️","🛠️","📐","📡","💻","🧲","🔬","🧪","🧠","🦾","🥷","👾","🐉","🦖","🦊","🐺","🦉","🐙","👑","💎","🔥","🌟","🎮","🎧","🏆","🛸","🧙","🧑‍🚀","🦸","🏴‍☠️","🐲","🌋"];
  function classes() { return window.TH_CLASSES || []; }
  function $(id) { return document.getElementById(id); }
  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function msg(e) { return (e && e.message) || String(e); }
  function classeChoisie() { var s = document.querySelector(".choix-classe"); return s ? s.value : "terminale-sti2d"; }
  function nomClasse(id) { var c = classes().filter(function (x) { return x.id === id; })[0]; return c ? c.nom : (id || "Toutes"); }
  function ressourcesClasse(c) { return CAT.filter(function (r) { return r.classe === c && r.fichier && !/^https?:/.test(r.fichier); }); }
  function titreRes(id) { var r = CAT.filter(function (x) { return x.classe + "/" + x.fichier === id; })[0]; return r ? r.titre : (id || "").split("/").pop(); }
  function absent(e) { return e && (e.status === 404 || e.code === "PGRST202" || e.code === "42P01" || /could not find|does not exist|not find the/i.test(e.message || "")); }
  function manque(zone, e) {
    vider(zone);
    zone.appendChild(el("div", { class: "vide", texte: absent(e)
      ? "Le script Supabase « 03-pass-progression.sql » n'est pas encore installé : lance-le dans Supabase → SQL Editor."
      : "Erreur : " + msg(e) }));
  }
  function upsert(table, corps, conflit) {
    return TH.rest(table + (conflit ? "?on_conflict=" + conflit : ""), { method: "POST", body: corps,
      headers: { "Prefer": "resolution=merge-duplicates,return=minimal" } });
  }
  function supprimer(table, filtre) { return TH.rest(table + "?" + filtre, { method: "DELETE", headers: { "Prefer": "return=minimal" } }); }
  function th(liste) { return el("tr", {}, liste.map(function (h) { return el("th", { texte: h }); })); }
  function input(attrs) { return el("input", attrs); }
  function select(options, valeur) {
    var s = el("select");
    options.forEach(function (o) { var x = el("option", { value: o[0], texte: o[1] }); if (String(o[0]) === String(valeur)) x.selected = true; s.appendChild(x); });
    return s;
  }
  function local(dt) { if (!dt) return ""; var d = new Date(dt); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function depuis(dt) {
    var s = Math.max(0, (Date.now() - new Date(dt)) / 1000);
    return s < 60 ? Math.round(s) + " s" : s < 3600 ? Math.round(s / 60) + " min" : Math.floor(s / 3600) + " h " + Math.round(s % 3600 / 60) + " min";
  }
  function bouton(texte, cls, fn) { var b = el("button", { class: "btn" + (cls ? " " + cls : ""), type: "button", texte: texte }); b.onclick = fn; return b; }
  function etat(zone, t, ok) { zone.textContent = t; zone.style.color = ok === false ? "var(--danger)" : ok ? "var(--ok)" : ""; }
  async function eleves(classe) {
    return TH.rest("profils?select=id,nom,prenom,classe&role=eq.eleve" + (classe ? "&classe=eq." + classe : "") + "&order=nom,prenom");
  }
  // Horaires « Me 14:00-18:00; Ve 17:00-19:00 » <-> [{jour,debut,fin}]
  function horairesTexte(h) { return (h || []).map(function (x) { return JC[x.jour - 1] + " " + x.debut + "-" + x.fin; }).join("; "); }
  function horairesLire(t) {
    var out = [];
    (t || "").split(/[;,\n]/).forEach(function (m) {
      m = m.trim(); if (!m) return;
      var r = /^(\S+)\s+(\d{1,2})[:h]?(\d{2})?\s*-\s*(\d{1,2})[:h]?(\d{2})?$/i.exec(m);
      if (!r) throw new Error("Horaire illisible : « " + m + " » (exemple : Me 14:00-18:00)");
      var j = JC.map(function (x) { return x.toLowerCase(); }).indexOf(r[1].slice(0, 2).toLowerCase()) + 1;
      if (!j) throw new Error("Jour inconnu : « " + r[1] + " » (Lu, Ma, Me, Je, Ve, Sa, Di)");
      var p = function (h, mi) { return ("0" + h).slice(-2) + ":" + (mi || "00"); };
      out.push({ jour: j, debut: p(r[2], r[3]), fin: p(r[4], r[5]) });
    });
    return out;
  }

  /* =================== EN DIRECT =================== */
  var minuterie = null;
  async function chargerDirect() {
    var zone = $("d-zone"), c = $("d-classe").value;
    try {
      var liste = await TH.rpc("presence_prof", { p_classe: c || null });
      vider(zone);
      var n = { actif: 0, inactif: 0, ailleurs: 0, hors_ligne: 0 };
      liste.forEach(function (x) { n[x.etat] = (n[x.etat] || 0) + 1; });
      zone.appendChild(el("div", { class: "pp-resume" }, ["actif", "inactif", "ailleurs", "hors_ligne"].map(function (k) {
        return el("span", { class: "pp-etat " + k }, [el("i"), document.createTextNode(ETATS[k] + " : " + n[k])]); })));
      if (!liste.length) { zone.appendChild(el("div", { class: "vide", texte: "Aucun élève connecté ces 30 dernières minutes." })); return; }
      var t = el("table", { class: "tableau" });
      t.appendChild(th(["Élève", "Classe", "État", "Depuis", "Page ouverte", "Dernier signal"]));
      liste.forEach(function (x) {
        t.appendChild(el("tr", { class: "pp-l-" + x.etat }, [
          el("td", { texte: x.nom + " " + x.prenom }), el("td", { texte: nomClasse(x.classe) }),
          el("td", {}, [el("span", { class: "pp-etat " + x.etat }, [el("i"), document.createTextNode(ETATS[x.etat] || x.etat)])]),
          el("td", { texte: x.etat === "hors_ligne" ? "" : depuis(x.depuis) }),
          el("td", { texte: x.page || "" }),
          el("td", { class: "aide", texte: "il y a " + depuis(x.vu_le) })
        ]));
      });
      zone.appendChild(el("div", { class: "tableau-wrap" }, [t]));
    } catch (e) { manque(zone, e); }
  }
  async function chargerCreneaux() {
    var t = $("d-creneaux"), c = classeChoisie(); vider(t);
    $("d-cr-classe").textContent = nomClasse(c);
    try {
      var l = await TH.rest("presence_plages?select=jour,debut,fin&classe=eq." + c + "&order=jour,debut");
      t.appendChild(th(["Jour", "De", "À", ""]));
      if (!l.length) t.appendChild(el("tr", {}, [el("td", { colspan: "4", class: "aide", texte: "Aucun créneau : les élèves voient qui est en ligne dès que le site est ouvert." })]));
      l.forEach(function (x) {
        t.appendChild(el("tr", {}, [el("td", { texte: JOURS[x.jour - 1] }), el("td", { texte: x.debut.slice(0, 5) }), el("td", { texte: x.fin.slice(0, 5) }),
          el("td", {}, [bouton("Retirer", "danger", async function () {
            await supprimer("presence_plages", "classe=eq." + c + "&jour=eq." + x.jour + "&debut=eq." + x.debut); chargerCreneaux(); })])]));
      });
    } catch (e) { manque(t.parentNode, e); }
  }

  /* =================== ACTIVITÉS & POINTS =================== */

  /* ---------- Objectifs du jour / de la semaine (script 08) ---------- */
  function jourISO(d) { return d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }); }
  function datesType(type) {
    var d = new Date(), deb = jourISO(d);
    if (type === "jour") return [deb, deb];
    var f = new Date(d); f.setDate(d.getDate() + ((7 - d.getDay()) % 7)); // jusqu'à dimanche
    return [deb, jourISO(f)];
  }
  function dateCourteFr(x) { return new Date(x + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""); }
  async function chargerObjectifs() {
    var c = classeChoisie(), liste = $("o-liste"), sel = $("o-res");
    if (!liste) return;
    $("o-classe-nom").textContent = nomClasse(c);
    vider(sel);
    ressourcesClasse(c).filter(function (r) { return r.type !== "lien" && r.type !== "outil"; }).forEach(function (r) {
      sel.appendChild(el("option", { value: r.classe + "/" + r.fichier, texte: (r.en_ligne ? "" : "(hors ligne) ") + r.titre + (r.sequence ? " · " + r.sequence : "") }));
    });
    vider(liste);
    try {
      var rows = await TH.rest("objectifs?select=*&classe=eq." + c + "&fin=gte." + jourISO(new Date()) + "&order=debut.asc");
      if (!rows.length) { liste.appendChild(el("p", { class: "aide", texte: "Aucun objectif en cours ou à venir pour cette classe." })); return; }
      var t = el("table", { class: "tableau" });
      t.appendChild(th(["Type", "Activité", "Message", "Dates", ""]));
      var auj = jourISO(new Date());
      rows.forEach(function (o) {
        t.appendChild(el("tr", {}, [
          el("td", { texte: (o.type === "jour" ? "Du jour" : "De la semaine") + (o.debut <= auj ? " · en cours" : " · à venir") }),
          el("td", { texte: titreRes(o.ressource) }),
          el("td", { texte: o.message || "" }),
          el("td", { texte: o.debut === o.fin ? dateCourteFr(o.debut) : dateCourteFr(o.debut) + " → " + dateCourteFr(o.fin) }),
          el("td", {}, [bouton("Supprimer", "danger", async function () { await supprimer("objectifs", "id=eq." + o.id); chargerObjectifs(); })])
        ]));
      });
      liste.appendChild(t);
    } catch (e) {
      liste.appendChild(el("div", { class: "vide", texte: absent(e) ? "Le script Supabase « 08-objectifs.sql » n'est pas encore installé : lance-le dans Supabase → SQL Editor." : "Erreur : " + msg(e) }));
    }
  }

  async function chargerActivites() {
    var c = classeChoisie(), zone = $("a-zone"), et = $("a-etat");
    vider(zone); etat(et, "");
    chargerObjectifs();
    $("a-classe-nom").textContent = nomClasse(c);
    try {
      var rows = await TH.rest("activites?select=*&classe=eq." + c);
      var reg = (await TH.rest("pass_reglages?select=*&classe=eq." + c))[0] || { plafond_jour: 50, decrochage_jours: 7 };
      $("a-plafond").value = reg.plafond_jour; $("a-decro").value = reg.decrochage_jours;
      var idx = {}; rows.forEach(function (r) { idx[r.ressource] = r; });
      var res = ressourcesClasse(c);
      rows.forEach(function (r) { if (!res.some(function (x) { return x.classe + "/" + x.fichier === r.ressource; })) res.push({ classe: c, fichier: r.ressource.split("/").slice(1).join("/"), titre: r.ressource.split("/").pop() + " (hors catalogue)" }); });
      var t = el("table", { class: "tableau pp-act" });
      t.appendChild(th(["Ressource", "Points ?", "Type", "Points", "Bonus max", "Temps min", "Interrupteur", "Calendrier", ""]));
      res.forEach(function (r) {
        var id = r.classe + "/" + r.fichier, a = idx[id];
        var actif = input({ type: "checkbox", title: "L'activité rapporte des points et suit les réglages de la ligne" }); actif.checked = !!a;
        var d = a || { type: "activite", points: 100, bonus_max: 20, temps_min: 5, etat: "ouvert", horaires: [], hors_periode: "revision" };
        var type = select([["activite", "Activité (1 fois)"], ["entrainement", "Entraînement (rejouable)"], ["jeu", "Jeu (rejouable)"]], d.type);
        var pts = input({ type: "number", min: "0", max: "10000", value: d.points, class: "pp-n" });
        var bon = input({ type: "number", min: "0", max: "10000", value: d.bonus_max, class: "pp-n", title: "Bonus selon le score (/20)" });
        var tmin = input({ type: "number", min: "0", max: "600", value: d.temps_min, class: "pp-n", title: "Minutes. Activité : en dessous, pas de points et alerte. Entraînement : délai entre deux gains." });
        var inter = select([["ouvert", "🔓 Ouverte"], ["ferme", "🔒 Fermée"]], d.etat);
        var ouv = input({ type: "datetime-local", value: local(d.ouvre_le) }), fer = input({ type: "datetime-local", value: local(d.ferme_le) });
        var hor = input({ type: "text", value: horairesTexte(d.horaires), placeholder: "Me 14:00-18:00; Ve 17:00-19:00", class: "pp-hor" });
        var hors = select([["revision", "Révision (faisable, sans points)"], ["ferme", "Fermée (ne s'ouvre pas)"]], d.hors_periode);
        var info = el("span", { class: "aide" });
        var enr = bouton("Enregistrer", "primary", async function () {
          try {
            if (!actif.checked) {
              await supprimer("activites", "ressource=eq." + encodeURIComponent(id));
              etat(info, "Désactivée", true); return;
            }
            await upsert("activites", { ressource: id, classe: c, type: type.value, points: +pts.value || 0, bonus_max: +bon.value || 0,
              temps_min: +tmin.value || 0, etat: inter.value, ouvre_le: ouv.value ? new Date(ouv.value).toISOString() : null,
              ferme_le: fer.value ? new Date(fer.value).toISOString() : null, horaires: horairesLire(hor.value),
              hors_periode: hors.value, maj_le: new Date().toISOString() }, "ressource");
            etat(info, "✓", true);
          } catch (e) { etat(info, msg(e), false); }
        });
        // Interrupteur en un clic : enregistre tout de suite
        inter.onchange = function () { if (actif.checked) enr.click(); };
        var resumeCal = function () {
          var x = [];
          if (ouv.value) x.push("dès " + new Date(ouv.value).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }));
          if (fer.value) x.push("jusqu'au " + new Date(fer.value).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }));
          if (hor.value.trim()) x.push(hor.value.trim());
          return x.length ? x.join(" · ") : "Toujours";
        };
        var bCal = bouton(resumeCal() + " ▾", "", function () { sous.hidden = !sous.hidden; });
        var sous = el("tr", { class: "pp-sous", hidden: "" }, [el("td", { colspan: "9" }, [el("div", { class: "form-exc" }, [
          el("label", {}, [document.createTextNode("Ouvre le "), ouv]), el("label", {}, [document.createTextNode("Ferme le "), fer]),
          el("label", {}, [document.createTextNode("Horaires "), hor]), el("label", {}, [document.createTextNode("En dehors : "), hors]),
          el("span", { class: "aide", texte: "Horaires facultatifs, heure de Paris (ex. « Me 14:00-18:00; Ve 17:00-19:00 » pour un jeu après les cours)." })])])]);
        [ouv, fer, hor].forEach(function (x) { x.addEventListener("change", function () { bCal.textContent = resumeCal() + " ▾"; }); });
        t.appendChild(el("tr", {}, [el("td", { class: "pp-titre", texte: r.titre }), el("td", {}, [actif]), el("td", {}, [type]), el("td", {}, [pts]), el("td", {}, [bon]),
          el("td", {}, [tmin]), el("td", {}, [inter]), el("td", {}, [bCal]),
          el("td", {}, [el("div", { class: "actions" }, [enr, info])])]));
        t.appendChild(sous);
      });
      zone.appendChild(el("div", { class: "tableau-wrap" }, [t]));
      chargerDeblocages();
    } catch (e) { manque(zone, e); }
  }
  async function toutActiver() {
    var c = classeChoisie(), et = $("a-etat");
    try {
      var deja = (await TH.rest("activites?select=ressource&classe=eq." + c)).map(function (x) { return x.ressource; });
      var nouv = ressourcesClasse(c).filter(function (r) { return (r.type === "activite" || r.type === "td") && deja.indexOf(r.classe + "/" + r.fichier) < 0; })
        .map(function (r) { return { ressource: r.classe + "/" + r.fichier, classe: c }; });
      if (nouv.length) await upsert("activites", nouv, "ressource");
      await chargerActivites();
      etat(et, nouv.length + " activité(s) activée(s) avec les réglages par défaut (100 pts + 20 de bonus, 5 min minimum).", true);
    } catch (e) { etat(et, msg(e), false); }
  }
  async function chargerDeblocages() {
    var c = classeChoisie(), t = $("a-debl"); vider(t);
    try {
      var el2 = await eleves(c), ids = el2.map(function (e) { return e.id; });
      var res = ressourcesClasse(c);
      vider($("a-d-eleve")); el2.forEach(function (e) { $("a-d-eleve").appendChild(el("option", { value: e.id, texte: e.nom + " " + e.prenom })); });
      vider($("a-d-res")); res.forEach(function (r) { $("a-d-res").appendChild(el("option", { value: r.classe + "/" + r.fichier, texte: r.titre })); });
      var l = ids.length ? await TH.rest("deblocages?select=*&eleve=in.(" + ids.join(",") + ")") : [];
      t.appendChild(th(["Élève", "Ressource", "Jusqu'au", ""]));
      if (!l.length) t.appendChild(el("tr", {}, [el("td", { colspan: "4", class: "aide", texte: "Aucune ouverture individuelle." })]));
      l.forEach(function (x) {
        var e = el2.filter(function (y) { return y.id === x.eleve; })[0] || {};
        t.appendChild(el("tr", {}, [el("td", { texte: (e.nom || "") + " " + (e.prenom || "") }), el("td", { texte: titreRes(x.ressource) }),
          el("td", { texte: x.jusqu_au ? new Date(x.jusqu_au).toLocaleString("fr-FR") : "Sans limite" }),
          el("td", {}, [bouton("Retirer", "danger", async function () { await supprimer("deblocages", "eleve=eq." + x.eleve + "&ressource=eq." + encodeURIComponent(x.ressource)); chargerDeblocages(); })])]));
      });
    } catch (e) { manque(t.parentNode, e); }
  }

  /* =================== PASS =================== */
  var saisons = [], recompenses = [];
  async function chargerPass() {
    var c = classeChoisie();
    $("p-classe-nom").textContent = nomClasse(c);
    try {
      saisons = await TH.rest("saisons?select=*&order=debut");
      recompenses = await TH.rest("recompenses?select=*&order=type,ordre,id");
    } catch (e) { manque($("p-saisons").parentNode, e); return; }
    // Saisons
    var t = $("p-saisons"); vider(t);
    t.appendChild(th(["Nom", "Début", "Fin", "Objectif " + nomClasse(c) + " (pts)", ""]));
    var objs = await TH.rest("pass_objectifs?select=*&classe=eq." + c);
    var acts = await TH.rest("activites?select=points,bonus_max,type,ouvre_le&classe=eq." + c);
    saisons.forEach(function (s) {
      var nom = input({ value: s.nom, class: "pp-nom large" }), d = input({ type: "date", value: s.debut }), f = input({ type: "date", value: s.fin });
      var o = objs.filter(function (x) { return x.saison === s.id; })[0];
      var obj = input({ type: "number", min: "1", value: o ? o.objectif : 1000, class: "pp-n" });
      var info = el("span", { class: "aide" });
      var calc = bouton("Calculer", "", function () {
        var tot = acts.filter(function (a) { return a.type === "activite" && (!a.ouvre_le || (a.ouvre_le.slice(0, 10) >= s.debut && a.ouvre_le.slice(0, 10) <= s.fin)); })
          .reduce(function (n, a) { return n + a.points + a.bonus_max; }, 0);
        obj.value = Math.max(1, tot); etat(info, "Somme des activités à points de la classe ouvrant dans cette saison (ou sans date). Pense à enregistrer.");
      });
      t.appendChild(el("tr", {}, [el("td", {}, [nom]), el("td", {}, [d]), el("td", {}, [f]), el("td", {}, [el("div", { class: "actions" }, [obj, calc])]),
        el("td", {}, [el("div", { class: "actions" }, [
          bouton("Enregistrer", "primary", async function () {
            try {
              await TH.rest("saisons?id=eq." + s.id, { method: "PATCH", body: { nom: nom.value, debut: d.value, fin: f.value }, headers: { "Prefer": "return=minimal" } });
              await upsert("pass_objectifs", { classe: c, saison: s.id, objectif: Math.max(1, +obj.value || 1000) }, "classe,saison");
              etat(info, "✓", true);
            } catch (e) { etat(info, msg(e), false); }
          }),
          bouton("Supprimer", "danger", async function () { if (!confirm("Supprimer cette saison et ses paliers (toutes classes) ?")) return; await supprimer("saisons", "id=eq." + s.id); chargerPass(); }),
          info])])]));
    });
    // Sélecteur de saison pour les paliers
    var ps = $("p-saison"), garde = ps.value; vider(ps);
    saisons.forEach(function (s) { ps.appendChild(el("option", { value: s.id, texte: s.nom })); });
    if (garde && saisons.some(function (s) { return String(s.id) === garde; })) ps.value = garde;
    chargerPaliers(); chargerRecompenses(); chargerEleves();
  }
  function optionsRecompenses() {
    return [["", "— aucune —"]].concat(recompenses.map(function (r) {
      var pre = { avatar: "🖼 " + (r.symbole || "") + " ", titre: "« ", badge: "⬢ " + (r.symbole || "") + " ", ornement: "◎ Ornement ", banniere: "▭ Bannière " }[r.type] || "";
      return [r.id, pre + r.nom + (r.type === "titre" ? " »" : "") + " · " + RARETES[r.rarete] + (r.classe ? " · " + nomClasse(r.classe) : "")];
    }));
  }
  async function chargerPaliers() {
    var c = classeChoisie(), s = $("p-saison").value, t = $("p-paliers"); vider(t);
    if (!s) return;
    var l = await TH.rest("paliers?select=*&classe=eq." + c + "&saison=eq." + s + "&order=rang");
    t.appendChild(th(["Rang", "% de l'objectif", "Récompense", ""]));
    l.forEach(function (p) {
      var pct = input({ type: "number", min: "1", max: "100", value: p.pct, class: "pp-n" });
      var rec = select(optionsRecompenses(), p.recompense || "");
      var info = el("span", { class: "aide" });
      t.appendChild(el("tr", {}, [el("td", { texte: p.rang }), el("td", {}, [pct]), el("td", {}, [rec]),
        el("td", {}, [el("div", { class: "actions" }, [
          bouton("Enregistrer", "primary", async function () {
            try { await TH.rest("paliers?id=eq." + p.id, { method: "PATCH", body: { pct: +pct.value, recompense: rec.value ? +rec.value : null }, headers: { "Prefer": "return=minimal" } }); etat(info, "✓", true); }
            catch (e) { etat(info, msg(e), false); }
          }),
          bouton("Retirer", "danger", async function () { await supprimer("paliers", "id=eq." + p.id); chargerPaliers(); }), info])])]));
    });
    var rang = l.reduce(function (m, p) { return Math.max(m, p.rang); }, 0) + 1;
    t.appendChild(el("tr", {}, [el("td", { colspan: "4" }, [bouton("+ Ajouter un palier", "", async function () {
      await TH.rest("paliers", { method: "POST", body: { classe: c, saison: +s, rang: rang, pct: Math.min(100, (l.length ? l[l.length - 1].pct : 0) + 10) }, headers: { "Prefer": "return=minimal" } });
      chargerPaliers();
    }), document.createTextNode(" "), bouton("Copier ces paliers vers les autres saisons de la classe", "", async function () {
      if (!confirm("Remplacer les paliers des autres saisons de " + nomClasse(c) + " par ceux-ci ?")) return;
      for (var i = 0; i < saisons.length; i++) {
        if (String(saisons[i].id) === String(s)) continue;
        await supprimer("paliers", "classe=eq." + c + "&saison=eq." + saisons[i].id);
        if (l.length) await TH.rest("paliers", { method: "POST", body: l.map(function (p) { return { classe: c, saison: saisons[i].id, rang: p.rang, pct: p.pct, recompense: p.recompense }; }), headers: { "Prefer": "return=minimal" } });
      }
      alert("Paliers copiés.");
    })])]));
  }
  function chargerRecompenses() {
    var t = $("p-recomp"); vider(t);
    t.appendChild(th(["Type", "Nom", "Rareté", "Symbole", "Couleur", "Image ou motif", "Classe", "Mystère", "Condition", ""]));
    function ligne(r) {
      var neuf = !r.id;
      var type = select([["titre", "Titre"], ["avatar", "Avatar"], ["badge", "Badge"], ["ornement", "Ornement"], ["banniere", "Bannière"]], r.type || "titre");
      var STYLES = { ornement: [["bronze", "Bronze"], ["argent", "Argent"], ["or", "Or"], ["circuit", "Circuit"], ["givre", "Givre"], ["neon", "Néon"], ["flammes", "Flammes"], ["royal", "Royal"]],
        banniere: [["atelier", "Atelier"], ["plan", "Plan technique"], ["foret", "Forêt"], ["ocean", "Océan"], ["volcan", "Volcan"], ["circuit", "Circuit"], ["galaxie", "Galaxie"], ["royal", "Trône royal"]] };
      var sty = el("select");
      var majStyles = function () { vider(sty); (STYLES[type.value] || []).forEach(function (o) { var x = el("option", { value: o[0], texte: o[1] }); if (o[0] === r.style) x.selected = true; sty.appendChild(x); }); };
      majStyles();
      var REG = [["", "— aucune —"], ["activites", "Activités terminées ≥"], ["sans_faute", "Activités à 20/20 ≥"], ["points", "Points au total ≥"], ["quiz_justes", "Bonnes réponses question du jour ≥"],
        ["serie", "Meilleure série (jours) ≥"], ["entrainements", "Entraînements réussis ≥"], ["paliers", "Paliers du pass ≥"], ["saisons", "Saisons à 100 % ≥"]];
      var regType = select(REG, (r.condition && r.condition.type) || "");
      var regSeuil = input({ type: "number", min: "0", value: r.condition && r.condition.seuil != null ? r.condition.seuil : "", class: "pp-n", placeholder: "seuil" });
      var nom = input({ value: r.nom || "", class: "pp-nom", placeholder: "Nom" });
      var rar = select(Object.keys(RARETES).map(function (k) { return [k, RARETES[k]]; }), r.rarete || "commun");
      var sym = input({ value: r.symbole || "", class: "pp-sym", list: "pp-symboles", placeholder: "🤖" });
      var col = input({ type: "color", value: r.couleur || "#5b8cff" });
      var img = input({ value: r.image || "", placeholder: "assets/avatars/x.png", class: "pp-img" });
      var cellImg = el("td", {}, [img, sty]);
      var cl = select([["", "Toutes"]].concat(classes().map(function (c) { return [c.id, c.court]; })), r.classe || "");
      var mys = input({ type: "checkbox" }); mys.checked = !!r.mystere;
      var cases = el("div", { class: "pp-cases" });
      CAT.filter(function (x) { return x.fichier && !/^https?:/.test(x.fichier) && (x.type === "activite" || x.type === "td"); }).forEach(function (x) {
        var id = x.classe + "/" + x.fichier, c = input({ type: "checkbox", value: id });
        if ((r.ressources || []).indexOf(id) >= 0) c.checked = true;
        cases.appendChild(el("label", { class: "case" }, [c, document.createTextNode(nomClasse(x.classe) + " · " + x.titre)]));
      });
      var choisies = function () { return [].slice.call(cases.querySelectorAll("input:checked")).map(function (o) { return o.value; }); };
      var bCond = bouton("", "", function () { sous.hidden = !sous.hidden; });
      var majCond = function () {
        var n = choisies().length;
        bCond.textContent = (regType.value ? (REG.filter(function (x) { return x[0] === regType.value; })[0][1] + " " + (regSeuil.value || 0))
          : n ? "Terminer " + n + " activité" + (n > 1 ? "s" : "") : "Pass ou prof") + " ▾";
      };
      cases.addEventListener("change", majCond); regType.addEventListener("change", majCond); regSeuil.addEventListener("input", majCond); majCond();
      var sous = el("tr", { class: "pp-sous", hidden: "" }, [el("td", { colspan: "10" }, [
        el("div", { class: "form-exc" }, [el("label", {}, [document.createTextNode("Condition automatique "), regType]), el("label", {}, [document.createTextNode("Seuil "), regSeuil]),
          el("span", { class: "aide", texte: "Obtenu automatiquement dès que l'élève atteint le seuil (0 = offert à tous)." })]),
        el("p", { class: "aide", texte: "Coche des activités : la récompense est obtenue automatiquement quand l'élève les a toutes terminées (ex. « Pro de la statique » pour tous les TD du PFS). Sans case cochée, elle s'obtient par un palier du pass ou quand tu la donnes." }), cases])]);
      var info = el("span", { class: "aide" });
      var corps = function () {
        return { type: type.value, nom: nom.value.trim(), rarete: rar.value, symbole: sym.value.trim(), couleur: col.value, image: img.value.trim() || null,
          classe: cl.value || null, mystere: mys.checked, ressources: choisies(),
          style: (type.value === "ornement" || type.value === "banniere") ? sty.value : null,
          condition: regType.value ? { type: regType.value, seuil: +regSeuil.value || 0 } : null };
      };
      var actions = [bouton(neuf ? "Ajouter" : "Enregistrer", "primary", async function () {
        var b = corps(); if (!b.nom) return etat(info, "Nom ?", false);
        try {
          if (neuf) await TH.rest("recompenses", { method: "POST", body: b, headers: { "Prefer": "return=minimal" } });
          else await TH.rest("recompenses?id=eq." + r.id, { method: "PATCH", body: b, headers: { "Prefer": "return=minimal" } });
          etat(info, "✓", true); if (neuf) chargerPass();
        } catch (e) { etat(info, msg(e), false); }
      })];
      if (!neuf) actions.push(bouton("Supprimer", "danger", async function () { if (!confirm("Supprimer « " + r.nom + " » ? Les élèves qui l'avaient le perdent.")) return; await supprimer("recompenses", "id=eq." + r.id); chargerPass(); }));
      actions.push(info);
      var majType = function () {
        var t = type.value, motif = t === "ornement" || t === "banniere";
        sym.disabled = t === "titre" || motif; col.disabled = t === "titre" || motif; img.hidden = motif || t === "titre" || t === "badge"; sty.hidden = !motif;
        majStyles();
      };
      type.onchange = majType; majType();
      return [el("tr", {}, [el("td", {}, [type]), el("td", {}, [nom]), el("td", {}, [rar]), el("td", {}, [sym]), el("td", {}, [col]), cellImg,
        el("td", {}, [cl]), el("td", {}, [mys]), el("td", {}, [bCond]), el("td", {}, [el("div", { class: "actions" }, actions)])]), sous];
    }
    recompenses.forEach(function (r) { ligne(r).forEach(function (x) { t.appendChild(x); }); });
    ligne({}).forEach(function (x) { t.appendChild(x); });
    // Donner une récompense
    var dr = $("p-don-rec"); vider(dr); optionsRecompenses().slice(1).forEach(function (o) { dr.appendChild(el("option", { value: o[0], texte: o[1] })); });
  }
  async function chargerEleves() {
    var c = classeChoisie(), t = $("p-eleves"); vider(t);
    var l = await eleves(c);
    ["p-don-eleve", "p-bonus-eleve"].forEach(function (id) { vider($(id)); l.forEach(function (e) { $(id).appendChild(el("option", { value: e.id, texte: e.nom + " " + e.prenom })); }); });
    t.appendChild(th(["Élève", "Total", "Saison en cours", "Paliers", "Réserve", "Titre · avatar", ""]));
    for (var i = 0; i < l.length; i++) {
      var e = l[i];
      try {
        var p = await TH.rpc("mon_pass", { p_eleve: e.id });
        var s = (p.saisons || []).filter(function (x) { return x.id === p.courante; })[0] || { points: 0, objectif: 1, paliers: [] };
        var rec = function (id) { return (p.recompenses || []).filter(function (r) { return r.id === id; })[0]; };
        var a = rec(p.avatar), ti = rec(p.titre);
        t.appendChild(el("tr", {}, [el("td", { texte: e.nom + " " + e.prenom }), el("td", { texte: p.total + " pts" }),
          el("td", { texte: Math.round(s.points) + " / " + s.objectif + " (" + Math.round(s.points / s.objectif * 100) + " %)" }),
          el("td", { texte: s.paliers.filter(function (x) { return x.debloque; }).length + " / " + s.paliers.length }),
          el("td", { texte: p.reserve ? p.reserve + " pts" : "" }),
          el("td", { texte: (ti ? ti.nom : "—") + " · " + (a ? a.symbole + " " + a.nom : "—") }),
          el("td", {}, [el("a", { class: "btn", href: "../profil/index.html?eleve=" + e.id + "#pass", texte: "Profil" })])]));
      } catch (x) { t.appendChild(el("tr", {}, [el("td", { texte: e.nom + " " + e.prenom }), el("td", { colspan: "5", texte: msg(x) })])); }
    }
    if (!l.length) t.appendChild(el("tr", {}, [el("td", { texte: "Aucun élève." })]));
  }

  /* =================== ALERTES & STATS =================== */
  var NOMS_ALERTES = { trop_rapide: "Terminé trop vite", rafale: "Validations en rafale", decrochage: "Décrochage" };
  async function chargerAlertes() {
    var c = $("al-classe").value || null, t = $("al-liste"); vider(t);
    try {
      var l = await TH.rpc("alertes", { p_classe: c });
      $("al-compte").textContent = l.length + " alerte" + (l.length > 1 ? "s" : "");
      if (!l.length) { t.appendChild(el("tr", {}, [el("td", { texte: "Rien à signaler 👍" })])); return; }
      t.appendChild(th(["Type", "Élève", "Classe", "Détail", "Quand", ""]));
      l.forEach(function (a) {
        var det = a.type === "decrochage" ? "Aucune activité depuis " + (a.quand ? new Date(a.quand).toLocaleDateString("fr-FR") : "le début") + " (seuil " + a.jours + " j)"
          : titreRes(a.ressource) + " · " + (a.detail.duree_min != null ? a.detail.duree_min + " min (minimum " + a.detail.temps_min + ")" : "") +
            (a.detail.score != null ? " · score " + a.detail.score + "/20" : "") + " · " + a.points + " pts donnés (" + a.detail.prevu + " prévus)";
        var act = [];
        if (a.id) {
          if (a.type === "trop_rapide") act.push(bouton("Accorder " + a.detail.prevu + " pts", "primary", async function () { await TH.rpc("alerte_traiter", { p_id: a.id, p_accorder: true }); chargerAlertes(); }));
          act.push(bouton(a.type === "trop_rapide" ? "Refuser les points" : "Vu", "", async function () { await TH.rpc("alerte_traiter", { p_id: a.id, p_accorder: false }); chargerAlertes(); }));
        }
        t.appendChild(el("tr", {}, [el("td", {}, [el("span", { class: "pp-al " + a.type, texte: NOMS_ALERTES[a.type] || a.type })]),
          el("td", { texte: a.nom + " " + a.prenom }), el("td", { texte: nomClasse(a.classe) }), el("td", { texte: det }),
          el("td", { class: "aide", texte: a.quand ? new Date(a.quand).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "" }),
          el("td", {}, [el("div", { class: "actions" }, act)])]));
      });
    } catch (e) { manque(t.parentNode, e); }
  }
  function mediane(a) { if (!a.length) return null; a = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function moy(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function f1(x) { return x == null ? "—" : String(Math.round(x * 10) / 10).replace(".", ","); }
  async function chargerStats() {
    var c = classeChoisie(), t = $("st-table"); vider(t);
    $("st-classe-nom").textContent = nomClasse(c);
    try {
      var el2 = await eleves(c), n = el2.length, ids = el2.map(function (e) { return e.id; });
      var prog = ids.length ? await TH.rest("progression?select=eleve,ressource,avancement,score,termine,debut_le,maj_le&eleve=in.(" + ids.join(",") + ")") : [];
      var pts = ids.length ? await TH.rest("points?select=eleve,ressource,points,detail,suspect,source&eleve=in.(" + ids.join(",") + ")") : [];
      var res = ressourcesClasse(c).map(function (r) { return r.classe + "/" + r.fichier; });
      t.appendChild(th(["Ressource", "Ouverte", "Terminée", "Avancement moyen", "Score moyen /20", "Durée médiane (fin)", "Points donnés", "Signalés"]));
      res.forEach(function (id) {
        var p = prog.filter(function (x) { return x.ressource === id; }), fin = p.filter(function (x) { return x.termine; });
        var q = pts.filter(function (x) { return x.ressource === id; });
        var durees = q.map(function (x) { return x.detail && x.detail.duree_min; }).filter(function (x) { return x != null; });
        var pc = function (k) { return n ? Math.round(k / n * 100) + " %" : "—"; };
        t.appendChild(el("tr", {}, [el("td", { class: "pp-titre", texte: titreRes(id) }),
          el("td", { texte: p.length + "/" + n + " · " + pc(p.length) }), el("td", { texte: fin.length + "/" + n + " · " + pc(fin.length) }),
          el("td", { texte: (function (m) { return m == null ? "—" : f1(m) + " %"; })(moy(p.filter(function (x) { return x.avancement != null; }).map(function (x) { return +x.avancement; }))) }),
          el("td", { texte: f1(moy(p.filter(function (x) { return x.score != null; }).map(function (x) { return +x.score; }))) }),
          el("td", { texte: durees.length ? f1(mediane(durees)) + " min" : "—" }),
          el("td", { texte: q.reduce(function (s, x) { return s + x.points; }, 0) }),
          el("td", { texte: q.filter(function (x) { return x.suspect; }).length || "" })]));
      });
      $("st-resume").textContent = n + " élève(s) · " + pts.reduce(function (s, x) { return s + x.points; }, 0) + " points distribués au total.";
    } catch (e) { manque(t.parentNode, e); }
  }

  /* =================== Branchement =================== */
  window.TH_PROF_PASS = function (acces) {
    if (acces.role !== "prof") return;
    if (!(window.TH_CONFIG && window.TH_CONFIG.passActif) && $("p-pause")) $("p-pause").hidden = false;
    // listes de classes « Toutes » pour En direct et Alertes
    ["d-classe", "al-classe"].forEach(function (id) {
      var s = $(id); s.appendChild(el("option", { value: "", texte: "Toutes les classes" }));
      classes().forEach(function (c) { s.appendChild(el("option", { value: c.id, texte: c.nom })); });
      s.onchange = function () { id === "d-classe" ? chargerDirect() : chargerAlertes(); };
    });
    var dl = el("datalist", { id: "pp-symboles" }); SYMBOLES.forEach(function (s) { dl.appendChild(el("option", { value: s })); }); document.body.appendChild(dl);
    var jr = $("d-cr-jour"); JOURS.forEach(function (j, i) { jr.appendChild(el("option", { value: i + 1, texte: j })); });
    $("d-cr-ajout").onclick = async function () {
      try { await TH.rest("presence_plages", { method: "POST", body: { classe: classeChoisie(), jour: +jr.value, debut: $("d-cr-debut").value, fin: $("d-cr-fin").value }, headers: { "Prefer": "return=minimal" } }); chargerCreneaux(); }
      catch (e) { alert(msg(e)); }
    };
    $("a-tout").onclick = toutActiver;
    var ot = $("o-type");
    if (ot) {
      var majDates = function () { var d = datesType(ot.value); $("o-debut").value = d[0]; $("o-fin").value = d[1]; $("o-fin").disabled = ot.value === "jour"; };
      ot.onchange = majDates; majDates();
      $("o-debut").onchange = function () { if (ot.value === "jour" || $("o-fin").value < $("o-debut").value) $("o-fin").value = $("o-debut").value; };
      $("o-ajout").onclick = async function () {
        var deb = $("o-debut").value, fin = ot.value === "jour" ? deb : $("o-fin").value;
        if (!$("o-res").value || !deb || !fin) return etat($("o-etat"), "Choisis une activité et des dates.", false);
        try {
          await TH.rest("objectifs", { method: "POST", body: { classe: classeChoisie(), type: ot.value, ressource: $("o-res").value, message: $("o-msg").value.trim() || null, debut: deb, fin: fin }, headers: { "Prefer": "return=minimal" } });
          $("o-msg").value = ""; etat($("o-etat"), "✓ Objectif ajouté", true); chargerObjectifs();
        } catch (e) { etat($("o-etat"), absent(e) ? "Script 08-objectifs.sql à installer" : msg(e), false); }
      };
    }
    $("a-reg-enr").onclick = async function () {
      try { await upsert("pass_reglages", { classe: classeChoisie(), plafond_jour: +$("a-plafond").value || 0, decrochage_jours: +$("a-decro").value || 7 }, "classe"); etat($("a-reg-etat"), "✓", true); }
      catch (e) { etat($("a-reg-etat"), msg(e), false); }
    };
    $("a-d-ajout").onclick = async function () {
      try {
        await upsert("deblocages", { eleve: $("a-d-eleve").value, ressource: $("a-d-res").value, jusqu_au: $("a-d-jusqu").value ? new Date($("a-d-jusqu").value).toISOString() : null }, "eleve,ressource");
        chargerDeblocages();
      } catch (e) { alert(msg(e)); }
    };
    $("p-saison").onchange = chargerPaliers;
    $("p-saison-ajout").onclick = async function () {
      var d = new Date().toISOString().slice(0, 10);
      await TH.rest("saisons", { method: "POST", body: { nom: "Nouvelle saison", debut: d, fin: d }, headers: { "Prefer": "return=minimal" } });
      chargerPass();
    };
    $("p-don").onclick = async function () {
      try { await upsert("recompenses_eleves", { eleve: $("p-don-eleve").value, recompense: +$("p-don-rec").value }, "eleve,recompense"); etat($("p-don-etat"), "✓ Donnée", true); chargerEleves(); }
      catch (e) { etat($("p-don-etat"), msg(e), false); }
    };
    $("p-bonus").onclick = async function () {
      var n = parseInt($("p-bonus-pts").value, 10); if (!n) return;
      try { await TH.rpc("points_ajuster", { p_eleve: $("p-bonus-eleve").value, p_points: n, p_motif: $("p-bonus-motif").value }); etat($("p-bonus-etat"), "✓ " + (n > 0 ? "+" : "") + n + " pts", true); chargerEleves(); }
      catch (e) { etat($("p-bonus-etat"), msg(e), false); }
    };
    $("d-maj").onclick = chargerDirect;
    $("al-maj").onclick = function () { chargerAlertes(); chargerStats(); };
    // pastille du nombre d'alertes sur l'onglet
    TH.rpc("alertes", { p_classe: null }).then(function (l) {
      if (l && l.length) { var b = document.querySelector('[data-vue="alertes"]'); if (b) b.appendChild(el("span", { class: "pp-pastille", texte: l.length })); }
    }).catch(function () {});
  };
  // Appelé par prof.js à chaque changement d'onglet ou de classe
  window.TH_PROF_VUE = function (v) {
    if (minuterie) { clearInterval(minuterie); minuterie = null; }
    if (v === "direct") { chargerDirect(); chargerCreneaux(); minuterie = setInterval(function () { if (!document.hidden) chargerDirect(); }, 10000); }
    if (v === "activites") chargerActivites();
    if (v === "pass") chargerPass();
    if (v === "alertes") { chargerAlertes(); chargerStats(); }
  };
})();
