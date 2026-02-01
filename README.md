# LyricSync - Phonetic Aligner

Application web de synchronisation audio-texte utilisant WhisperX pour générer des fichiers SRT précis.

## 🏗️ Architecture

### Frontend (Ce dossier)
- **Techno** : React + Vite + TypeScript
- **Rôle** : Interface utilisateur, upload fichiers, affichage résultat
- **Hébergement** : Local ou déployable statiquement (Vercel/Netlify)

### Backend (Cloud)
- **Code source** : Dossier `pyback-api/` (repo GitHub séparé)
- **Techno** : Python 3.11 + FastAPI + WhisperX
- **Hébergement** : Render.com (Free Tier)
- **URL** : Définie dans `.env.local`
- **Features** :
  - Transcription automatique haute qualité (WhisperX)
  - Forced Alignment (si paroles fournies)
  - Anti-mise en veille (UptimeRobot)

## Prérequis

- **Node.js** (pour le frontend)
- **Git** (pour cloner le projet)

## Installation

### 1. Cloner le projet

```bash
git clone https://github.com/Joyboy-dy/lyric-sinc.git
cd lyric-sinc
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer l'API Backend

Créez un fichier `.env.local` à la racine du projet :

```bash
VITE_API_URL=https://votre-serveur.com
```

> **Note** : Demandez l'URL du backend à l'administrateur du projet ou déployez votre propre instance (voir `pyback-api/README.md`).

## Démarrage

```bash
npm run dev
```

Ouvrez votre navigateur sur `http://localhost:3000`.

## Utilisation

1. Glissez-déposez votre fichier audio (MP3, WAV, etc.)
2. Entrez ou collez les paroles dans la zone de texte (optionnel)
3. Cliquez sur **"Generate Synchronized SRT"**
4. Attendez le traitement (3-5 minutes selon la durée)
5. Téléchargez le fichier SRT généré

> **Astuce** : Si vous ne fournissez pas de paroles, WhisperX transcrit automatiquement l'audio avec une haute précision.

## Structure du Projet

```
lyric-sinc/
├── components/          # Composants React
├── services/           # Services API
├── pyback-api/         # Code source backend (projet séparé)
├── .env.local          # Configuration (non versionné)
├── .env.example        # Template de configuration
└── README.md           # Ce fichier
```

## Gestion du Code

### Modifications Frontend
Modifiez les fichiers dans `components/`, `services/`, etc., puis :
```bash
git add .
git commit -m "description des changements"
git push
```

### Modifications Backend
Le backend est un projet séparé dans `pyback-api/` :
```bash
cd pyback-api
git add .
git commit -m "update backend"
git push
```
Render se mettra à jour automatiquement.

## Dépannage

### "Could not connect to backend server"
- Vérifiez que `.env.local` existe et contient la bonne URL
- Vérifiez que le backend est en ligne (visitez l'URL dans votre navigateur)

### Le traitement est lent
- C'est normal sur le plan gratuit de Render (CPU uniquement)
- Comptez 1-2x la durée de la chanson

## Technologies Utilisées

- **Frontend** : React, TypeScript, Vite, Lucide Icons
- **Backend** : Python, FastAPI, WhisperX, PyTorch
- **Hébergement** : Render (Backend), Local/Vercel (Frontend)

## License

MIT
