# Guide de Déploiement Render (Pas à Pas)

C'est parfait ! Votre code est sur GitHub (`Joyboy-dy/pyback-api`).

Voici la procédure pas à pas pour Render (basée sur votre capture d'écran) :

### Étape 1 : Créer le Service
1. Sur votre tableau de bord Render, cliquez sur le gros bouton **"Deploy a Web Service"** (le premier encadré).
2. Cliquez sur **"Next"** ou **"Build and deploy from a Git repository"**.
3. Si ce n'est pas déjà fait, connectez votre compte GitHub.
4. Vous verrez une liste de vos dépôts. Cherchez `pyback-api` et cliquez sur le bouton bleu **"Connect"**.

### Étape 2 : Validation
Comme nous avons créé un fichier `render.yaml`, Render va tout configurer automatiquement !
1. Il devrait vous afficher "Configuration detected from render.yaml".
2. Cliquez sur **"Approve"** ou **"Create Web Service"** (le bouton bleu en bas).

### Étape 3 : Déploiement
Render va maintenant construire votre application :
1. Vous verrez des logs défiler (Installation de Python, des dépendances...).
2. Cela va prendre **environ 5 à 10 minutes** la première fois (WhisperX est lourd).
3. Attendez de voir : `Your service is live 🎉`.

### Étape 4 : Connexion au Frontend
Une fois que c'est "Live" :
1. En haut à gauche de la page Render, copiez l'URL de votre site (ex: `https://pyback-api-xxxx.onrender.com`).
2. Revenez dans votre projet **Frontend** (VS Code).
3. Créez un fichier `.env.local` à la racine du dossier `lyric-sinc`.
4. Ajoutez cette ligne (en collant votre URL) :

```
VITE_API_URL=https://votre-url-render.onrender.com
```

### Étape 5 : Test
Redémarrez votre terminal frontend (`npm run dev`) pour prendre en compte la nouvelle variable d'environnement.
