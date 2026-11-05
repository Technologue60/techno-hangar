/* presence.js · Signale au serveur que l'élève est en ligne, et dans quel état :
   actif (il bouge, tape, fait défiler), inactif (rien depuis quelques minutes), ailleurs (onglet caché).
   Rien n'est envoyé pour le prof. Le serveur garde seulement le dernier signal. */
(function () {
  var INACTIF_MS = 3 * 60 * 1000, BATTEMENT_MS = 30 * 1000;
  var derniereAction = Date.now(), etatEnvoye = null, dernierEnvoi = 0, actif = false, page = "";

  function etat() {
    if (document.hidden) return "ailleurs";
    return Date.now() - derniereAction > INACTIF_MS ? "inactif" : "actif";
  }
  function envoyer(force) {
    if (!actif) return;
    var e = etat();
    if (!force && e === etatEnvoye && Date.now() - dernierEnvoi < BATTEMENT_MS) return;
    etatEnvoye = e; dernierEnvoi = Date.now();
    TH.rpc("presence_signal", { p_etat: e, p_page: page }).catch(function (err) {
      if (err && (err.status === 404 || err.code === "PGRST202")) actif = false;   // script SQL pas installé
    });
  }
  function action() {
    var avant = etat();
    derniereAction = Date.now();
    if (avant !== "actif") envoyer(true);
  }
  function ecouter(doc) {
    ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "touchstart", "input"].forEach(function (t) {
      try { doc.addEventListener(t, action, { passive: true, capture: true }); } catch (e) {}
    });
  }

  window.TH_PRESENCE = {
    demarrer: function (acces, nomPage) {
      if (!acces || acces.role !== "eleve" || actif) return;
      actif = true;
      page = nomPage || document.title.replace(/\s*·\s*Techno-Hangar$/, "");
      ecouter(document);
      document.addEventListener("visibilitychange", function () { envoyer(true); });
      setInterval(function () { envoyer(false); }, 5000);
      envoyer(true);
    },
    page: function (nom) { page = nom; envoyer(true); },
    // Pour les ressources affichées dans un cadre (voir.html) : leurs actions comptent aussi
    suivreCadre: function (iframe) {
      function brancher() { try { ecouter(iframe.contentWindow.document); } catch (e) {} }
      iframe.addEventListener("load", brancher); brancher();
    }
  };
})();
