# Conservation 24 h : ne rien perdre au rechargement

## Pourquoi

Recharger la page efface tout : le morceau, les paroles, les sous-titres, et surtout un alignement en cours (plusieurs minutes sur le serveur gratuit), dont le résultat est perdu. L'objectif : retrouver sa session et ses résultats pendant 24 h, sans payer d'hébergement et sans charger le serveur.

## Objectifs

- Après un rechargement, retrouver le morceau, les paroles, les réglages et les sous-titres.
- Un alignement lancé continue sur le serveur même si la page est rechargée ou fermée ; la page reprend son suivi au retour.
- Tout est effacé au bout de 24 h, et l'interface le dit.

## Hors sujet

- Comptes, liens de partage, historique au-delà de 24 h.
- VPS, Docker Compose, GHCR (écartés : on reste sur Hugging Face + Vercel, gratuits).

## À éviter

- Garder l'audio sur le serveur après son traitement.
- Promettre 24 h garanties : le disque d'un Space gratuit s'efface à chaque redémarrage.

## Approches envisagées

1. **Hugging Face + Vercel** (retenue par le propriétaire) : session dans le navigateur, suivi des traitements en SQLite sur le disque du Space. Gratuit, rien de nouveau à administrer. Limite : un redémarrage du Space efface les traitements.
2. **Hybride avec le VPS** (Dokploy, Compose, images GHCR ; calcul resté sur Hugging Face) : données durables et domaine propre, mais plus de pièces à entretenir.
3. **Tout sur le VPS** : pas de réveil lent, mais le calcul partage les 16 Go du VPS avec les autres projets.

## Comment

### Navigateur (Vercel, site statique)

- Une seule session gardée dans IndexedDB : le fichier audio, ses infos, les paroles, les réglages, le résultat (lignes et source), le numéro du traitement en cours, la date d'enregistrement.
- Enregistrée à chaque changement (regroupé, quelques centaines de ms), relue au chargement si elle a moins de 24 h, effacée sinon.
- Une ligne discrète l'annonce : « Kept in this browser for 24 h », avec un bouton pour tout effacer.
- Si le navigateur refuse le stockage (navigation privée, quota), l'application marche comme aujourd'hui.

### Serveur (Space Hugging Face)

- `POST /jobs` (mêmes champs que `/srt`) enregistre le morceau et répond tout de suite avec un identifiant long et impossible à deviner, qui sert de clé d'accès.
- `GET /jobs/{id}` : état (`queued`, `running`, `done`, `failed`, `cancelled`), position dans la file, SRT une fois prêt, erreur sinon, date d'expiration.
- `DELETE /jobs/{id}` : annule un traitement en attente ; un traitement commencé va au bout mais son résultat est jeté.
- Un seul fil de travail traite la file dans l'ordre (comme aujourd'hui, un morceau à la fois). Au plus 5 traitements en attente, au-delà réponse 429.
- SQLite (mode WAL) dans `DATA_DIR`, sur le disque du Space. L'audio est supprimé dès la fin du traitement, réussi ou non.
- Nettoyage toutes les heures : traitements de plus de 24 h supprimés.
- Au démarrage : un traitement resté « running » passe en échec (« le serveur a redémarré ») ; ceux en attente dont l'audio existe encore sont relancés.
- `POST /srt` reste en place, synchrone, pour compatibilité.
- La gestion des traitements vit dans un module à part (`lyricsync/jobs.py`), testable sans les modèles.

### Interface

- « Align with the vocals » lance un traitement, garde son identifiant dans la session, puis interroge le serveur toutes les 3 s (plus espacé en arrière-plan).
- Pendant l'attente : la position dans la file s'il y en a une, le temps écoulé, Annuler.
- Au retour sur la page, le suivi reprend tout seul ; un traitement expiré ou perdu au redémarrage est signalé clairement, avec la possibilité de relancer.
- Texte affiché : les résultats restent jusqu'à 24 h, sur le serveur et dans ce navigateur ; un redémarrage du serveur peut les effacer plus tôt.

## Tests

- Serveur : file, états, expiration, reprise au démarrage, limite de file (pytest, base SQLite temporaire).
- Navigateur : expiration de la session et sa relecture (vitest).
- Vérification réelle dans le navigateur : lancer un alignement, recharger pendant le traitement, retrouver le résultat.

## Laissé au constructeur

Noms exacts des tables et des champs, intervalle de regroupement des enregistrements, présentation de la ligne « 24 h ».

## Déploiement

Le Space reçoit le nouveau code par un push avec un jeton Hugging Face neuf (l'ancien, « Agents Autorisation », est à supprimer). Le site Vercel se met à jour au push sur `main`.
