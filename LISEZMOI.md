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
