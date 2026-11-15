<p align="center">
  <img src="public/icon.svg" width="64" height="64" alt="" />
</p>

<h1 align="center">LyricSync</h1>

<p align="center">
  Un morceau en entrée, un fichier de sous-titres SRT calé sur la voix en sortie, pour les vidéos de paroles.
</p>

<p align="center">
  <a href="https://lyric-sinc.vercel.app">Site</a> ·
  <a href="https://huggingface.co/spaces/Joyboy-dy/lyric-sync-api">Serveur d'alignement</a>
</p>

<p align="center">
  <a href="https://github.com/Joyboy-dy/lyric-sinc/actions/workflows/ci.yml"><img src="https://github.com/Joyboy-dy/lyric-sinc/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-blue.svg" alt="Licence MIT" /></a>
</p>

---

## Comment ça marche

1. **Vous déposez un morceau.** L'artiste et le titre viennent des tags du fichier (ID3, Vorbis, MP4), sinon de son nom (`Artiste - Titre.mp3`).
2. **Paroles synchronisées.** L'application cherche le morceau sur [LRCLIB](https://lrclib.net), une base libre de paroles synchronisées, en exigeant la même durée que votre fichier (à 3 secondes près) pour ne pas prendre les paroles d'une autre version. Si elle les trouve, le SRT est prêt tout de suite, sans serveur.
3. **Sinon, alignement sur la voix.** Le serveur isole la voix avec Demucs, repère les passages chantés, transcrit mot à mot avec faster-whisper (`large-v3-turbo`), puis aligne vos paroles sur ce qu'il a entendu. Sans paroles fournies, il utilise sa transcription. Le morceau rejoint une file d'attente : un seul est traité à la fois, cinq au plus attendent.
4. **Vérification.** Les sous-titres se lisent sur le morceau : un cadre façon vidéo affiche la ligne en cours, la forme d'onde montre chaque réplique posée sur la piste, et la liste suit la lecture. Cliquez une ligne pour l'entendre.
5. **Copier ou télécharger** le fichier `.srt`, nommé d'après l'artiste et le titre.

## Conservation 24 h

Recharger ou fermer la page ne fait rien perdre pendant 24 h :

- **Dans ce navigateur** (IndexedDB) : le morceau, les paroles, les réglages, les sous-titres et l'alignement en cours. Tout est effacé 24 h après le choix du morceau, ou tout de suite avec « Clear ». En navigation privée, ou si le navigateur refuse le stockage, l'application marche simplement sans mémoire.
- **Sur le serveur** (SQLite) : un alignement est un traitement suivi par un identifiant long et aléatoire. Il continue même si la page est fermée, et la page reprend son suivi au retour. Le morceau est supprimé dès la fin du traitement, ou dès son annulation ; le résultat reste au plus 24 h. Un redémarrage du Space efface les traitements plus tôt : l'application le signale et propose de relancer.

Le morceau ne quitte le navigateur que pour l'alignement sur le serveur.

## Architecture

```
Navigateur ──► lyric-sinc.vercel.app      site statique (ce dépôt, racine)
    │
    ├────────► lrclib.net                  paroles synchronisées, appelé depuis le navigateur
    │
    └────────► Space Hugging Face          serveur d'alignement (ce dépôt, dossier api/)
               joyboy-dy-lyric-sync-api.hf.space
               FastAPI · file de traitements SQLite · Demucs · WebRTC VAD · faster-whisper
```

Les deux parties sont gratuites : Vercel sert le site, et le Space tourne sur le processeur gratuit de Hugging Face (2 cœurs, 16 Go de mémoire). Le Space s'endort après 48 h sans visite et met une à deux minutes à se réveiller : l'en-tête du site l'indique.

| Dossier | Rôle |
| --- | --- |
| `src/` | Application web : React 19, TypeScript, Vite, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) |
| `src/lib/` | Logique sans interface, testée : SRT, LRC, recherche LRCLIB, tags, forme d'onde, session, client des traitements |
| `api/` | Serveur d'alignement, et contenu du Space. Voir [api/README.md](api/README.md) |
| `docs/superpowers/` | Design et plan d'implémentation de la conservation 24 h |
| `.github/workflows/ci.yml` | Lint, tests et build du site, tests du serveur, à chaque push sur `main` et chaque pull request |

## Développer

Prérequis : Node.js 20 ou plus et [pnpm](https://pnpm.io) ; Python 3.11 ou plus pour le serveur.

```bash
pnpm install
cp .env.example .env.local   # VITE_API_URL : adresse du serveur
pnpm dev
```

Sans `VITE_API_URL`, l'application fonctionne avec LRCLIB seulement et le dit dans l'en-tête.

Pour travailler sur le site sans les modèles (plusieurs Go), lancez le faux serveur : chaque traitement attend 20 secondes et renvoie trois sous-titres de démonstration.

```bash
cd api
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt uvicorn   # macOS / Linux : .venv/bin/python
.venv/Scripts/python dev_fake.py                                      # http://localhost:7860
```

puis `VITE_API_URL=http://localhost:7860` dans `.env.local`.

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Serveur de développement du site |
| `pnpm test` | Tests du site (SRT, LRC, LRCLIB, tags, forme d'onde, session, traitements) |
| `pnpm lint` | ESLint |
| `pnpm build` | Vérification des types et build de production dans `dist/` |
| `cd api && pytest` | Tests du serveur (alignement, file de traitements, routes) |
| `cd api && python bench/align_bench.py` | Temps d'alignement sur des morceaux de 150 à 700 mots |

## Déployer

**L'ordre compte :** le serveur d'abord, le site ensuite. Le site appelle les routes `/jobs` du serveur ; publié avant lui, il échouerait à chaque alignement.

### 1. Le serveur (Space Hugging Face)

Le Space est un dépôt git à part, construit par Hugging Face à partir de `api/Dockerfile`. Pour publier une nouvelle version du serveur :

1. Cloner le Space : `git clone https://huggingface.co/spaces/Joyboy-dy/lyric-sync-api space`
2. Y copier depuis `api/` : `Dockerfile`, `README.md`, `requirements.txt`, `server.py`, `.dockerignore`, `.gitignore` et le dossier `lyricsync/` (pas `tests/`, `bench/`, `.venv/` ni `data/`).
3. Commiter, puis pousser avec un jeton Hugging Face à accès **Write** sur ce seul Space (jeton fin, « fine-grained »). Le jeton se saisit au moment du push, via le gestionnaire d'identifiants de git ou une variable d'environnement : **jamais dans l'adresse du dépôt**, où il resterait en clair.
4. Suivre la construction dans l'onglet *Logs* du Space. Elle télécharge PyTorch (version CPU) et les modèles Whisper et Demucs : compter 10 à 20 minutes.
5. Vérifier `https://joyboy-dy-lyric-sync-api.hf.space/health`, qui doit répondre `{"status":"healthy"}`.

Conseillé : dans le Space, *Settings → Variables and secrets*, la variable `ALLOWED_ORIGINS` = `https://lyric-sinc.vercel.app`, pour que seul le site puisse appeler le serveur.

### 2. Le site (Vercel)

Le projet Vercel `lyric-sinc` construit la branche `main` de ce dépôt à chaque push : il installe avec pnpm, lance `pnpm build` et publie `dist/`. Une seule variable d'environnement : `VITE_API_URL` = `https://joyboy-dy-lyric-sync-api.hf.space`. Elle est lue au moment du build : après l'avoir changée, redéployez.

## Curseurs

Chaque type d'action a son curseur, défini une fois pour toute l'application dans `src/index.css` :

| Action | Curseur | Où |
| --- | --- | --- |
| Activer (bouton, lien, interrupteur, choix) | `pointer` | boutons, liens, interrupteurs, lignes de sous-titres |
| Choisir un fichier | `pointer` | zone de dépôt, « Import .txt » |
| Déposer un fichier en cours de glisser | `copy` | zone de dépôt pendant le glisser |
| Se déplacer dans le temps | `ew-resize` | frise du morceau, au survol et pendant le glisser |
| Saisir du texte | `text` | champ des paroles |
| Explication au survol | `help` | statut du serveur |
| Travail en cours | `progress` | cadre de sous-titres et forme d'onde pendant le traitement |
| Indisponible pour l'instant | `not-allowed` | tout contrôle désactivé |

Le reste garde la flèche normale.

## Limites connues

- Le serveur gratuit tourne sur CPU : compter quelques minutes par morceau, et une ou deux de plus s'il dormait. Un seul morceau est traité à la fois.
- La transcription vise surtout l'anglais et les langues bien couvertes par Whisper. Fournir les paroles améliore nettement le résultat.
- Les paroles LRCLIB sont publiées par sa communauté : leur précision varie d'un morceau à l'autre.
- Un redémarrage du Space (nouvelle version, panne, réveil après 48 h de sommeil) efface les traitements en cours ou terminés.

## Licence

[MIT](LICENSE) © Joyboy-dy. Paroles synchronisées fournies par [LRCLIB](https://lrclib.net). Liste des modèles et bibliothèques du serveur dans [api/README.md](api/README.md).
