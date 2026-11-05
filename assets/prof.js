/* Espace prof : comptes élèves, suivi, horaires, chiffrement des ressources. */
window.TH_PROF = function (acces) {
  var COLLEGUE = acces.role === "collegue";
  var el = window.TH_el;
  var CLASSES = window.TH_CLASSES;
  var CAT = window.CATALOGUE || [];
  var JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  function $(id) { return document.getElementById(id); }
  function nomClasse(id) { var c = CLASSES.filter(function (x) { return x.id === id; })[0]; return c ? c.nom : (id || "Toutes"); }
  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function message(e) { return (e && e.message) || String(e); }

  /* ---------- Onglets ---------- */
  var boutons = document.querySelectorAll("#ongletsProf .onglet");
  function montrer(v) {
    boutons.forEach(function (b) { b.classList.toggle("actif", b.getAttribute("data-vue") === v); });
    document.querySelectorAll(".vue").forEach(function (s) { s.hidden = s.id !== "vue-" + v; });
    try { history.replaceState(null, "", "#" + v); } catch (e) {}
    if (v === "suivi") chargerSuivi();
    if (v === "horaires") { chargerHoraires(); chargerExceptions(); }
    if (window.TH_PROF_VUE) window.TH_PROF_VUE(v);
  }
  boutons.forEach(function (b) { b.addEventListener("click", function () { montrer(b.getAttribute("data-vue")); }); });

  /* ---------- Listes de classes ---------- */
  var memo = null; try { memo = localStorage.getItem("th-prof-classe"); } catch (e) {}
  document.querySelectorAll(".choix-classe").forEach(function (s) {
    CLASSES.filter(function (c) { return !COLLEGUE || c.id === acces.classe; })
      .forEach(function (c) { s.appendChild(el("option", { value: c.id, texte: c.nom })); });
    if (COLLEGUE) s.value = acces.classe;
    if (memo) s.value = memo;
    s.addEventListener("change", function () {
      try { localStorage.setItem("th-prof-classe", s.value); } catch (e) {}
      document.querySelectorAll(".choix-classe").forEach(function (o) { o.value = s.value; });
      if (!COLLEGUE) chargerEleves(); if (!$("vue-suivi").hidden) chargerSuivi(); if (!$("vue-horaires").hidden) chargerHoraires();
      var vue = document.querySelector(".vue:not([hidden])");
      if (vue && window.TH_PROF_VUE && /^vue-(direct|activites|pass|alertes)$/.test(vue.id)) window.TH_PROF_VUE(vue.id.slice(4));
    });
  });
  var xc = $("x-classe"); xc.appendChild(el("option", { value: "", texte: "Toutes" }));
  CLASSES.forEach(function (c) { xc.appendChild(el("option", { value: c.id, texte: c.nom })); });

  /* ---------- Générateurs ---------- */
  function simplifier(t) {
    return (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function genMdp() {
    var c = "bcdfghjkmnprstvz", v = "aeiou", s = "", r = new Uint32Array(8);
    crypto.getRandomValues(r);
    for (var i = 0; i < 3; i++) s += c[r[i * 2] % c.length] + v[r[i * 2 + 1] % v.length];
    return s + String(10 + (r[6] % 90));
  }
  function lireLigne(l) {
    l = l.trim(); if (!l) return null;
    var p = l.split(/\t|;/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (p.length >= 2) return { nom: p[0], prenom: p.slice(1).join(" ") };
    var mots = l.split(/\s+/);
    var maj = mots.filter(function (m) { return m.length > 1 && m === m.toUpperCase() && /[A-Z]/.test(m.normalize("NFD")); });
    if (maj.length && maj.length < mots.length) {
      return { nom: maj.join(" "), prenom: mots.filter(function (m) { return maj.indexOf(m) < 0; }).join(" ") };
    }
    return { nom: mots[0], prenom: mots.slice(1).join(" ") };
  }
  function joliNom(n) { return n.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); }); }

  /* ---------- Fiches ---------- */
  function preparerFiches(liste, parClasse) {
    var f = $("fiches"); vider(f); var derniere = null;
    liste.forEach(function (x) {
      if (parClasse && x.classe !== derniere) {
        f.appendChild(el("h2", { class: "fiche-classe" + (derniere ? " saut" : ""), texte: nomClasse(x.classe) + " · identifiants et mots de passe" }));
        derniere = x.classe;
      }
      f.appendChild(el("div", { class: "fiche" }, [
        el("h3", { texte: x.prenom + " " + x.nom + " · " + (x.collegue ? "Accès collègue · " : "") + nomClasse(x.classe) }),
        el("p", { texte: "Site : " + TH_CONFIG.adresseSite }),
        el("p", {}, [document.createTextNode("Identifiant : "), el("b", { texte: x.identifiant })]),
        el("p", {}, [document.createTextNode("Mot de passe : "), el("span", { class: "mdp", texte: x.mdp })]),
        el("p", { texte: "Garde ce papier. En cas d'oubli, demande à ton professeur." })
      ]));
    });
  }

  /* ---------- Mots de passe gardés (table mots_de_passe, lecture prof seulement) ---------- */
  async function memoMdp(id, mdp) {
    try { await TH.rest("mots_de_passe", { method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=minimal" }, body: { compte: id, mdp: mdp } }); return true; }
    catch (e) { return false; }
  }
  async function lireMdp() {
    var m = {};
    (await TH.rest("mots_de_passe?select=compte,mdp")).forEach(function (x) { m[x.compte] = x.mdp; });
    return m;
  }

  /* =================== ÉLÈVES =================== */
  var tousIdentifiants = [];
  async function chargerEleves() {
    var t = $("e-table"); vider(t);
    var classe = $("e-classe").value;
    try {
      var tous = await TH.rest("profils?select=id,identifiant,nom,prenom,classe,role&order=nom,prenom");
      tousIdentifiants = tous.map(function (p) { return p.identifiant; });
      var liste = tous.filter(function (p) { return p.classe === classe && p.role === "eleve"; });
      var mdps = {}; try { mdps = await lireMdp(); } catch (e) {}
      $("e-compte").textContent = liste.length + " élève" + (liste.length > 1 ? "s" : "");
      if (!liste.length) { t.appendChild(el("tr", {}, [el("td", { texte: "Aucun élève dans cette classe pour l'instant." })])); return; }
      t.appendChild(el("tr", {}, ["Nom", "Prénom", "Identifiant", "Mot de passe", ""].map(function (h) { return el("th", { texte: h }); })));
      liste.forEach(function (p) {
        var cMdp = el("span", { class: mdps[p.id] ? "mdp" : "aide", texte: mdps[p.id] || "non enregistré" }), cMdpTd = el("td", {}, [cMdp]);
        var info = el("span", { class: "aide" });
        var bMdp = el("button", { class: "btn", type: "button", texte: "Nouveau mot de passe" });
        bMdp.onclick = async function () {
          var m = genMdp(); bMdp.disabled = true;
          try {
            await TH.rpc("reinitialiser_mdp", { eleve: p.id, mdp: m }); await memoMdp(p.id, m); if (cMdp) cMdp.textContent = m;
            vider(info); info.appendChild(el("span", { class: "mdp", texte: m }));
            preparerFiches([{ nom: p.nom, prenom: p.prenom, classe: p.classe, identifiant: p.identifiant, mdp: m }]);
            var imp = el("button", { class: "btn", type: "button", texte: "Imprimer la fiche" }); imp.onclick = function () { window.print(); };
            info.appendChild(document.createTextNode(" ")); info.appendChild(imp);
          } catch (e) { info.textContent = "Erreur : " + message(e); }
          bMdp.disabled = false;
        };
        var bSup = el("button", { class: "btn danger", type: "button", texte: "Supprimer" });
        bSup.onclick = async function () {
          if (!confirm("Supprimer le compte de " + p.prenom + " " + p.nom + " et toute sa progression ?")) return;
          try { await TH.rpc("supprimer_eleve", { eleve: p.id }); chargerEleves(); }
          catch (e) { alert("Erreur : " + message(e)); }
        };
        t.appendChild(el("tr", {}, [
          el("td", { texte: p.nom }), el("td", { texte: p.prenom }), el("td", { texte: p.identifiant }), cMdpTd,
          el("td", {}, [el("div", { class: "actions" }, [bMdp, bSup, info])])
        ]));
      });
    } catch (e) { t.appendChild(el("tr", {}, [el("td", { texte: "Erreur : " + message(e) })])); }
  }

  async function creerCompte(e) {
    // Un client « jetable » : la création d'un compte ne déconnecte pas le prof
    var base = simplifier(e.prenom) + "." + simplifier(e.nom), id = base, n = 1;
    for (;;) {
      while (tousIdentifiants.indexOf(id) >= 0) { n++; id = base + n; }
      try {
        var rep = await TH.appel("/auth/v1/signup", { method: "POST", body: { email: TH.emailDe(id), password: e.mdp } });
        var user = rep.user || rep;
        if (!rep.access_token) throw new Error("La confirmation par e-mail est encore activée dans Supabase (Authentication → Email → Confirm email).");
        await TH.rest("profils", { method: "POST", headers: { "Prefer": "return=minimal" },
          body: Object.assign({ id: user.id, identifiant: id, nom: e.nom, prenom: e.prenom, classe: e.classe, role: e.role || "eleve" },
                              e.ressources ? { ressources: e.ressources } : {}) });
        tousIdentifiants.push(id);
        await memoMdp(user.id, e.mdp);
        e.identifiant = id; return e;
      } catch (err) {
        if (err.status === 422 && /already|registered|exists/i.test(message(err) + (err.code || ""))) { tousIdentifiants.push(id); continue; }
        if (err.status === 429) { await new Promise(function (r) { setTimeout(r, 15000); }); continue; }
        throw err;
      }
    }
  }

  $("e-creer").onclick = async function () {
    var classe = $("e-classe").value;
    var lignes = $("e-liste").value.split(/\r?\n/).map(lireLigne).filter(Boolean);
    if (!lignes.length) { $("e-etat").textContent = "La liste est vide."; return; }
    if (!confirm("Créer " + lignes.length + " compte(s) en " + nomClasse(classe) + " ?")) return;
    this.disabled = true;
    var faits = [], erreurs = [], zone = $("e-resultats"); vider(zone);
    await chargerEleves();
    for (var i = 0; i < lignes.length; i++) {
      var e = { nom: lignes[i].nom.toUpperCase(), prenom: joliNom(lignes[i].prenom), classe: classe, mdp: genMdp() };
      $("e-etat").textContent = "Création " + (i + 1) + " / " + lignes.length + " : " + e.prenom + " " + e.nom + "…";
      try { faits.push(await creerCompte(e)); }
      catch (err) { erreurs.push(e.prenom + " " + e.nom + " : " + message(err)); if (/confirmation/.test(message(err))) break; }
    }
    this.disabled = false;
    $("e-etat").textContent = faits.length + " compte(s) créé(s)" + (erreurs.length ? ", " + erreurs.length + " erreur(s)" : "") + ".";
    if (faits.length) {
      $("e-liste").value = "";
      preparerFiches(faits);
      var t = el("table", { class: "tableau" });
      t.appendChild(el("tr", {}, ["Élève", "Identifiant", "Mot de passe"].map(function (h) { return el("th", { texte: h }); })));
      faits.forEach(function (x) {
        t.appendChild(el("tr", {}, [el("td", { texte: x.prenom + " " + x.nom }), el("td", { texte: x.identifiant }),
          el("td", {}, [el("span", { class: "mdp", texte: x.mdp })])]));
      });
      var imp = el("button", { class: "btn primary", type: "button", texte: "Imprimer les fiches" });
      imp.onclick = function () { window.print(); };
      zone.appendChild(el("p", { class: "aide", texte: "Les mots de passe ne seront plus affichés ensuite : imprime les fiches maintenant." }));
      zone.appendChild(imp); zone.appendChild(el("div", { class: "tableau-wrap", style: "margin-top:.8rem" }, [t]));
    }
    erreurs.forEach(function (m) { zone.appendChild(el("p", { class: "erreur", texte: m })); });
    chargerEleves();
  };


  /* =================== COLLÈGUES =================== */
  function majChoixRessources() {
    var classe = $("k-classe").value, zone = $("k-ressources"); vider(zone);
    var res = CAT.filter(function (r) { return r.classe === classe && r.fichier && !/^https?:/.test(r.fichier); });
    if (!res.length) { zone.appendChild(el("p", { class: "aide", texte: "Aucune ressource pour cette classe dans le catalogue." })); return; }
    res.forEach(function (r) {
      var id = r.classe + "/" + r.fichier;
      zone.appendChild(el("label", { class: "case" }, [el("input", { type: "checkbox", value: id }), document.createTextNode(" " + r.titre + (r.en_ligne ? "" : " (bientôt)"))]));
    });
  }
  function titreRessource(id) { var r = CAT.filter(function (x) { return x.classe + "/" + x.fichier === id; })[0]; return r ? r.titre : id; }
  async function chargerCollegues() {
    var t = $("k-table"); if (!t) return; vider(t);
    try {
      var liste = await TH.rest("profils?select=id,identifiant,nom,prenom,classe,ressources&role=eq.collegue&order=nom");
      if (!liste.length) { t.appendChild(el("tr", {}, [el("td", { class: "aide", texte: "Aucun compte collègue pour l'instant." })])); return; }
      t.appendChild(el("tr", {}, ["Collègue", "Identifiant", "Classe", "Ressources ouvertes", ""].map(function (h) { return el("th", { texte: h }); })));
      liste.forEach(function (p) {
        var cMdp = null;
        var info = el("span", { class: "aide" });
        var bMdp = el("button", { class: "btn", type: "button", texte: "Nouveau mot de passe" });
        bMdp.onclick = async function () {
          var m = genMdp(); bMdp.disabled = true;
          try {
            await TH.rpc("reinitialiser_mdp", { eleve: p.id, mdp: m }); await memoMdp(p.id, m); if (cMdp) cMdp.textContent = m;
            vider(info); info.appendChild(el("span", { class: "mdp", texte: m }));
            preparerFiches([{ nom: p.nom, prenom: p.prenom, classe: p.classe, identifiant: p.identifiant, mdp: m, collegue: true }]);
            var imp = el("button", { class: "btn", type: "button", texte: "Imprimer la fiche" }); imp.onclick = function () { window.print(); };
            info.appendChild(document.createTextNode(" ")); info.appendChild(imp);
          } catch (e) { info.textContent = "Erreur : " + message(e); }
          bMdp.disabled = false;
        };
        var bSup = el("button", { class: "btn danger", type: "button", texte: "Supprimer" });
        bSup.onclick = async function () {
          if (!confirm("Supprimer le compte de " + p.prenom + " " + p.nom + " ?")) return;
          try { await TH.rpc("supprimer_eleve", { eleve: p.id }); chargerCollegues(); } catch (e) { alert("Erreur : " + message(e)); }
        };
        t.appendChild(el("tr", {}, [
          el("td", { texte: p.prenom + " " + p.nom }), el("td", { texte: p.identifiant }), el("td", { texte: nomClasse(p.classe) }),
          el("td", { texte: (p.ressources || []).map(titreRessource).join(" · ") || "—" }),
          el("td", {}, [el("div", { class: "actions" }, [bMdp, bSup, info])])
        ]));
      });
    } catch (e) {
      t.appendChild(el("tr", {}, [el("td", { texte: /ressources|column/.test(message(e)) ? "Lance d'abord le script 02-collegues.sql dans Supabase." : "Erreur : " + message(e) })]));
    }
  }
  var kc = $("k-classe");
  if (kc) {
    CLASSES.forEach(function (c) { kc.appendChild(el("option", { value: c.id, texte: c.nom })); });
    kc.addEventListener("change", majChoixRessources); majChoixRessources();
    $("k-creer").onclick = async function () {
      var nom = $("k-nom").value.trim(), prenom = $("k-prenom").value.trim(), classe = kc.value;
      var res = [].slice.call(document.querySelectorAll("#k-ressources input:checked")).map(function (x) { return x.value; });
      var etat = $("k-etat");
      if (!nom || !prenom) { etat.textContent = "Indique le nom et le prénom."; return; }
      if (!res.length) { etat.textContent = "Coche au moins une ressource."; return; }
      this.disabled = true; etat.textContent = "Création…";
      try {
        var tous = await TH.rest("profils?select=identifiant");
        tousIdentifiants = tous.map(function (p) { return p.identifiant; });
        var e = { nom: nom.toUpperCase(), prenom: joliNom(prenom), classe: classe, mdp: genMdp(), role: "collegue", ressources: res };
        await creerCompte(e);
        etat.textContent = "Compte créé.";
        $("k-nom").value = ""; $("k-prenom").value = "";
        preparerFiches([Object.assign({ collegue: true }, e)]);
        var z = $("k-resultat"); vider(z);
        var imp = el("button", { class: "btn primary", type: "button", texte: "Imprimer la fiche" }); imp.onclick = function () { window.print(); };
        z.appendChild(el("p", {}, [document.createTextNode("Identifiant : "), el("b", { texte: e.identifiant }),
          document.createTextNode("   Mot de passe : "), el("span", { class: "mdp", texte: e.mdp })]));
        z.appendChild(el("p", { class: "aide", texte: "Le mot de passe ne sera plus affiché ensuite : note-le ou imprime la fiche." }));
        z.appendChild(imp);
        chargerCollegues();
      } catch (err) { etat.textContent = "Erreur : " + message(err); }
      this.disabled = false;
    };
  }

  /* ---------- Imprimer les identifiants d'une classe ou de toutes, à tout moment ---------- */
  async function imprimerIdentifiants(classes) {
    var etat = $("e-imp-etat"); etat.textContent = "Préparation…";
    try {
      var eleves = (await TH.rest("profils?select=id,identifiant,nom,prenom,classe&role=eq.eleve&order=nom,prenom"))
        .filter(function (p) { return classes.indexOf(p.classe) >= 0; })
        .sort(function (a, b) { return classes.indexOf(a.classe) - classes.indexOf(b.classe); });
      if (!eleves.length) { etat.textContent = "Aucun élève à imprimer."; return; }
      var mdps;
      try { mdps = await lireMdp(); }
      catch (e) { etat.textContent = "Lance d'abord le script 03-mots-de-passe.sql dans Supabase (SQL Editor)."; return; }
      var manquants = eleves.filter(function (p) { return !mdps[p.id]; });
      if (manquants.length && confirm(manquants.length + " élève(s) n'ont pas de mot de passe enregistré (comptes créés avant cette mise à jour).\n\nOK : leur donner un nouveau mot de passe maintenant (l'ancien ne marchera plus).\nAnnuler : imprimer leur fiche sans mot de passe.")) {
        for (var i = 0; i < manquants.length; i++) {
          var p = manquants[i], m = genMdp();
          etat.textContent = "Nouveau mot de passe " + (i + 1) + " / " + manquants.length + "…";
          await TH.rpc("reinitialiser_mdp", { eleve: p.id, mdp: m });
          if (await memoMdp(p.id, m)) mdps[p.id] = m;
        }
        chargerEleves();
      }
      preparerFiches(eleves.map(function (p) {
        return { nom: p.nom, prenom: p.prenom, classe: p.classe, identifiant: p.identifiant, mdp: mdps[p.id] || "(demande-le à ton professeur)" };
      }), true);
      etat.textContent = eleves.length + " fiche(s) prête(s).";
      window.print();
    } catch (e) { etat.textContent = "Erreur : " + message(e); }
  }
  if ($("e-imp")) {
    $("e-imp").onclick = function () { imprimerIdentifiants([$("e-classe").value]); };
    $("e-imp-tout").onclick = function () { imprimerIdentifiants(CLASSES.map(function (c) { return c.id; })); };
  }

  /* =================== SUIVI =================== */
  var dernierSuivi = null;
  async function chargerSuivi() {
    var t = $("s-table"); vider(t);
    var classe = $("s-classe").value;
    try {
      var eleves = await TH.rest("profils?select=id,nom,prenom,identifiant&role=eq.eleve&classe=eq." + classe + "&order=nom,prenom");
      var prog = eleves.length ? await TH.rest("progression?select=eleve,ressource,avancement,score,termine,debut_le,maj_le&eleve=in.(" + eleves.map(function (e) { return e.id; }).join(",") + ")") : [];
      var colonnes = CAT.filter(function (r) { return r.classe === classe && r.fichier && !/^https?:/.test(r.fichier)
          && (!COLLEGUE || (acces.ressources || []).indexOf(r.classe + "/" + r.fichier) >= 0); })
        .map(function (r) { return { id: r.classe + "/" + r.fichier, titre: r.titre }; });
      prog.forEach(function (p) { if (!colonnes.some(function (c) { return c.id === p.ressource; })) colonnes.push({ id: p.ressource, titre: p.ressource.split("/").pop() }); });
      var index = {}; prog.forEach(function (p) { index[p.eleve + "|" + p.ressource] = p; });
      dernierSuivi = { classe: classe, eleves: eleves, colonnes: colonnes, index: index };
      if (!eleves.length) { t.appendChild(el("tr", {}, [el("td", { texte: "Aucun élève dans cette classe." })])); return; }
      t.appendChild(el("tr", {}, [el("th", { texte: "Élève" })].concat(colonnes.map(function (c) { return el("th", { class: "res-col", title: c.id, texte: c.titre }); }))));
      eleves.forEach(function (e) {
        var tr = el("tr", {}, [el("td", { texte: e.nom + " " + e.prenom })]);
        colonnes.forEach(function (c) {
          var p = index[e.id + "|" + c.id], td;
          if (!p) td = el("td", { class: "c rien", texte: "—" });
          else {
            var quand = "Dernier passage : " + new Date(p.maj_le).toLocaleString("fr-FR") + (p.score != null ? " · score " + p.score : "");
            if (p.termine) td = el("td", { class: "c fait", title: quand, texte: "✓" });
            else if (p.avancement != null) td = el("td", { class: "c cours", title: quand, texte: Math.round(p.avancement) + " %" });
            else td = el("td", { class: "c cours", title: quand, texte: "●" });
          }
          tr.appendChild(td);
        });
        t.appendChild(tr);
      });
    } catch (e) { t.appendChild(el("tr", {}, [el("td", { texte: "Erreur : " + message(e) })])); }
  }
  $("s-maj").onclick = chargerSuivi;
  $("s-csv").onclick = function () {
    var d = dernierSuivi; if (!d) return;
    var q = function (v) { v = v == null ? "" : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lignes = [["Nom", "Prénom", "Identifiant", "Ressource", "Ouvert", "Avancement", "Score", "Terminé", "Premier passage", "Dernier passage"].join(";")];
    d.eleves.forEach(function (e) {
      d.colonnes.forEach(function (c) {
        var p = d.index[e.id + "|" + c.id];
        lignes.push([e.nom, e.prenom, e.identifiant, c.titre, p ? "oui" : "non", p && p.avancement, p && p.score,
          p ? (p.termine ? "oui" : "non") : "", p ? new Date(p.debut_le).toLocaleString("fr-FR") : "",
          p ? new Date(p.maj_le).toLocaleString("fr-FR") : ""].map(q).join(";"));
      });
    });
    var blob = new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = el("a", { href: URL.createObjectURL(blob), download: "suivi-" + d.classe + "-" + new Date().toISOString().slice(0, 10) + ".csv" });
    document.body.appendChild(a); a.click(); a.remove();
  };

  /* =================== HORAIRES =================== */
  async function chargerHoraires() {
    var t = $("h-table"); vider(t); $("h-etat").textContent = "";
    var classe = $("h-classe").value;
    try {
      var pl = await TH.rest("plages?select=jour,debut,fin&classe=eq." + classe);
      t.appendChild(el("tr", {}, ["Jour", "Ouverture", "Fermeture"].map(function (h) { return el("th", { texte: h }); })));
      JOURS.forEach(function (j, i) {
        var p = pl.filter(function (x) { return x.jour === i + 1; })[0];
        t.appendChild(el("tr", {}, [el("td", { texte: j }),
          el("td", {}, [el("input", { type: "time", "data-jour": i + 1, "data-k": "debut", value: p ? p.debut.slice(0, 5) : "" })]),
          el("td", {}, [el("input", { type: "time", "data-jour": i + 1, "data-k": "fin", value: p ? p.fin.slice(0, 5) : "" })])]));
      });
    } catch (e) { t.appendChild(el("tr", {}, [el("td", { texte: "Erreur : " + message(e) })])); }
  }
  function lirePlages() {
    var res = [];
    for (var j = 1; j <= 7; j++) {
      var d = document.querySelector('#h-table input[data-jour="' + j + '"][data-k="debut"]').value;
      var f = document.querySelector('#h-table input[data-jour="' + j + '"][data-k="fin"]').value;
      if (d && f) { if (f <= d) throw new Error(JOURS[j - 1] + " : la fermeture doit être après l'ouverture."); res.push({ jour: j, debut: d, fin: f }); }
    }
    return res;
  }
  async function enregistrerPlages(classes) {
    var pl;
    try { pl = lirePlages(); } catch (e) { $("h-etat").textContent = message(e); return; }
    $("h-etat").textContent = "Enregistrement…";
    try {
      for (var i = 0; i < classes.length; i++) {
        await TH.rest("plages?classe=eq." + classes[i], { method: "DELETE", headers: { "Prefer": "return=minimal" } });
        if (pl.length) await TH.rest("plages", { method: "POST", headers: { "Prefer": "return=minimal" },
          body: pl.map(function (p) { return { classe: classes[i], jour: p.jour, debut: p.debut, fin: p.fin }; }) });
      }
      $("h-etat").textContent = "Enregistré" + (classes.length > 1 ? " pour toutes les classes." : ".");
    } catch (e) { $("h-etat").textContent = "Erreur : " + message(e); }
  }
  $("h-enr").onclick = function () { enregistrerPlages([$("h-classe").value]); };
  $("h-tous").onclick = function () { if (confirm("Appliquer ces horaires à toutes les classes ?")) enregistrerPlages(CLASSES.map(function (c) { return c.id; })); };

  async function chargerExceptions() {
    var t = $("x-table"); vider(t);
    try {
      var ex = await TH.rest("exceptions?select=*&order=du.desc&limit=50");
      if (!ex.length) { t.appendChild(el("tr", {}, [el("td", { class: "aide", texte: "Aucune exception." })])); return; }
      t.appendChild(el("tr", {}, ["Classe", "Du", "Au", "Type", "Motif", ""].map(function (h) { return el("th", { texte: h }); })));
      ex.forEach(function (x) {
        var b = el("button", { class: "btn danger", type: "button", texte: "Supprimer" });
        b.onclick = async function () { await TH.rest("exceptions?id=eq." + x.id, { method: "DELETE", headers: { "Prefer": "return=minimal" } }); chargerExceptions(); };
        t.appendChild(el("tr", {}, [el("td", { texte: nomClasse(x.classe) }),
          el("td", { texte: new Date(x.du).toLocaleString("fr-FR") }), el("td", { texte: new Date(x.au).toLocaleString("fr-FR") }),
          el("td", { texte: x.ouvert ? "Ouvert" : "Fermé" }), el("td", { texte: x.motif || "" }), el("td", {}, [b])]));
      });
    } catch (e) { t.appendChild(el("tr", {}, [el("td", { texte: "Erreur : " + message(e) })])); }
  }
  $("x-ajout").onclick = async function () {
    var du = $("x-du").value, au = $("x-au").value;
    if (!du || !au || au <= du) { alert("Indique un début et une fin (la fin après le début)."); return; }
    try {
      await TH.rest("exceptions", { method: "POST", headers: { "Prefer": "return=minimal" }, body: {
        classe: $("x-classe").value || null, du: new Date(du).toISOString(), au: new Date(au).toISOString(),
        ouvert: $("x-ouvert").value === "true", motif: $("x-motif").value } });
      $("x-motif").value = ""; chargerExceptions();
    } catch (e) { alert("Erreur : " + message(e)); }
  };

  /* =================== CHIFFRER =================== */
  var fichiers = [];
  var depot = $("c-depot"), entree = $("c-fichiers");
  function majDepot() {
    depot.querySelector("span").textContent = fichiers.length
      ? fichiers.map(function (f) { return f.name; }).join(", ")
      : "Glisse tes fichiers ici ou clique pour choisir";
  }
  entree.addEventListener("change", function () { fichiers = Array.from(entree.files); majDepot(); });
  ["dragenter", "dragover"].forEach(function (t) { depot.addEventListener(t, function (e) { e.preventDefault(); depot.classList.add("survol"); }); });
  ["dragleave", "drop"].forEach(function (t) { depot.addEventListener(t, function (e) { e.preventDefault(); depot.classList.remove("survol"); }); });
  depot.addEventListener("drop", function (e) { fichiers = Array.from(e.dataTransfer.files); majDepot(); });

  $("c-go").onclick = async function () {
    var classe = $("c-classe").value, cle = acces.cles && acces.cles[classe], zone = $("c-liens");
    if (!fichiers.length) { $("c-etat").textContent = "Choisis d'abord un fichier."; return; }
    if (!cle) { $("c-etat").textContent = "Clé de classe introuvable : reconnecte-toi."; return; }
    vider(zone);
    for (var i = 0; i < fichiers.length; i++) {
      var f = fichiers[i];
      $("c-etat").textContent = "Chiffrement de " + f.name + "…";
      var out = await TH.chiffrer(await f.arrayBuffer(), cle);
      var a = el("a", { class: "btn", href: URL.createObjectURL(new Blob([out])), download: f.name + ".enc", texte: "⬇ " + f.name + ".enc" });
      zone.appendChild(el("p", {}, [a]));
      a.click();
    }
    $("c-etat").textContent = fichiers.length + " fichier(s) chiffré(s) pour " + nomClasse(classe) + ". Si un téléchargement n'est pas parti, clique sur son lien.";
    zone.appendChild(el("p", { class: "aide", texte: "Ensuite : dépose ces fichiers dans le dossier « " + classe + " » de ton dépôt GitHub." }));
  };

  /* ---------- Démarrage ---------- */
  if (COLLEGUE) {
    document.querySelector("main h1").textContent = "Suivi de mes élèves";
    boutons.forEach(function (b) { if (b.getAttribute("data-vue") !== "suivi") b.remove(); });
    document.querySelectorAll(".vue").forEach(function (v) { if (v.id !== "vue-suivi") v.remove(); });
    $("vue-suivi").hidden = false; boutons = document.querySelectorAll("#ongletsProf .onglet");
    boutons.forEach(function (b) { b.classList.add("actif"); });
    var sel = $("s-classe"); if (sel) sel.disabled = true;
    chargerSuivi();
    return;
  }
  chargerEleves();
  chargerCollegues();
  if (window.TH_PROF_PASS) window.TH_PROF_PASS(acces);
  var h = (location.hash || "").replace("#", "");
  if (["eleves", "suivi", "horaires", "chiffrer", "direct", "activites", "pass", "alertes"].indexOf(h) >= 0) montrer(h);
};
