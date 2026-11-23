/* =========================================================================
   th.js · connexion Supabase, garde des pages, chiffrement des ressources
   Aucune bibliothèque externe : appels directs à l'API Supabase.
   Toutes les clés localStorage du site commencent par « th- ».
   ========================================================================= */
(function () {
  var C = window.TH_CONFIG;
  var CLE_SESSION = "th-session";
  var CLE_ACCES = "th-acces";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }

  /* ---------- Appels HTTP ---------- */
  async function appel(chemin, options, jeton) {
    options = options || {};
    var h = Object.assign({ "apikey": C.supabaseKey, "Content-Type": "application/json" }, options.headers || {});
    if (jeton) h["Authorization"] = "Bearer " + jeton;
    var rep = await fetch(C.supabaseUrl + chemin, {
      method: options.method || "GET", headers: h,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    var texte = await rep.text();
    var data = null;
    try { data = texte ? JSON.parse(texte) : null; } catch (e) { data = texte; }
    if (!rep.ok) {
      var msg = (data && (data.msg || data.message || data.error_description || data.error)) || ("Erreur " + rep.status);
      var err = new Error(msg); err.status = rep.status; err.code = data && (data.error_code || data.code); err.data = data;
      throw err;
    }
    return data;
  }

  /* ---------- Session ---------- */
  function lireSession() { try { return JSON.parse(lsGet(CLE_SESSION) || "null"); } catch (e) { return null; } }
  function ecrireSession(s) {
    if (!s || !s.access_token) { lsDel(CLE_SESSION); return; }
    var exp = s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600));
    lsSet(CLE_SESSION, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: exp, user: { id: s.user.id, email: s.user.email } }));
  }

  var rafraichissement = null;
  // Renouvelle le jeton. Plusieurs onglets ouverts partagent la même session :
  // un seul renouvelle à la fois (verrou), et on ne déconnecte jamais si un autre onglet
  // a déjà obtenu un jeton neuf ou si l'échec vient du réseau.
  async function jeton() {
    var s = lireSession();
    if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
    if (!rafraichissement) {
      var faire = async function () {
        var s2 = lireSession();
        if (!s2) return null;
        if (s2.expires_at - 60 > Date.now() / 1000) return s2.access_token;   // déjà renouvelé ailleurs
        try {
          var n = await appel("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s2.refresh_token } });
          ecrireSession(n); return n.access_token;
        } catch (e) {
          var s3 = lireSession();
          if (s3 && s3.refresh_token !== s2.refresh_token && s3.expires_at - 60 > Date.now() / 1000) return s3.access_token;
          if (e.status >= 400 && e.status < 500) ecrireSession(null);       // jeton vraiment refusé
          return null;
        }
      };
      rafraichissement = ((navigator.locks && navigator.locks.request) ? navigator.locks.request("th-jeton", faire) : faire())
        .finally(function () { rafraichissement = null; });
    }
    return rafraichissement;
  }

  function emailDe(identifiant) {
    identifiant = (identifiant || "").trim().toLowerCase();
    return identifiant.indexOf("@") >= 0 ? identifiant : identifiant + "@" + C.domaineEleves;
  }

  // Efface ce que les ressources ont laissé dans le navigateur (ordinateurs partagés)
  function purgerTraces() {
    try {
      var a = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("th-") !== 0) a.push(k);
      }
      a.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  async function connexion(identifiant, mdp) {
    var s = await appel("/auth/v1/token?grant_type=password", { method: "POST",
      body: { email: emailDe(identifiant), password: mdp } });
    purgerTraces();
    try { sessionStorage.clear(); } catch (e) {}   // rien de l'élève précédent (profil, barre…) ne reste
    ecrireSession(s);
    ssDel(CLE_ACCES);
    return acces(true);
  }

  async function deconnexion() {
    var j = await jeton();
    if (j) { try { await appel("/auth/v1/logout", { method: "POST" }, j); } catch (e) {} }
    ecrireSession(null); ssDel(CLE_ACCES); purgerTraces();
    try { sessionStorage.clear(); } catch (e) {}
  }

  /* ---------- Base de données (REST) ---------- */
  async function rest(chemin, options) {
    var j = await jeton();
    if (!j) { var e = new Error("non_connecte"); e.status = 401; throw e; }
    return appel("/rest/v1/" + chemin, options, j);
  }
  function rpc(fn, args) { return rest("rpc/" + fn, { method: "POST", body: args || {} }); }
  /* Un collègue voit une ressource si elle est cochée, ou si toute la classe est ouverte (« classe/* ») */
  function autorise(a, id) {
    if (!a || a.role !== "collegue") return true;
    var l = a.ressources || [];
    return l.indexOf(id) >= 0 || l.indexOf(String(id).split("/")[0] + "/*") >= 0;
  }

  /* ---------- Accès (profil, ouverture, clés) ---------- */
  async function acces(forcer) {
    if (!forcer) {
      try {
        var c = JSON.parse(ssGet(CLE_ACCES) || "null");
        if (c && Date.now() - c.t < 5 * 60 * 1000) return c.a;
      } catch (e) {}
    }
    var a = await rpc("mon_acces");
    if (a && a.role === "collegue") {
      // Accès collègue multi-classes (script 14) : clés de toutes les classes ouvertes
      try { var k = await rpc("cles_collegue"); if (k) a.cles = Object.assign({}, a.cles || {}, k); } catch (e) {}
      var cl = []; (a.ressources || []).forEach(function (x) { var c = String(x).split("/")[0]; if (c && cl.indexOf(c) < 0) cl.push(c); });
      if (!cl.length && a.classe) cl.push(a.classe);
      a.classes = cl;
    }
    ssSet(CLE_ACCES, JSON.stringify({ t: Date.now(), a: a }));
    return a;
  }

  /* ---------- Garde : à appeler en haut de chaque page protégée ---------- */
  async function garde(racine) {
    var vers = racine + "connexion/index.html";
    var retour = encodeURIComponent(location.pathname + location.search);
    if (!(await jeton())) { location.replace(vers + "?retour=" + retour); return null; }
    var a;
    try { a = await acces(false); }
    catch (e) {
      if (e.status === 401) { ecrireSession(null); location.replace(vers + "?retour=" + retour); return null; }
      afficherMessage("Connexion impossible", "Le serveur ne répond pas. Réessaie dans un instant.");
      return null;
    }
    if (!a || a.erreur) { await deconnexion(); location.replace(vers + "?erreur=compte"); return null; }
    if (a.role !== "prof" && !a.ouvert) {
      afficherMessage("Le site est fermé pour le moment",
        "Il est accessible pendant les horaires d'ouverture fixés par ton professeur. Reviens plus tard.", racine);
      return null;
    }
    document.documentElement.classList.add("th-ok");
    return a;
  }

  function afficherMessage(titre, texte, racine) {
    document.documentElement.classList.add("th-ok");
    var m = document.querySelector("main") || document.body;
    m.innerHTML = "";
    var d = document.createElement("div"); d.className = "vide"; d.style.marginTop = "2rem";
    var h = document.createElement("h2"); h.textContent = titre; h.style.marginTop = "0";
    var p = document.createElement("p"); p.textContent = texte;
    d.appendChild(h); d.appendChild(p);
    if (racine !== undefined) {
      var b = document.createElement("button"); b.className = "btn"; b.textContent = "Se déconnecter";
      b.onclick = async function () { await deconnexion(); location.href = racine + "connexion/index.html"; };
      d.appendChild(b);
    }
    m.appendChild(d);
  }

  /* ---------- Chiffrement AES-GCM ----------
     THv1 : AES-GCM seul. THv2 : compressé (gzip) puis chiffré → fichiers 2 à 4 fois plus légers.
     Les anciens .enc (THv1) restent lisibles. */
  var MAGIC = [84, 72, 118, 49]; // "THv1"
  var MAGIC2 = [84, 72, 118, 50]; // "THv2"
  async function importerCle(b64) {
    var brut = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    return crypto.subtle.importKey("raw", brut, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  async function flux(buffer, Classe, mode) {
    return new Response(new Blob([buffer]).stream().pipeThrough(new Classe(mode))).arrayBuffer();
  }
  async function chiffrer(buffer, cleB64) {
    var cle = await importerCle(cleB64), magic = MAGIC, donnees = buffer;
    if (window.CompressionStream) {
      try {
        var z = await flux(buffer, CompressionStream, "gzip");
        if (z.byteLength < buffer.byteLength * 0.9) { donnees = z; magic = MAGIC2; }   // déjà compressé (pdf, image…) : on n'insiste pas
      } catch (e) {}
    }
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, cle, donnees));
    var out = new Uint8Array(4 + 12 + ct.length);
    out.set(magic, 0); out.set(iv, 4); out.set(ct, 16);
    return out;
  }
  async function dechiffrer(buffer, cleB64) {
    var u = new Uint8Array(buffer), v = 0;
    if (MAGIC.every(function (x, i) { return u[i] === x; })) v = 1;
    else if (MAGIC2.every(function (x, i) { return u[i] === x; })) v = 2;
    if (!v) throw new Error("format_inconnu");
    var cle = await importerCle(cleB64);
    var clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(4, 16) }, cle, u.slice(16));
    if (v === 1) return clair;
    if (!window.DecompressionStream) { var e = new Error("navigateur_ancien"); e.navigateur = true; throw e; }
    return flux(clair, DecompressionStream, "gzip");
  }

  window.TH = {
    connexion: connexion, deconnexion: deconnexion, garde: garde, acces: acces,
    session: lireSession, jeton: jeton, rest: rest, rpc: rpc, appel: appel, autorise: autorise, emailDe: emailDe,
    chiffrer: chiffrer, dechiffrer: dechiffrer, purgerTraces: purgerTraces
  };
})();
