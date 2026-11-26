# Dossier cao/ · CAO web de Techno-Hangar

- `index.html` : **visionneuse STEP** (pièces et assemblages exportés de SolidWorks) : arbre, vues, coupe, mesure, propriétés de masse, déplacement des pièces, vue éclatée.
- `modeleur.html` + `modeleur.js` : **modeleur de pièces** façon SolidWorks (esquisse contrainte, bossage, enlèvement, révolution, congé, chanfrein, perçage, export STEP/STL) et **espace de travail partagé** (groupes, bibliothèque, verrou, versions, corbeille).
- `occt-import-js.js` / `.wasm` : lecture des STEP pour la visionneuse (OpenCascade, LGPL).
- `lib/occ/` : noyau OpenCascade du modeleur (replicad-opencascadejs 1.2.1, LGPL, 23 Mo, mis en cache par le navigateur).
- `lib/replicad/` : replicad 1.2.1 (MIT). `lib/planegcs/` : solveur d'esquisse de FreeCAD (planegcs 1.3.0, LGPL).
- `demo/` : pièces et assemblage de démonstration de la visionneuse.

L'espace partagé a besoin du script Supabase `30-cao.sql` (à lancer une fois) et d'une session ouverte sur le site.
La recette d'une pièce (format `techno-hangar-cao`) est un JSON de quelques Ko : c'est elle qui est enregistrée, pas un fichier 3D.
