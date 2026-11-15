<p align="center">
  <img src="public/icon.svg" width="64" height="64" alt="" />
</p>

<h1 align="center">LyricSync</h1>

<p align="center">
  Un morceau en entrée, un fichier de sous-titres SRT calé sur la voix en sortie, pour les vidéos de paroles.
</p>

<p align="center">
  <a href="https://github.com/Joyboy-dy/lyric-sinc/actions/workflows/ci.yml"><img src="https://github.com/Joyboy-dy/lyric-sinc/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-blue.svg" alt="Licence MIT" /></a>
</p>

---

## Comment ça marche

1. **Vous déposez un morceau.** L'artiste et le titre viennent des tags du fichier (ID3, Vorbis, MP4), sinon de son nom (`Artiste - Titre.mp3`).
2. **Paroles synchronisées.** L'application cherche le morceau sur [LRCLIB](https://lrclib.net), une base libre de paroles synchronisées, en exigeant la même durée que votre fichier (à 3 secondes près) pour ne pas prendre les paroles d'une autre version. Si elle les trouve, le SRT est prêt tout de suite, sans serveur.
3. **Sinon, alignement sur la voix.** Le serveur (`api/`) isole la voix avec Demucs, repère les passages chantés, transcrit mot à mot avec faster-whisper, puis aligne vos paroles sur ce qu'il a entendu. Sans paroles fournies, il utilise sa transcription.
4. **Vérification.** Les sous-titres se lisent sur le morceau : un cadre façon vidéo affiche la ligne en cours, la forme d'onde montre chaque réplique posée sur la piste, et la liste suit la lecture. Cliquez une ligne pour l'entendre.
5. **Copier ou télécharger** le fichier `.srt`, nommé d'après l'artiste et le titre.

Rien n'est stocké : le morceau ne quitte le navigateur que pour l'alignement sur le serveur, qui le supprime après traitement.

## Structure

| Dossier | Rôle |
| --- | --- |
| `src/` | Application web : React 19, TypeScript, Vite, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) |
| `src/lib/` | Logique sans interface, testée : SRT, LRC, recherche LRCLIB, tags, forme d'onde |
| `api/` | Serveur d'alignement FastAPI (Demucs, WebRTC VAD, faster-whisper), aussi contenu du Space Hugging Face. Voir [api/README.md](api/README.md) |

## Démarrer

Prérequis : Node.js 20 ou plus et [pnpm](https://pnpm.io).

```bash
pnpm install
cp .env.example .env.local   # puis renseigner VITE_API_URL
pnpm dev
```

Sans `VITE_API_URL`, l'application fonctionne avec LRCLIB seulement et le dit dans l'en-tête.

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Serveur de développement |
| `pnpm test` | Tests (SRT, LRC, LRCLIB, noms de fichiers, forme d'onde) |
| `pnpm lint` | ESLint |
| `pnpm build` | Vérification des types et build de production dans `dist/` |

Le serveur se lance et se teste à part : voir [api/README.md](api/README.md).

## Limites connues

- Le serveur gratuit tourne sur CPU : compter quelques minutes par morceau, et une ou deux de plus s'il dormait.
- La transcription vise surtout l'anglais et les langues bien couvertes par Whisper. Fournir les paroles améliore nettement le résultat.
- Les paroles LRCLIB sont publiées par sa communauté : leur précision varie d'un morceau à l'autre.

## Licence

[MIT](LICENSE) © Joyboy-dy. Paroles synchronisées fournies par [LRCLIB](https://lrclib.net).
