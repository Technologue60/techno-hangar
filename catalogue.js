/* =========================================================================
   CATALOGUE DES RESSOURCES
   -------------------------------------------------------------------------
   Pour ajouter une ressource :
     1. déposer le fichier dans le dossier de la classe (ex. terminale-sti2d/)
     2. copier une ligne ci-dessous et l'adapter
   Champs :
     classe    : "terminale-sti2d" | "premiere-it" | "snt" | "bts-maintenance"
     sequence  : nom de la séquence (les ressources sont regroupées par séquence)
     titre     : titre affiché
     fichier   : nom du fichier dans le dossier de la classe,
                 ou adresse complète (https://...) pour un lien externe (Drive, Google Sites)
     type      : "activite" | "td" | "pdf" | "video" | "lien"
     onglet    : (Terminale STI2D) "revision", "2i2d" ou "itec" ; inutile pour les autres classes
     sequence  : doit reprendre exactement un nom de séquence défini dans assets/site.js
     en_ligne  : true quand le fichier est bien déposé ; false = affiché « bientôt »
   Les versions prof et les corrigés ne vont PAS ici (dépôt public).
   ========================================================================= */

window.CATALOGUE = [

  /* ---------------- Terminale STI2D ---------------- */
  /* 2I2D */
  { classe: "terminale-sti2d", onglet: "2i2d", sequence: "Thème 2 · Comment sécuriser un bâtiment ?",
    titre: "Étude de cas · Webcam motorisée (partie commune)", fichier: "edc-securisation-webcam.html", type: "activite", en_ligne: true },
  { classe: "terminale-sti2d", onglet: "2i2d", sequence: "Thème 2 · Comment sécuriser un bâtiment ?",
    titre: "Spécialité ITEC · Motorisation & support de caméra", fichier: "edc-securisation-itec.html", type: "activite", en_ligne: true },

  /* ITEC */
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique",
    titre: "Le PFS · Échelle de pompier", fichier: "td-echelle-pompier.html", type: "td", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique",
    titre: "Le PFS · Structure de potence", fichier: "td-potence.html", type: "td", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique",
    titre: "Le PFS · Lève-moto", fichier: "td-levemoto-eleve.html", type: "td", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique",
    titre: "Le PFS · Lève-moto (énoncé PDF)", fichier: "TD-leve-moto-STI2D.pdf", type: "pdf", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique",
    titre: "StatGraph · la potence", fichier: "statgraph-web-potence.html", type: "activite", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique",
    titre: "StatGraph · logiciel", fichier: "statgraph-web.html", type: "activite", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique",
    titre: "TP · Portail automatisé", fichier: "suivi-tp-portail.html", type: "activite", en_ligne: false },

  /* ---------------- 1ère IT ---------------- */
  /* (aucune ressource pour l'instant : projet casque de vélo connecté à venir) */

  /* ---------------- SNT seconde ---------------- */
  { classe: "snt", sequence: "Thème 2 · Le Web",
    titre: "Chapitre · Le Web", fichier: "snt-le-web.html", type: "activite", en_ligne: true },
  { classe: "snt", sequence: "Thème 2 · Le Web",
    titre: "Activités · QCM Le Web", fichier: "snt-le-web-activites.html", type: "activite", en_ligne: false },

  /* ---------------- BTS maintenance ---------------- */
  { classe: "bts-maintenance", sequence: "ETLV · A volumetric pump",
    titre: "A volumetric pump · corrective maintenance", fichier: "pompe-volumetrique-eleve.html",
    type: "activite", en_ligne: false },
  { classe: "bts-maintenance", sequence: "ETLV · A volumetric pump",
    titre: "Feuille élève · Gamme de démontage", fichier: "Gamme-demontage-feuille-eleve.pdf",
    type: "pdf", en_ligne: false }

];
