# Techno-Hangar · site de cours

## Comment c'est protégé
- Le site (GitHub Pages) ne contient que la coquille et des ressources **chiffrées** (`.enc`).
- Les comptes, les clés de déchiffrement, les horaires et la progression sont chez Supabase (Paris).
- Un élève connecté ne voit que sa classe, et seulement pendant les horaires d'ouverture.

## Ajouter une ressource
1. Espace prof → onglet **Ajouter une ressource** : choisis la classe, glisse le fichier, clique **Chiffrer**.
2. Dépose le fichier `.enc` obtenu dans le dossier de la classe sur GitHub.
3. Dans `catalogue.js`, mets le nom du fichier **sans** `.enc` et `en_ligne: true`.
Ne dépose jamais le fichier d'origine (non chiffré) sur GitHub.

## Reprise de la progression
Le site enregistre automatiquement ce que chaque page sauvegarde dans le navigateur (toutes les 10 s).
Une page peut aussi signaler son avancement :
`parent.postMessage({ type: "th-progression", avancement: 60, score: 12, termine: false }, "*")`

## Fichiers
```
index.html, voir.html        accueil, lecteur de ressource (déchiffre et affiche)
catalogue.js                 liste des ressources
assets/config.js             adresse et clé publique Supabase
assets/th.js                 connexion, garde, chiffrement
assets/site.js               en-tête, pages de classe
assets/prof.js / prof.css    espace prof
connexion/  prof/  terminale-sti2d/  premiere-it/  snt/  bts-maintenance/
```

## Pass de progression (script Supabase 03)
- Installer une fois `03-pass-progression.sql` (Supabase → SQL Editor → Run). Sans lui, le site marche comme avant.
- Espace prof → **Activités & points** : cocher les ressources qui rapportent des points, type (activité / entraînement / jeu), points, bonus, temps minimum, interrupteur, dates et horaires, ouverture pour un seul élève.
- Espace prof → **Pass** : saisons, objectif par classe, paliers, titres et avatars, donner une récompense ou des points.
- Espace prof → **En direct** (qui est connecté, actif / inactif / onglet quitté) et **Alertes & stats**.
- Une page d'entraînement ou de jeu signale une réussite avec : `parent.postMessage({ type: "th-entrainement", score: 16 }, "*")` (score sur 20, facultatif). Les activités normales n'ont rien à changer : les points tombent quand la page envoie `termine: true`.

## Thème « Équilibre » et pass en pause (8/11)
- Le style du site est dans `assets/theme.css` (chargé en dernier sur chaque page) : graphite, touche bleu-vert, l'éclat réservé aux récompenses.
- Le pass est en pause pour les élèves : `passActif: false` dans `assets/config.js`. Ils voient un aperçu flouté « Prochainement », sans titres, bannières ni messages de points ; les points continuent d'être comptés. Pour l'ouvrir : `passActif: true`.

## Objectifs du jour / de la semaine (8/11)
- Script `08-objectifs.sql` à lancer une fois dans Supabase (table `objectifs`).
- Espace prof → Activités & points → « Objectifs du jour et de la semaine » : choisir l'activité, un message facultatif et les dates. Sur l'accueil des élèves de la classe, la carte « Tes objectifs » envoie directement sur l'activité. Sans objectif en cours : « Reprendre là où tu t'es arrêté » (la liste « À découvrir » est supprimée).
- Question du jour : carte réduite à une ligne (« 1 question · 20 s » + Jouer) ; une fois répondue elle disparaît, il ne reste que le classement.

## 2I2D : spécialités sous la partie commune (8/11)
- Dans `catalogue.js`, ajouter `partie: "itec"` ou `partie: "sin"` à une activité de spécialité : elle s'affiche sous la partie commune de sa séquence, en rouge (ITEC) ou en vert (SIN), toujours avec le symbole de la spécialité (engrenage pour ITEC, puce électronique pour SIN). Le préfixe « Spécialité ITEC · » du titre est retiré à l'affichage.

## Rangs, badges par saison et grand défi · Terminale (9/11)
- Script `09-rangs-badges.sql` à lancer une fois dans Supabase, APRÈS 07 et 08. Il passe aussi les activités de Terminale au barème décidé : 60 pts une fois terminée + jusqu'à 90 pts de performance.
- `passClasses: ["terminale-sti2d"]` dans `assets/config.js` : le pass, les rangs et les badges sont ouverts pour ces classes ; les autres gardent l'aperçu « Prochainement ».
- **Pass = effort** : tous les points. **Rang annuel = performance** : seulement les points gagnés au-dessus de 10/20 (activités et grands défis). Refaire une activité ne paie que l'amélioration du meilleur score.
- Seuils des rangs (Technicien, Ingénieur, Expert) : Espace prof → Activités & points → Réglages de la classe (1 000 / 3 000 / 5 000 par défaut).
- Une récompense (avatar, titre…) avec la condition « Points de performance (rang) ≥ » se débloque avec le rang : elle apparaît dans l'info-bulle du rang.
- **Grand défi** : dans Espace prof → Activités & points, type « Grand défi », puis cocher les activités à terminer avant (le score ne compte pas). Barème par défaut : 100 pts de participation + jusqu'à 300 pts de performance. La page du défi doit aussi être dans `catalogue.js` (même séquence que ses activités).
- **Badges** : Espace prof → Pass → Récompenses → condition. « Activités cochées avec au moins … /20 » sert aux badges de défi (0 = participation, 16 = 80 %, 20 = 100 %) ; « Succès ultime » = rang Expert + toutes les activités à 20/20, vérifié après la dernière saison. Remplir « séquence » et « saison n° » pour ranger le badge dans le profil. Nouvelle rareté **Holo**.
- Saison de chaque séquence : `saisons` dans la Terminale, en haut de `assets/site.js` (1, 2, 3… dans l'ordre des dates des saisons).
- Script `10-badges-demo.sql` (après 09) : pictogrammes dessinés à la place des emojis pour tous les badges, et badges de la démo pour la Terminale (Rappels, Statique, grand défi Statique — page attendue `defi-statique.html` —, 2I2D, RDM, Cinématique, Projet, Légende du Hangar). Ceux de RDM, Cinématique, Projet et Rappels n'ont pas encore de condition : cocher leurs activités dans l'éditeur. Dans l'éditeur, un badge se dessine avec un pictogramme au choix.
- Profil élève : couverture, bandeau de saison (ouvre le pass), 3 tuiles cliquables (Rang, Activités de la saison, Badges) ; le détail s'ouvre dans un panneau.
