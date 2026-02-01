# LyricSync - Phonetic Aligner

Ce projet est une application web qui permet d'aligner phonétiquement de l'audio avec du texte en utilisant WhisperX. Il se compose d'un frontend React et d'un backend Python (FastAPI).

## Prérequis

Avant de commencer, assurez-vous d'avoir installé les logiciels suivants sur votre machine :

*   **Node.js** (pour le frontend)
*   **Python 3.8+** (pour le backend)
*   **FFmpeg** : **OBLIGATOIRE** pour le traitement audio.
    *   *Windows* : 
        ```powershell
        winget install --id Gyan.FFmpeg
        ```
        Après l'installation, **redémarrez votre terminal** pour que FFmpeg soit reconnu.
    *   *macOS* : `brew install ffmpeg`
    *   *Linux* : `sudo apt install ffmpeg`

## Installation

### 1. Backend (Python)

Le backend gère la transcription et l'alignement audio.

1.  Ouvrez un terminal dans le dossier racine du projet.
2.  (Optionnel mais recommandé) Créez un environnement virtuel :
    ```bash
    python -m venv venv
    # Windows
    venv\Scripts\activate
    # macOS/Linux
    source venv/bin/activate
    ```
3.  Installez les dépendances Python :
    ```bash
    pip install -r requirements.txt
    ```
    *Note : Si vous avez une carte graphique NVIDIA, assurez-vous d'installer la version de PyTorch compatible avec CUDA pour des performances optimales.*

### 2. Frontend (React)

Le frontend est l'interface utilisateur.

1.  Assurez-vous d'être à la racine du projet.
2.  Installez les dépendances Node :
    ```bash
    npm install
    ```

## Démarrage

Vous devez lancer le backend et le frontend simultanément (dans deux terminaux séparés).

### Terminal 1 : Lancer le Backend

```bash
# Assurez-vous que votre venv est activé
python backend_server.py
```
Le serveur démarrera sur `http://localhost:8000`.

### Terminal 2 : Lancer le Frontend

```bash
npm run dev
```
Ouvrez votre navigateur sur l'URL indiquée (généralement `http://localhost:5173`).

## Utilisation

1.  Ouvrez l'application dans votre navigateur.
2.  Glissez-déposez votre fichier audio (MP3, WAV, etc.).
3.  Entrez ou collez les paroles dans la zone de texte.
4.  Cliquez sur **"Generate Synchronized SRT"**.
5.  Attendez le traitement (environ 30s-2min selon la durée de la chanson avec le modèle 'base').
6.  Téléchargez le fichier SRT généré avec le bouton **Download**.

> **Note** : Le premier lancement téléchargera automatiquement le modèle Whisper (~90MB). Les utilisations suivantes seront plus rapides.

## Dépannage

### Erreur "Le fichier spécifié est introuvable"
Cela signifie que FFmpeg n'est pas installé. Installez-le avec :
```powershell
winget install --id Gyan.FFmpeg
```
Puis **redémarrez votre terminal** et relancez le backend.

## Structure du Projet

*   `backend_server.py` : Le serveur API FastAPI.
*   `src/` & `App.tsx` : Code source React.
*   `requirements.txt` : Dépendances Python.
*   `package.json` : Dépendances Node.js.
