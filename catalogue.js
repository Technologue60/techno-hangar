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
     groupe    : (facultatif) regroupe des ressources dans un menu dépliant ; groupe_icone : illustration du groupe
     icone     : (facultatif) illustration de la carte : forces, pfs, echelle, structure, moto, voiture, statgraph,
                 portail, camera, doc, web, quiz, pompe
     en_ligne  : true quand le fichier est bien déposé ; false = affiché « bientôt »
   Les versions prof et les corrigés ne vont PAS ici (dépôt public).
   ========================================================================= */

window.CATALOGUE = [

  /* ---------------- Terminale STI2D ---------------- */
  /* 2I2D */
  { classe: "terminale-sti2d", onglet: "2i2d", sequence: "Thème 2 · Comment sécuriser un bâtiment ?",
    titre: "Étude de cas · Webcam motorisée (partie commune)", fichier: "edc-securisation-webcam.html", type: "activite", icone: "camera", en_ligne: true },
  { classe: "terminale-sti2d", onglet: "2i2d", sequence: "Thème 2 · Comment sécuriser un bâtiment ?",
    titre: "Spécialité ITEC · Motorisation & support de caméra", fichier: "edc-securisation-itec.html", type: "activite", icone: "camera", en_ligne: true },

  { classe: "terminale-sti2d", onglet: "2i2d", sequence: "Étude de système",
    titre: "TP · Portail automatisé", fichier: "suivi-tp-portail.html", type: "activite", icone: "portail", en_ligne: false },

  /* ITEC · 2 Statique (groupes dépliants) */
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Les actions mécaniques", groupe_icone: "forces",
    titre: "Cours · Les actions mécaniques", fichier: "", type: "pdf", en_ligne: false },

  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Le PFS", groupe_icone: "pfs",
    titre: "Cours à compléter · Statique analytique", fichier: "statique-analytique.html", type: "activite", icone: "pfs", en_ligne: true },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Le PFS",
    titre: "TD1 · Échelle de pompier", fichier: "td-echelle-pompier.html", type: "td", icone: "echelle", en_ligne: true },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Le PFS",
    titre: "Activité · Échelle en équilibre", fichier: "echelle-equilibre.html", type: "activite", icone: "echelle", en_ligne: true },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Le PFS",
    titre: "TD2 · Structure métallique", fichier: "td-potence.html", type: "td", icone: "structure", en_ligne: true },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Le PFS",
    titre: "TD3 · Lève-moto", fichier: "td-levemoto-eleve.html", type: "td", icone: "moto", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Le PFS",
    titre: "TD3 · Lève-moto (énoncé PDF)", fichier: "TD-leve-moto-STI2D.pdf", type: "pdf", icone: "doc", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Le PFS",
    titre: "TD4 · Voiture (analytique)", fichier: "td-voiture-analytique.html", type: "td", icone: "voiture", en_ligne: false },

  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Logiciel StatGraph", groupe_icone: "statgraph",
    titre: "StatGraph · la potence", fichier: "statgraph-web-potence.html", type: "activite", icone: "structure", en_ligne: false },
  { classe: "terminale-sti2d", onglet: "itec", sequence: "2 · Statique", groupe: "Logiciel StatGraph",
    titre: "StatGraph · logiciel", fichier: "statgraph-web.html", type: "activite", icone: "statgraph", en_ligne: false },

  /* ---------------- 1ère IT ---------------- */
  /* (aucune ressource pour l'instant : projet casque de vélo connecté à venir) */

  /* ---------------- SNT seconde ---------------- */
  { classe: "snt", sequence: "Thème 2 · Le Web",
    titre: "Chapitre · Le Web", fichier: "snt-le-web.html", type: "activite", icone: "web", en_ligne: true },
  { classe: "snt", sequence: "Thème 2 · Le Web",
    titre: "Activités · QCM Le Web", fichier: "snt-le-web-activites.html", type: "activite", icone: "quiz", en_ligne: false },

  /* ---------------- BTS maintenance ---------------- */
  { classe: "bts-maintenance", sequence: "ETLV · A volumetric pump",
    titre: "A volumetric pump · corrective maintenance", fichier: "pompe-volumetrique-eleve.html", icone: "pompe",
    type: "activite", en_ligne: false },
  { classe: "bts-maintenance", sequence: "ETLV · A volumetric pump",
    titre: "Feuille élève · Gamme de démontage", fichier: "Gamme-demontage-feuille-eleve.pdf", icone: "doc",
    type: "pdf", en_ligne: false }

];
