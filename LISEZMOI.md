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
