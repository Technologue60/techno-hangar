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
  async function jeton() {
    var s = lireSession();
    if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
    if (!rafraichissement) {
      rafraichissement = appel("/auth/v1/token?grant_type=refresh_token", { method: "POST",
        body: { refresh_token: s.refresh_token } })
        .then(function (n) { ecrireSession(n); return n.access_token; })
        .catch(function () { ecrireSession(null); return null; })
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
    ecrireSession(s);
    ssDel(CLE_ACCES);
    return acces(true);
  }

  async function deconnexion() {
    var j = await jeton();
    if (j) { try { await appel("/auth/v1/logout", { method: "POST" }, j); } catch (e) {} }
    ecrireSession(null); ssDel(CLE_ACCES); purgerTraces();
  }

  /* ---------- Base de données (REST) ---------- */
  async function rest(chemin, options) {
    var j = await jeton();
    if (!j) { var e = new Error("non_connecte"); e.status = 401; throw e; }
    return appel("/rest/v1/" + chemin, options, j);
  }
  function rpc(fn, args) { return rest("rpc/" + fn, { method: "POST", body: args || {} }); }

  /* ---------- Accès (profil, ouverture, clés) ---------- */
  async function acces(forcer) {
    if (!forcer) {
      try {
        var c = JSON.parse(ssGet(CLE_ACCES) || "null");
        if (c && Date.now() - c.t < 5 * 60 * 1000) return c.a;
      } catch (e) {}
    }
    var a = await rpc("mon_acces");
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

  /* ---------- Chiffrement AES-GCM ---------- */
  var MAGIC = [84, 72, 118, 49]; // "THv1"
  async function importerCle(b64) {
    var brut = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    return crypto.subtle.importKey("raw", brut, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  async function chiffrer(buffer, cleB64) {
    var cle = await importerCle(cleB64);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, cle, buffer));
    var out = new Uint8Array(4 + 12 + ct.length);
    out.set(MAGIC, 0); out.set(iv, 4); out.set(ct, 16);
    return out;
  }
  async function dechiffrer(buffer, cleB64) {
    var u = new Uint8Array(buffer);
    for (var i = 0; i < 4; i++) if (u[i] !== MAGIC[i]) throw new Error("format_inconnu");
    var cle = await importerCle(cleB64);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(4, 16) }, cle, u.slice(16));
  }

  window.TH = {
    connexion: connexion, deconnexion: deconnexion, garde: garde, acces: acces,
    session: lireSession, jeton: jeton, rest: rest, rpc: rpc, appel: appel, emailDe: emailDe,
    chiffrer: chiffrer, dechiffrer: dechiffrer, purgerTraces: purgerTraces
  };
})();
