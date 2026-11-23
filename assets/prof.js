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
    if (v === "edt" && !edtCharge) chargerEdt();
    if (window.TH_PROF_VUE) window.TH_PROF_VUE(v);
  }
  boutons.forEach(function (b) { b.addEventListener("click", function () { montrer(b.getAttribute("data-vue")); }); });

  /* ---------- Listes de classes ---------- */
  var memo = null; try { memo = localStorage.getItem("th-prof-classe"); } catch (e) {}
  document.querySelectorAll(".choix-classe").forEach(function (s) {
    var mesClasses = CLASSES.filter(function (c) { return !COLLEGUE || (acces.classes || [acces.classe]).indexOf(c.id) >= 0; });
    mesClasses.forEach(function (c) { s.appendChild(el("option", { value: c.id, texte: c.nom })); });
    if (memo && mesClasses.some(function (c) { return c.id === memo; })) s.value = memo;
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
        el("h3", { texte: x.prenom + " " + x.nom + " · " + (x.collegue ? "Accès collègue" : nomClasse(x.classe)) }),
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
          el("td", {}, [TH_lienEleve(p.nom, p.id)]), el("td", {}, [TH_lienEleve(p.prenom, p.id)]), el("td", { texte: p.identifiant }), cMdpTd,
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
        var avant = localStorage.getItem("th-session");
        var rep = await TH.appel("/auth/v1/signup", { method: "POST", body: { email: TH.emailDe(id), password: e.mdp } });
        if (avant && localStorage.getItem("th-session") !== avant) localStorage.setItem("th-session", avant);
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
  // Accès modifiable à tout moment : par classe entière (« classe/* », futures ressources comprises), par type, ou ressource par ressource
  var TYPES_NOM = { activite: "Activités", td: "TD", pdf: "PDF", video: "Vidéos", outil: "Outils", lien: "Liens" };
  function resClasse(c) { return CAT.filter(function (r) { return r.classe === c && r.fichier && !/^https?:/.test(r.fichier); }); }
  function titreRessource(id) {
    if (/\/\*$/.test(id)) return nomClasse(id.split("/")[0]) + " (tout)";
    var r = CAT.filter(function (x) { return x.classe + "/" + x.fichier === id; })[0]; return r ? r.titre : id;
  }
  function resumeAcces(l) {
    l = l || []; if (!l.length) return "Aucun accès";
    var par = {};
    l.forEach(function (id) { var c = id.split("/")[0]; par[c] = par[c] || { tout: false, n: 0 }; if (/\/\*$/.test(id)) par[c].tout = true; else par[c].n++; });
    return Object.keys(par).map(function (c) { return nomClasse(c) + " · " + (par[c].tout ? "tout" : par[c].n + "/" + resClasse(c).length); }).join("  ·  ");
  }
  function editeurAcces(p, fini) {
    var choisi = (p.ressources || []).slice(), boite = el("div", { class: "acc" });
    function a(id) { return choisi.indexOf(id) >= 0; }
    function mettre(id, oui) { var i = choisi.indexOf(id); if (oui && i < 0) choisi.push(id); if (!oui && i >= 0) choisi.splice(i, 1); }
    CLASSES.forEach(function (c) {
      var res = resClasse(c.id); if (!res.length) return;
      var det = el("details", { class: "acc-cl" }), som = el("summary"), cpt = el("span", { class: "aide" });
      var tout = el("input", { type: "checkbox" });
      som.appendChild(el("b", { texte: c.nom })); som.appendChild(cpt);
      var lTout = el("label", { class: "case acc-tout" }, [tout, document.createTextNode(" Toute la classe")]);
      var chips = el("div", { class: "acc-types" }), liste = el("div", { class: "pp-cases" }), cases = [];
      var seqs = []; res.forEach(function (r) { var s = r.sequence || r.onglet || "Autres"; if (seqs.indexOf(s) < 0) seqs.push(s); });
      seqs.forEach(function (s) {
        liste.appendChild(el("div", { class: "acc-seq", texte: s }));
        res.filter(function (r) { return (r.sequence || r.onglet || "Autres") === s; }).forEach(function (r) {
          var id = r.classe + "/" + r.fichier, cb = el("input", { type: "checkbox", value: id });
          cb.onchange = function () { mettre(id, cb.checked); maj(); };
          cases.push({ cb: cb, r: r, id: id });
          liste.appendChild(el("label", { class: "case" }, [cb, document.createTextNode(" " + r.titre + (r.en_ligne ? "" : " (bientôt)"))]));
        });
      });
      var types = []; res.forEach(function (r) { var t = r.type || "activite"; if (types.indexOf(t) < 0) types.push(t); });
      types.forEach(function (t) {
        var b = el("button", { type: "button", class: "btn mini", texte: TYPES_NOM[t] || t });
        b.onclick = function () {
          var du = cases.filter(function (x) { return (x.r.type || "activite") === t; }), tous = du.every(function (x) { return a(x.id); });
          du.forEach(function (x) { mettre(x.id, !tous); }); maj();
        };
        chips.appendChild(b);
      });
      tout.onchange = function () { mettre(c.id + "/*", tout.checked); maj(); };
      function maj() {
        var w = a(c.id + "/*"); tout.checked = w;
        cases.forEach(function (x) { x.cb.checked = w || a(x.id); x.cb.disabled = w; });
        chips.querySelectorAll("button").forEach(function (b) { b.disabled = w; });
        var n = cases.filter(function (x) { return a(x.id); }).length;
        cpt.textContent = w ? " · tout" : n ? " · " + n + "/" + cases.length : "";
      }
      maj();
      if (a(c.id + "/*") || cases.some(function (x) { return a(x.id); })) det.open = true;
      det.appendChild(som); det.appendChild(el("div", { class: "acc-corps" }, [lTout, chips, liste]));
      boite.appendChild(det);
    });
    var etat = el("span", { class: "aide" }), bEnr = el("button", { class: "btn primary", type: "button", texte: "Enregistrer" });
    bEnr.onclick = async function () {
      bEnr.disabled = true; etat.textContent = "…";
      var cl = null; choisi.some(function (id) { cl = id.split("/")[0]; return true; });
      try {
        await TH.rest("profils?id=eq." + p.id, { method: "PATCH", headers: { "Prefer": "return=minimal" }, body: { ressources: choisi, classe: cl || p.classe || null } });
        etat.textContent = "Enregistré."; p.ressources = choisi.slice(); if (fini) fini();
      } catch (e) { etat.textContent = "Erreur : " + message(e); }
      bEnr.disabled = false;
    };
    boite.appendChild(el("div", { class: "ligne-outils" }, [bEnr, etat]));
    return boite;
  }
  async function chargerCollegues() {
    var t = $("k-table"); if (!t) return; vider(t);
    try {
      var liste = await TH.rest("profils?select=id,identifiant,nom,prenom,classe,ressources&role=eq.collegue&order=nom");
      if (!liste.length) { t.appendChild(el("tr", {}, [el("td", { class: "aide", texte: "Aucun compte collègue pour l'instant." })])); return; }
      t.appendChild(el("tr", {}, ["Collègue", "Identifiant", "Accès", ""].map(function (h) { return el("th", { texte: h }); })));
      liste.forEach(function (p) {
        var info = el("span", { class: "aide" });
        var bMdp = el("button", { class: "btn", type: "button", texte: "Nouveau mot de passe" });
        bMdp.onclick = async function () {
          var m = genMdp(); bMdp.disabled = true;
          try {
            await TH.rpc("reinitialiser_mdp", { eleve: p.id, mdp: m }); await memoMdp(p.id, m);
            vider(info); info.appendChild(el("span", { class: "mdp", texte: m }));
            preparerFiches([{ nom: p.nom, prenom: p.prenom, classe: null, identifiant: p.identifiant, mdp: m, collegue: true }]);
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
        var resume = el("span", { texte: resumeAcces(p.ressources) });
        var bAcc = el("button", { class: "btn primary", type: "button", texte: "Accès" });
        var ligneEd = el("tr", { class: "acc-ligne" }); ligneEd.hidden = true;
        var tdEd = el("td"); tdEd.colSpan = 4; ligneEd.appendChild(tdEd);
        bAcc.onclick = function () {
          if (!ligneEd.hidden) { ligneEd.hidden = true; return; }
          vider(tdEd); tdEd.appendChild(editeurAcces(p, function () { resume.textContent = resumeAcces(p.ressources); }));
          ligneEd.hidden = false;
        };
        t.appendChild(el("tr", {}, [
          el("td", { texte: p.prenom + " " + p.nom }), el("td", { texte: p.identifiant }), el("td", {}, [resume]),
          el("td", {}, [el("div", { class: "actions" }, [bAcc, bMdp, bSup, info])])
        ]));
        t.appendChild(ligneEd);
      });
    } catch (e) {
      t.appendChild(el("tr", {}, [el("td", { texte: /ressources|column/.test(message(e)) ? "Lance d'abord le script 02-collegues.sql dans Supabase." : "Erreur : " + message(e) })]));
    }
  }
  if ($("k-creer")) {
    $("k-creer").onclick = async function () {
      var nom = $("k-nom").value.trim(), prenom = $("k-prenom").value.trim(), etat = $("k-etat");
      if (!nom || !prenom) { etat.textContent = "Indique le nom et le prénom."; return; }
      this.disabled = true; etat.textContent = "Création…";
      try {
        var tous = await TH.rest("profils?select=identifiant");
        tousIdentifiants = tous.map(function (p) { return p.identifiant; });
        var e = { nom: nom.toUpperCase(), prenom: joliNom(prenom), classe: null, mdp: genMdp(), role: "collegue", ressources: [] };
        await creerCompte(e);
        etat.textContent = "Compte créé : clique sur « Accès » pour ouvrir ses classes.";
        $("k-nom").value = ""; $("k-prenom").value = "";
        preparerFiches([Object.assign({ collegue: true }, e)]);
        var z = $("k-resultat"); vider(z);
        var imp = el("button", { class: "btn primary", type: "button", texte: "Imprimer la fiche" }); imp.onclick = function () { window.print(); };
        z.appendChild(el("p", {}, [document.createTextNode("Identifiant : "), el("b", { texte: e.identifiant }),
          document.createTextNode("   Mot de passe : "), el("span", { class: "mdp", texte: e.mdp })]));
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
          && TH.autorise(acces, r.classe + "/" + r.fichier); })
        .map(function (r) { return { id: r.classe + "/" + r.fichier, titre: r.titre, onglet: r.onglet || "", partie: r.partie || "" }; });
      prog.forEach(function (p) { if (!colonnes.some(function (c) { return c.id === p.ressource; })) colonnes.push({ id: p.ressource, titre: p.ressource.split("/").pop() }); });
      var index = {}; prog.forEach(function (p) { index[p.eleve + "|" + p.ressource] = p; });
      dernierSuivi = { classe: classe, eleves: eleves, colonnes: colonnes, index: index };
      if (!eleves.length) { t.appendChild(el("tr", {}, [el("td", { texte: "Aucun élève dans cette classe." })])); return; }
      // Code couleur des activités : couleur de la classe, rouge ITEC, vert SIN (champ « partie » du catalogue)
      var infoC = CLASSES.filter(function (x) { return x.id === classe; })[0] || {};
      var SPE = { itec: ["Spé ITEC", "--c-itec"], sin: ["Spé SIN", "--c-sin"] };
      colonnes.forEach(function (c) {
        var og = (infoC.onglets || []).filter(function (o) { return o.id === c.onglet; })[0];
        c.coul = SPE[c.partie] ? SPE[c.partie][1] : (infoC.couleur || "--accent");
        c.groupe = SPE[c.partie] ? SPE[c.partie][0] : (og ? og.nom + (c.onglet === "2i2d" ? " commun" : "") : (c.onglet ? c.onglet : "Activités"));
        c.court = c.titre.replace(/^(Spécialité|Partie)\s+(ITEC|SIN)\s*·\s*/i, "");
      });
      var ligneG = el("tr", { class: "groupes" }, [el("th", { class: "vide-g" })]);
      colonnes.forEach(function (c, i) {
        if (i && colonnes[i - 1].groupe === c.groupe) { ligneG.lastChild.colSpan += 1; return; }
        var th = el("th", { class: "grp", texte: c.groupe }); th.colSpan = 1; th.style.setProperty("--c", "var(" + c.coul + ")"); ligneG.appendChild(th);
      });
      t.appendChild(ligneG);
      t.appendChild(el("tr", {}, [el("th", { texte: "Élève" })].concat(colonnes.map(function (c, i) {
        var th = el("th", { class: "res-col" + (i && colonnes[i - 1].groupe !== c.groupe ? " debut-g" : ""), title: c.titre, texte: c.court });
        th.style.setProperty("--c", "var(" + c.coul + ")"); return th; }))));
      eleves.forEach(function (e) {
        var tr = el("tr", {}, [el("td", {}, [TH_lienEleve(e.nom + " " + e.prenom, e.id)])]);
        colonnes.forEach(function (c) {
          var p = index[e.id + "|" + c.id], td;
          if (!p) td = el("td", { class: "c rien", texte: "—" });
          else {
            var quand = "Dernier passage : " + new Date(p.maj_le).toLocaleString("fr-FR") + (p.score != null ? " · score " + p.score : "");
            if (p.termine) td = el("td", { class: "c fait", title: quand, texte: "✓" });
            else if (p.avancement != null) td = el("td", { class: "c cours", title: quand, texte: Math.round(p.avancement) + " %" });
            else td = el("td", { class: "c cours", title: quand, texte: "●" });
          }
          td.style.setProperty("--c", "var(" + c.coul + ")");
          if (colonnes.indexOf(c) && colonnes[colonnes.indexOf(c) - 1].groupe !== c.groupe) td.classList.add("debut-g");
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
      var ko = function (n) { return Math.max(1, Math.round(n / 1024)).toLocaleString("fr-FR") + " Ko"; };
      zone.appendChild(el("p", {}, [a, el("small", { class: "aide", texte: "  " + ko(f.size) + " → " + ko(out.length) })]));
      a.click();
    }
    $("c-etat").textContent = fichiers.length + " fichier(s) chiffré(s) pour " + nomClasse(classe) + ". Si un téléchargement n'est pas parti, clique sur son lien.";
    zone.appendChild(el("p", { class: "aide", texte: "Ensuite : dépose ces fichiers dans le dossier « " + classe + " » de ton dépôt GitHub." }));
  };

  /* =================== EMPLOI DU TEMPS =================== */
  var edtCharge = false;
  async function chargerEdt() {
    var z = $("e-jours"); if (!z) return; vider(z); $("e-etat").textContent = "";
    var cours = [], son = [];
    try {
      cours = await TH.rest("edt?select=jour,debut,fin,classe,libelle,salle&order=jour,debut");
      var r = await TH.rest("edt_reglages?select=sonneries"); son = (r[0] && r[0].sonneries) || [];
    } catch (e) { $("e-etat").textContent = /edt/.test(message(e)) ? "Lance d'abord le script 21-emploi-du-temps.sql dans Supabase." : "Erreur : " + message(e); }
    $("e-son").value = son.join("  ");
    dessinerSemaine(cours, son);
    JOURS.slice(0, 6).forEach(function (nomJour, i) {
      var bloc = el("div", { class: "edt-jour", "data-jour": i + 1 }, [el("h3", { texte: nomJour })]);
      var liste = el("div", { class: "edt-liste" }); bloc.appendChild(liste);
      cours.filter(function (c) { return c.jour === i + 1; }).forEach(function (c) { liste.appendChild(ligneCours(c)); });
      var plus = el("button", { class: "btn mini", type: "button", texte: "+ Cours" });
      plus.onclick = function () {
        var der = liste.lastElementChild, d = der ? der.querySelector("[data-k=fin]").value : "08:00";
        liste.appendChild(ligneCours({ debut: d, fin: d }));
      };
      bloc.appendChild(plus); z.appendChild(bloc);
    });
    edtCharge = true;
  }
  /* Vue visuelle de la semaine */
  var semaineTimer = null;
  function dessinerSemaine(cours, son) {
    var z = $("e-semaine"); if (!z) return; vider(z);
    var mn = function (h) { var p = String(h).split(":"); return (+p[0]) * 60 + (+p[1] || 0); };
    var hh = function (m) { return Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0"); };
    if (!cours.length) {
      var b = el("button", { class: "btn primary", type: "button", texte: "Saisir mon emploi du temps" });
      b.onclick = function () { sousOnglet("modifier"); };
      z.appendChild(el("div", { class: "edt-vide" }, [el("p", { texte: "Aucun cours pour l'instant." }), b])); return;
    }
    var bornes = cours.map(function (c) { return mn(c.debut); }).concat(cours.map(function (c) { return mn(c.fin); })).concat(son.map(mn));
    var t0 = Math.floor(Math.min.apply(null, bornes) / 30) * 30, t1 = Math.ceil(Math.max.apply(null, cours.map(function (c) { return mn(c.fin); })) / 30) * 30;
    var K = 1.4, haut = (t1 - t0) * K;
    // récréations : écart de moins de 30 min entre deux sonneries
    var sm = son.map(mn).sort(function (x, y) { return x - y; }), recres = [];
    for (var r = 0; r + 1 < sm.length; r++) if (sm[r + 1] - sm[r] > 0 && sm[r + 1] - sm[r] < 30) recres.push([sm[r], sm[r + 1]]);
    var nbJours = cours.some(function (c) { return c.jour === 6; }) ? 6 : 5;
    var grille = el("div", { class: "edt-grille", style: "--n:" + nbJours });
    var axe = el("div", { class: "edt-axe", style: "height:" + haut + "px" });
    son.map(mn).filter(function (m) { return m >= t0 && m <= t1; }).forEach(function (m) {
      axe.appendChild(el("span", { style: "top:" + (m - t0) * K + "px", texte: hh(m) }));
    });
    grille.appendChild(el("div", { class: "edt-coin" }));
    var auj = new Date().getDay() || 7;
    JOURS.slice(0, nbJours).forEach(function (j, i) { grille.appendChild(el("div", { class: "edt-tete" + (i + 1 === auj ? " auj" : ""), texte: j })); });
    grille.appendChild(axe);
    JOURS.slice(0, nbJours).forEach(function (j, i) {
      var col = el("div", { class: "edt-col" + (i + 1 === auj ? " auj" : ""), style: "height:" + haut + "px", "data-jour": i + 1 });
      son.map(mn).filter(function (m) { return m > t0 && m < t1; }).forEach(function (m) { col.appendChild(el("i", { class: "edt-trait", style: "top:" + (m - t0) * K + "px" })); });
      cours.filter(function (c) { return c.jour === i + 1; }).forEach(function (c) {
        var a = mn(c.debut), f = mn(c.fin), k = CLASSES.filter(function (x) { return x.id === c.classe; })[0];
        var bloc = el("div", { class: "edt-bloc", style: "top:" + (a - t0) * K + "px;height:" + Math.max(18, (f - a) * K - 3) + "px;--c:var(" + (k ? k.couleur : "--muted") + ")" }, [
          el("b", { texte: k ? k.court : (c.libelle || "Cours") }),
          el("span", { texte: [k ? c.libelle : null, c.salle ? "salle " + c.salle : null].filter(Boolean).join(" · ") }),
          el("small", { texte: hh(a) + " – " + hh(f) })]);
        bloc.title = (k ? k.nom + " · " : "") + (c.libelle || "") + (c.salle ? " · salle " + c.salle : "") + " · " + hh(a) + "–" + hh(f);
        bloc.setAttribute("data-a", a); bloc.setAttribute("data-f", f);
        bloc.insertBefore(el("i", { class: "edt-fait" }), bloc.firstChild);
        recres.forEach(function (rc) {
          if (rc[0] < a || rc[1] > f) return;
          bloc.appendChild(el("i", { class: "edt-recre", style: "top:" + ((rc[0] - a) * K - 1) + "px;height:" + (rc[1] - rc[0]) * K + "px", texte: "récré " + hh(rc[0]) }));
        });
        col.appendChild(bloc);
      });
      grille.appendChild(col);
    });
    z.appendChild(grille);
    var maintenant = function () {
      var old = z.querySelector(".edt-maintenant"); if (old) old.remove();
      var d = new Date(), m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60, col = z.querySelector('.edt-col[data-jour="' + (d.getDay() || 7) + '"]');
      z.querySelectorAll(".edt-bloc").forEach(function (b) {
        var a = +b.getAttribute("data-a"), f = +b.getAttribute("data-f"), dedans = !!col && col.contains(b) && m >= a && m < f;
        b.classList.toggle("en-cours", dedans);
        b.querySelector(".edt-fait").style.height = dedans ? (m - a) * K + "px" : "0";
        var p = b.querySelector(".edt-pct");
        if (dedans) { if (!p) { p = el("em", { class: "edt-pct" }); b.appendChild(p); } p.textContent = Math.floor((m - a) / (f - a) * 100) + " %"; }
        else if (p) p.remove();
      });
      if (col && m >= t0 && m <= t1) col.appendChild(el("i", { class: "edt-maintenant", style: "top:" + (m - t0) * K + "px" }));
    };
    maintenant(); clearInterval(semaineTimer); semaineTimer = setInterval(maintenant, 5000);
  }
  function sousOnglet(v) {
    document.querySelectorAll("[data-edt]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-edt") === v); });
    $("e-semaine").hidden = v !== "semaine"; $("e-modifier").hidden = v !== "modifier";
  }
  document.querySelectorAll("[data-edt]").forEach(function (b) { b.onclick = function () { sousOnglet(b.getAttribute("data-edt")); }; });

  function ligneCours(c) {
    var cl = el("select", { "data-k": "classe" }, [el("option", { value: "", texte: "—" })]);
    CLASSES.forEach(function (k) { cl.appendChild(el("option", { value: k.id, texte: k.court || k.nom })); });
    cl.value = c.classe || "";
    var sup = el("button", { class: "btn mini danger", type: "button", texte: "✕", title: "Supprimer" });
    var l = el("div", { class: "edt-ligne" }, [
      el("input", { type: "time", "data-k": "debut", value: (c.debut || "").slice(0, 5) }),
      el("input", { type: "time", "data-k": "fin", value: (c.fin || "").slice(0, 5) }),
      cl,
      el("input", { "data-k": "libelle", placeholder: "Intitulé (facultatif)", value: c.libelle || "" }),
      el("input", { "data-k": "salle", placeholder: "Salle", value: c.salle || "", class: "edt-salle" }), sup]);
    sup.onclick = function () { l.remove(); };
    return l;
  }
  async function enregistrerEdt() {
    var etat = $("e-etat"), lignes = [], err = "";
    document.querySelectorAll("#e-jours .edt-jour").forEach(function (b) {
      var j = +b.getAttribute("data-jour");
      b.querySelectorAll(".edt-ligne").forEach(function (l) {
        var v = function (k) { return l.querySelector("[data-k=" + k + "]").value.trim(); };
        if (!v("debut") && !v("fin")) return;
        if (!v("debut") || !v("fin") || v("fin") <= v("debut")) { err = JOURS[j - 1] + " : vérifie les heures de début et de fin."; return; }
        lignes.push({ jour: j, debut: v("debut"), fin: v("fin"), classe: v("classe") || null, libelle: v("libelle") || null, salle: v("salle") || null });
      });
    });
    if (err) { etat.textContent = err; return; }
    var son = ($("e-son").value.match(/\d{1,2}\s*[h:]\s*\d{2}/g) || []).map(function (x) {
      var p = x.replace(/\s/g, "").split(/[h:]/); return String(+p[0]).padStart(2, "0") + ":" + p[1];
    }).sort();
    etat.textContent = "Enregistrement…";
    try {
      await TH.rest("edt?prof=eq." + TH.session().user.id, { method: "DELETE", headers: { "Prefer": "return=minimal" } });
      if (lignes.length) await TH.rest("edt", { method: "POST", headers: { "Prefer": "return=minimal" }, body: lignes });
      await TH.rest("edt_reglages?on_conflict=prof", { method: "POST", headers: { "Prefer": "resolution=merge-duplicates,return=minimal" }, body: { sonneries: son } });
      $("e-son").value = son.join("  ");
      etat.textContent = "Enregistré : " + lignes.length + " cours, " + son.length + " sonneries.";
      dessinerSemaine(lignes, son);
      if (window.TH_CHRONO_RECHARGER) window.TH_CHRONO_RECHARGER();
    } catch (e) { etat.textContent = "Erreur : " + message(e); }
  }
  if ($("e-enr")) $("e-enr").onclick = enregistrerEdt;

  /* ---------- Allègement : aides repliées, sections repliables, filtres ---------- */
  function alleger() {
    // Longues explications : repliées derrière « Aide »
    document.querySelectorAll("main .vue > p.aide").forEach(function (p) {
      if (p.textContent.length < 110 || p.id) return;
      var d = el("details", { class: "aide-pli" }, [el("summary", { texte: "Aide" })]);
      p.parentNode.insertBefore(d, p); d.appendChild(p);
    });
    // Sections (titre h2) repliables ; état mémorisé
    var memoPli = {}; try { memoPli = JSON.parse(localStorage.getItem("th-prof-plis") || "{}"); } catch (e) {}
    var DEFAUT = { "vue-pass": [false, true, true, false, true], "vue-activites": [true, true, false, false] };
    Object.keys(DEFAUT).forEach(function (vid) {
      var vue = $(vid); if (!vue) return;
      [].slice.call(vue.children).filter(function (n) { return n.tagName === "H2"; }).forEach(function (h, i) {
        var cle = vid + ":" + i, d = el("details", { class: "pli" }), sm = el("summary");
        d.open = cle in memoPli ? memoPli[cle] : DEFAUT[vid][i] !== false;
        vue.insertBefore(d, h); sm.appendChild(h); d.appendChild(sm);
        var n = d.nextSibling;
        while (n && n.tagName !== "H2") { var suiv = n.nextSibling; d.appendChild(n); n = suiv; }
        d.addEventListener("toggle", function () { memoPli[cle] = d.open; try { localStorage.setItem("th-prof-plis", JSON.stringify(memoPli)); } catch (e) {} });
      });
    });
    // « Enregistrer » discret tant que la ligne n'est pas modifiée
    ["a-zone", "p-paliers", "p-saisons"].forEach(function (id) {
      var z = $(id); if (!z) return;
      z.classList.add("enr-discret");
      var marquer = function (e) { var tr = e.target.closest && e.target.closest("tr"); if (tr && !e.target.closest("button")) tr.classList.add("modifie"); };
      z.addEventListener("input", marquer); z.addEventListener("change", marquer);
      z.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button.primary"); if (b) { var tr = b.closest("tr"); if (tr) tr.classList.remove("modifie"); } });
    });
        // Récompenses : filtre par type + recherche
    var rt = $("p-recomp");
    if (rt) {
      var TYPES = [["avatar", "Avatars"], ["titre", "Titres"], ["badge", "Badges"], ["ornement", "Ornements"], ["banniere", "Bannières"], ["", "Tout"]];
      var choix = "avatar", rech = el("input", { type: "search", placeholder: "Rechercher…", class: "filtre-rech" });
      var barre = el("div", { class: "filtre-barre" });
      TYPES.forEach(function (t) {
        var b = el("button", { type: "button", class: "filtre-puce" + (t[0] === choix ? " on" : ""), texte: t[1] });
        b.onclick = function () { choix = t[0]; barre.querySelectorAll(".filtre-puce").forEach(function (x) { x.classList.toggle("on", x === b); }); filtrer(); };
        barre.appendChild(b);
      });
      barre.appendChild(rech); rech.oninput = filtrer;
      rt.parentNode.parentNode.insertBefore(barre, rt.parentNode);
      function filtrer() {
        var q = rech.value.trim().toLowerCase(), voir = true;
        [].slice.call(rt.rows).forEach(function (tr, i) {
          if (!i || tr.querySelector("th")) return;
          var sel = tr.cells[0] && tr.cells[0].querySelector("select");
          if (sel) {
            var nom = tr.querySelector("input.pp-nom"), txt = (nom ? nom.value : tr.textContent).toLowerCase();
            voir = (!choix || sel.value === choix) && (!q || txt.indexOf(q) >= 0);
          }
          tr.classList.toggle("filtre-cache", !voir);
        });
      }
      new MutationObserver(filtrer).observe(rt, { childList: true, subtree: true });
      rt.addEventListener("change", filtrer);
    }
    // Statistiques : masquer les ressources jamais ouvertes
    var st = $("st-table");
    if (st) {
      var cb = el("input", { type: "checkbox" }); cb.checked = true;
      var lab = el("label", { class: "case" }, [cb, document.createTextNode(" Masquer les ressources jamais ouvertes")]);
      var resume = $("st-resume"); if (resume) resume.parentNode.appendChild(lab);
      var masquer = function () {
        [].slice.call(st.rows).forEach(function (tr, i) {
          if (!i || tr.cells.length < 3) return;
          tr.classList.toggle("filtre-cache", cb.checked && /^0\//.test(tr.cells[1].textContent.trim()));
        });
      };
      cb.onchange = masquer; new MutationObserver(masquer).observe(st, { childList: true });
    }
  }

  /* ---------- Démarrage ---------- */
  if (COLLEGUE) {
    document.querySelectorAll(".onglets-groupe").forEach(function (g) { g.remove(); });
    document.querySelector("main h1").textContent = "Suivi de mes élèves";
    var garder = ["suivi", "edt"];
    boutons.forEach(function (b) { if (garder.indexOf(b.getAttribute("data-vue")) < 0) b.remove(); });
    document.querySelectorAll(".vue").forEach(function (v) { if (garder.indexOf(v.id.replace("vue-", "")) < 0) v.remove(); });
    boutons = document.querySelectorAll("#ongletsProf .onglet");
    var sel = $("s-classe"); if (sel) sel.disabled = sel.options.length < 2;
    montrer((location.hash || "").replace("#", "") === "edt" ? "edt" : "suivi");
    return;
  }
  alleger();
  chargerEleves();
  chargerCollegues();
  if (window.TH_PROF_PASS) window.TH_PROF_PASS(acces);
  var VUES = ["eleves", "suivi", "edt", "horaires", "chiffrer", "direct", "activites", "pass", "alertes"];
  var h = (location.hash || "").replace("#", "");
  if (VUES.indexOf(h) >= 0) montrer(h);
  window.addEventListener("hashchange", function () { var v = location.hash.replace("#", ""); if (VUES.indexOf(v) >= 0) montrer(v); });
};
