---
title: "Ski Race Timer - Manuel d'utilisation"
subtitle: "Chronométrage de courses de ski synchronisé par GPS"
author: "Ski Race Timer"
date: "Février 2026"
subject: "Manuel d'utilisation"
lang: "fr"
titlepage: true
titlepage-color: "1a1a2e"
titlepage-text-color: "FFFFFF"
titlepage-rule-color: "00bcd4"
titlepage-rule-height: 2
titlepage-logo: "logo.png"
logo-width: 40mm
toc: true
toc-own-page: true
colorlinks: true
header-left: "Ski Race Timer - Manuel d'utilisation"
header-right: "Février 2026"
footer-left: "Ski Race Timer"
footer-center: ""
footer-right: "\\thepage"
---

# Ski Race Timer - Manuel d'utilisation

**Chronométrage de courses de ski synchronisé par GPS**

Version 5.24.6 | Dernière mise à jour : Février 2026

---

## Table des matières

1. [Introduction](#introduction)
2. [Premiers pas](#premiers-pas)
3. [Vue Chronomètre](#vue-chronomètre)
4. [Vue Résultats](#vue-résultats)
5. [Mode Juge de porte](#mode-juge-de-porte)
6. [Mode Directeur de course](#mode-directeur-de-course)
7. [Paramètres](#paramètres)
8. [Synchronisation multi-appareils](#synchronisation-multi-appareils)
9. [Formats d'export](#formats-dexport)
10. [Raccourcis clavier](#raccourcis-clavier)
11. [Dépannage](#dépannage)

---

## Introduction

Ski Race Timer est une application de chronométrage professionnelle pour les courses de ski. Elle fonctionne comme une Progressive Web App (PWA) sur tout appareil et est utilisable hors ligne.

### Fonctionnalités principales

- **Chronométrage synchronisé par GPS** pour des horodatages précis sur tous les appareils
- **Synchronisation multi-appareils** pour coordonner les chronométrages au départ et à l'arrivée
- **Mode Juge de porte** avec saisie rapide porte-en-premier pour l'enregistrement des fautes de porte
- **Mode Directeur de course** pour la revue des fautes, les décisions de pénalité et les approbations de suppression
- **Commande vocale** pour une utilisation mains libres sur la piste
- **Mode veille** pour protéger contre les horodatages accidentels en cas d'inactivité
- **Économiseur de batterie** - réduction automatique des animations en cas de batterie faible pour une autonomie prolongée
- **Statut FLT** (pénalité de faute) pour les catégories U8/U10
- **Support deux manches** pour le slalom et le slalom géant
- **Hors ligne d'abord** - fonctionne sans internet, se synchronise dès la connexion rétablie
- **Capture photo** - documentation optionnelle pour chaque horodatage
- **Export Race Horology** - format CSV standard de l'industrie
- **Bilingue** - interfaces en allemand et en anglais

---

## Premiers pas

### Configuration initiale

Lors du premier lancement de l'application, un assistant de configuration vous guide à travers 6 étapes :

![Configuration](screenshots/en-onboarding.png)

1. **Langue** - Choisissez Deutsch ou English
2. **Rôle** - Choisissez votre rôle d'appareil (Chronométreur ou Juge de porte)
3. **Nom de l'appareil** - Nommez ce chronomètre (par ex. « Départ », « Arrivée »)
4. **Capture photo** - Activez si vous souhaitez des photos à chaque horodatage
5. **Synchronisation cloud** - Entrez un identifiant de course et un code PIN pour synchroniser avec d'autres appareils
6. **Récapitulatif** - Vérifiez vos paramètres avant de terminer

![Sélection du rôle](screenshots/en-onboarding-role.png)

> **Conseil :** Relancez l'assistant à tout moment depuis Paramètres -> Afficher le tutoriel.

### Passer l'assistant

L'assistant peut être interrompu à tout moment avec le bouton « Passer ». Les données déjà saisies (nom de l'appareil, rôle) sont conservées.

### Installer comme application

Pour une expérience optimale, installez Ski Race Timer sur votre appareil :

**iOS (iPhone/iPad) :**
1. Ouvrir dans Safari
2. Partager -> Sur l'écran d'accueil

**Android :**
1. Ouvrir dans Chrome
2. Menu -> Installer l'application

---

## Vue Chronomètre

La vue Chronomètre est votre espace de travail principal pour l'enregistrement des temps de course. Elle utilise un cadran radial inspiré du click wheel de l'iPod, optimisé pour la saisie rapide de dossards et l'utilisation à une main.

![Vue Chronomètre](screenshots/en-timer-radial.png)

### Enregistrer des temps

1. **Saisir le numéro de dossard** en utilisant le cadran radial ou les touches numériques (affiché sur 3 chiffres : « 5 » -> « 005 »)
2. **Sélectionner le point de mesure** - Départ (S) ou Arrivée (F)
3. **Sélectionner la manche** - M1 ou M2 pour les courses à deux manches
4. **Appuyer sur « Enregistrer le temps »** - capture l'horodatage à la milliseconde près

### Cadran radial

Le cadran radial dispose les chiffres 0 à 9 en cercle. Il offre plusieurs méthodes de saisie :

- **Appui direct** - Appuyez sur un chiffre (0-9) sur l'anneau pour l'ajouter au numéro de dossard en cours
- **Rotation pour incrémenter** - Faites glisser votre doigt autour de l'anneau pour incrémenter ou décrémenter le numéro de dossard en continu

Le centre du cadran affiche l'heure actuelle et offre un accès rapide aux sélecteurs de point de mesure (S/F) et de manche (M1/M2).

### Geste de rotation

En faisant glisser le doigt autour de l'anneau, le cadran tourne et le numéro de dossard s'incrémente ou se décrémente selon la direction :

- **Sens horaire** - Incrémenter le numéro de dossard
- **Sens antihoraire** - Décrémenter le numéro de dossard
- **Physique d'inertie** - Le cadran continue de tourner après le relâchement avec un effet de friction
- **Retour automatique** - Après 800 ms d'inactivité, le cadran revient à sa position de repos

### Points de mesure

- **Départ (S)** - Lorsque le coureur quitte le portillon de départ
- **Arrivée (F)** - Lorsque le coureur franchit la ligne d'arrivée

### Sélection de la manche

- **M1** - Première manche
- **M2** - Deuxième manche

> **Conseil :** Tous les chronomètres doivent utiliser le même réglage de manche pendant une course.

### Auto-incrémentation

Lorsqu'elle est activée (par défaut), le numéro de dossard augmente de 1 après l'enregistrement d'un temps à l'arrivée. Utile lorsque les coureurs arrivent dans l'ordre.

### Avertissement de doublon

Enregistrer la même combinaison dossard + point de mesure + manche deux fois affiche un avertissement jaune. L'entrée est tout de même enregistrée.

### Mode paysage

En orientation paysage, la vue Chronomètre bascule automatiquement vers une disposition en deux colonnes :
- **Colonne de gauche** - Le cadran radial occupe toute la hauteur de l'écran
- **Colonne de droite** - En-tête, saisie du dossard, statistiques, bouton d'enregistrement, barre d'onglets

Cette disposition maximise la taille du cadran tout en gardant toutes les commandes accessibles.

### Verrouillage de l'écran

Pendant le chronométrage, l'écran reste actif (Wake Lock). Cela empêche l'écran de s'éteindre pendant une manche.

> **Remarque :** Si le verrouillage de l'écran ne peut pas être activé, l'application affiche un avertissement.

### Mode veille

Pour éviter les horodatages accidentels en cas d'inactivité, l'application active un mode veille après 30 secondes sans interaction :

- **L'écran s'atténue** après 30 secondes d'inactivité
- **La première pression** quitte le mode veille (n'enregistre **aucun** horodatage)
- **La deuxième pression** enregistre l'horodatage normalement

Ce comportement est intentionnel et protège contre les enregistrements involontaires, par exemple dans la poche de la veste.

> **Conseil :** Le mode veille peut être activé ou désactivé dans Paramètres -> Avancé.

---

## Vue Résultats

Afficher, modifier et exporter toutes les entrées enregistrées.

![Vue Résultats](screenshots/en-results-new.png)

### Liste des entrées

Chaque entrée affiche :
- **Numéro de dossard** (grand, à gauche)
- **Point de mesure** (Départ/Arrivée)
- **Manche** (M1/M2)
- **Horodatage** (HH:MM:SS.mmm)
- **Nom de l'appareil** (quel chronomètre a effectué l'enregistrement)
- **Miniature photo** (si une photo a été capturée avec l'entrée)

Les entrées avec photos affichent une icône de miniature. Appuyez sur la miniature pour voir la photo en taille réelle.

### Statistiques

- **Total** - Nombre d'entrées
- **Coureurs** - Numéros de dossard uniques
- **À l'arrivée** - Nombre d'entrées à l'arrivée

### Recherche et filtres

- **Recherche** - Trouver des entrées par numéro de dossard
- **Filtre par point de mesure** - Tous / Départ / Arrivée
- **Filtre par statut** - Tous / OK / DNS / DNF / DSQ / FLT

### Tirer pour actualiser

Tirez vers le bas sur la liste des résultats pour déclencher une synchronisation manuelle avec le cloud. Cela récupère les dernières entrées de tous les appareils connectés.

### Modifier des entrées

Appuyez sur une entrée pour la modifier :
- Changer le numéro de dossard
- Changer la manche (M1 <-> M2)
- Définir le statut (OK, DNS, DNF, DSQ, FLT)

> **Remarque :** L'horodatage et le point de mesure ne peuvent pas être modifiés. Supprimez et enregistrez à nouveau si nécessaire.

### Codes de statut

| Code | Signification |
|------|---------------|
| OK | Terminé normalement |
| DNS | Did Not Start (n'a pas pris le départ) |
| DNF | Did Not Finish (n'a pas terminé) |
| DSQ | Disqualifié |
| FLT | Terminé avec pénalité de faute (catégories U8/U10) |

### Actions

- **Annuler** - Restaurer les entrées récemment supprimées
- **Exporter** - Télécharger le CSV pour Race Horology (voir [Formats d'export](#formats-dexport))
- **Tout supprimer** - Effacer toutes les entrées (avec confirmation)

---

## Mode Juge de porte

Le mode Juge de porte utilise un **processus de saisie porte-en-premier** : on sélectionne d'abord la porte, puis le type de faute. Ce flux correspond au travail réel sur la piste, car les juges de porte surveillent des portes spécifiques et y observent les fautes.

![Vue Juge de porte](screenshots/en-gate-judge-new.png)

### Configuration

1. Aller dans Paramètres -> Sélectionner le rôle « Juge de porte »
2. Appuyer sur « Modifier » pour définir vos portes assignées (par ex. 1-10)
3. Sélectionner la manche en cours (M1/M2)

### Disposition de l'écran (de haut en bas)

1. **En-tête** - Affichage de la plage de portes, sélecteur de manche M1/M2, bouton « Modifier »
2. **Grille de portes** - Grille à 5 colonnes avec de grands boutons de porte colorés
3. **Panneau de détail de faute** - Apparaît sous les portes après sélection d'une porte
4. **Fautes enregistrées** - Liste compacte défilable des fautes enregistrées
5. **Pied de page** - Bouton « Enregistrer la faute » et bouton « Prêt » (à portée du pouce en bas de l'écran)

### Enregistrer une faute (processus porte-en-premier)

1. **Appuyer sur une porte** dans la grille à 5 colonnes
2. **Le panneau de détail** apparaît sous la grille
3. **Le dossard** est automatiquement rempli avec le dernier coureur ayant pris le départ
4. **Sélectionner le type de faute :**
   - **PM** - Porte manquée
   - **ENF** - Enfourché
   - **FO** - Fixation ouverte
5. **Appuyer sur « Enregistrer la faute »**

**Après l'enregistrement :** la porte et le dossard restent sélectionnés, seul le type de faute est réinitialisé. Cela permet d'enregistrer rapidement plusieurs fautes à la même porte pour le même coureur.

**Désélectionner une porte :** appuyer à nouveau sur la même porte masque le panneau de détail de faute.

### Grille de portes

- **5 colonnes** avec de grandes zones tactiles (56 px de hauteur)
- **Code couleur** : boutons rouges pour les portes impaires, boutons bleus pour les portes paires
- **Badges de compteur de fautes** : les portes avec des fautes enregistrées affichent le nombre sous forme de badge

### Notes vocales

Après l'enregistrement d'une faute, vous pouvez ajouter une note vocale pour documenter des détails supplémentaires :

1. **Après l'enregistrement** - Un affichage de confirmation apparaît avec un bouton « Ajouter une note »
2. **Appuyer sur « Ajouter une note »** - Ouvre la fenêtre d'enregistrement vocal
3. **Dicter votre note** - L'application transcrit votre voix en temps réel
4. **Corriger si nécessaire** - Corriger les erreurs de transcription
5. **Appuyer sur « Enregistrer »** - La note est attachée à la faute (max. 500 caractères)

**Ajouter des notes à des fautes existantes :**
1. Appuyer sur une faute dans la liste pour la modifier
2. Utiliser le bouton microphone à côté du champ de notes
3. Ou saisir manuellement dans le champ de texte

**Indicateur de note :** Les fautes avec des notes affichent un indicateur dans la liste.

> **Conseil :** Les notes vocales fonctionnent hors ligne avec la reconnaissance vocale de votre appareil. Vous pouvez toujours saisir manuellement si la commande vocale n'est pas disponible.

### Statut Prêt

En bas de l'écran se trouve le bouton « Prêt ». Appuyez dessus pour signaler que vous êtes prêt pour le prochain coureur. Le statut est visible par le Directeur de course lorsque la synchronisation cloud est active.

> **Remarque :** Le bouton « Prêt » et le bouton « Enregistrer la faute » sont intentionnellement positionnés en bas de l'écran pour être facilement accessibles avec le pouce - important pour les juges de porte qui portent des gants ou tiennent de l'équipement.

### Raccourcis clavier (Juge de porte)

| Touche | Action |
|--------|--------|
| M ou G | Sélectionner le type de faute PM (porte manquée) |
| T | Sélectionner le type de faute ENF (enfourché) |
| B ou R | Sélectionner le type de faute FO (fixation ouverte) |
| 1-9, 0 | Sélectionner le numéro de porte (0 = porte 10) |
| Touches fléchées | Naviguer entre les boutons |
| Espace / Entrée | Confirmer la sélection |
| Alt+1 | Sélectionner la manche 1 |
| Alt+2 | Sélectionner la manche 2 |

---

## Mode Directeur de course

Le mode Directeur de course offre une vue centralisée de toutes les fautes de porte, permet le calcul des pénalités et contrôle l'approbation de la suppression des entrées de fautes.

### Accès

1. Aller sur l'onglet **Résultats**
2. Activer le **bouton Directeur de course**
3. Si la synchronisation cloud est active, une **vérification par PIN** est demandée (le rôle de Directeur de course nécessite des droits élevés)

> **Remarque :** Le mode Directeur de course nécessite le rôle « chiefJudge ». L'application s'authentifie automatiquement avec ce rôle lors de l'activation.

### Panneau récapitulatif des fautes

Le panneau récapitulatif affiche toutes les fautes de porte enregistrées, regroupées par numéro de dossard :

- **Numéro de dossard** et manche
- **Portes** avec des fautes
- **Types de fautes** (PM, ENF, FO) par porte
- **Noms des juges** (quel juge de porte a enregistré la faute)
- **Calcul de pénalité** basé sur le mode de pénalité sélectionné

Cette vue consolidée permet au Directeur de course de voir la situation complète des fautes pour chaque coureur d'un coup d'oeil.

### Approbation de suppression de faute

Les juges de porte ne peuvent pas supprimer les fautes directement. À la place :

1. **Le juge de porte** demande la suppression d'une faute
2. **Le Directeur de course** voit les demandes de suppression en attente dans son panneau
3. **Le Directeur de course** peut **approuver** ou **rejeter** chaque demande individuellement

Ce processus garantit qu'aucune donnée de faute n'est supprimée accidentellement ou sans autorisation.

### Mode de pénalité

Le Directeur de course peut basculer entre deux modes de pénalité :

- **FLT (Pénalité de faute)** - Un nombre configurable de secondes de pénalité est calculé par faute. Adapté aux catégories U8/U10, où les fautes entraînent des ajouts de temps plutôt qu'une disqualification.
- **DSQ (Disqualification)** - Les fautes entraînent la disqualification du coureur.

Le temps de pénalité par faute est configurable (par ex. 3 secondes, 5 secondes).

### Finaliser les coureurs

Après confirmation de toutes les fautes pour un dossard et une manche, le Directeur de course peut finaliser (verrouiller) les résultats. Les entrées finalisées ne peuvent plus être modifiées.

### Vue d'ensemble des juges

Le Directeur de course peut voir tous les juges de porte connectés :

- **Nom** du juge de porte
- **Plage de portes assignée** (par ex. portes 1-10)
- **Statut Prêt** (si le juge de porte est prêt pour le prochain coureur)

### Export

Le Directeur de course a accès à des fonctions d'export avancées (voir [Formats d'export](#formats-dexport)) :
- Export CSV (Race Horology)
- Résumé du Directeur de course
- Résumé WhatsApp
- Carte de juge de porte

---

## Paramètres

Configurez l'application selon vos besoins.

![Paramètres](screenshots/en-settings-full.png)

### Rôle de l'appareil

Choisissez votre rôle :
- **Chronométreur** - Enregistrer les temps au départ et à l'arrivée
- **Juge de porte** - Enregistrer les fautes de porte

### Configuration de la course

- **Synchronisation cloud** - Activer/désactiver la synchronisation
- **Identifiant de course** - Identifiant unique pour votre course (par ex. « COUPE-HIVER-2026 »)
- **Nom de l'appareil** - Comment cet appareil apparaît aux autres
- **Synchroniser les photos** - Partager les photos entre appareils (uniquement les photos de moins de 500 Ko)

### Paramètres avancés

| Paramètre | Description |
|-----------|-------------|
| GPS | Utiliser le GPS pour des horodatages précis |
| Auto-incrémentation du dossard | Incrémenter automatiquement le numéro de dossard après un enregistrement à l'arrivée |
| Vibration | Retour haptique lors des actions |
| Signal sonore | Signal acoustique lors de l'enregistrement |
| Mode veille | Atténuer l'écran après 30 secondes d'inactivité (protège contre les horodatages accidentels) |
| Commande vocale | Commandes vocales mains libres pour l'utilisation sur la piste (connexion internet requise) |
| Capture photo | Prendre automatiquement une photo à chaque horodatage |

### Économiseur de batterie

L'application détecte automatiquement les niveaux de batterie faibles via la Battery Status API et réduit la consommation d'énergie :

- **Batterie moyenne (en dessous de 30 %)** - Intensité de vibration réduite et intervalles de synchronisation légèrement allongés
- **Batterie faible (en dessous de 15 %)** - Les animations décoratives (effets lumineux, indicateurs de chargement) sont mises en pause
- **Batterie critique (en dessous de 5 %)** - Réduction supplémentaire du taux de rafraîchissement de l'affichage de l'horloge
- **En charge** - L'économiseur de batterie se désactive lorsque l'appareil est branché, même avec une batterie faible

Ce fonctionnement est entièrement automatique et ne nécessite aucune configuration. L'horloge et le chronométrage continuent de fonctionner normalement en mode économie d'énergie. Si votre appareil ne prend pas en charge la Battery API, l'application fonctionne avec toutes les animations activées comme d'habitude.

### Capture photo

Lorsqu'elle est activée, une photo est prise à chaque horodatage. Utile pour :
- Vérifier les numéros de dossard
- Documenter les arrivées
- Fournir des preuves en cas de litige

### Langue

Basculer entre **DE** (Deutsch) et **EN** (English).

### Afficher le tutoriel

Relance l'assistant de configuration pour vérifier ou modifier les paramètres.

### Administration

- **PIN** - Définir un code PIN à 4 chiffres pour protéger les données de course
- **Gérer les courses** - Afficher et supprimer les courses synchronisées

---

## Synchronisation multi-appareils

Coordonnez plusieurs appareils de chronométrage pour une gestion professionnelle des courses.

### Configuration type

```
         Synchronisation cloud
           (COUPE-HIVER-26)
                  |
    +-------------+-------------+----------------+
    |             |             |                |
    v             v             v                v
  Départ      Arrivée     Juge de porte    Directeur
  Chrono      Chrono      (Portes 1-10)    de course
```

### Configurer la synchronisation

**Premier appareil :**
1. Paramètres -> Activer la synchronisation cloud
2. Saisir l'identifiant de course (par ex. « COURSE-CLUB-2026 »)
3. Définir un code PIN à 4 chiffres
4. Saisir un nom d'appareil

**Appareils supplémentaires :**
1. Activer la synchronisation cloud
2. Saisir le **même identifiant de course**
3. Saisir le **même code PIN**
4. Donner à chaque appareil un nom unique

### Ce qui est synchronisé

| Données | Synchronisées ? |
|---------|-----------------|
| Entrées de chronométrage | Oui |
| Entrées de fautes | Oui |
| Modifications et suppressions | Oui |
| Photos (si activées) | Oui |
| Demandes de suppression (Juge -> Directeur) | Oui |
| Paramètres | Non (par appareil) |

### Intervalle de synchronisation

La synchronisation vérifie les nouvelles données toutes les 5 secondes. En cas de problèmes de connexion, l'intervalle passe à 30 secondes.

### Courses récentes

Appuyez sur l'icône d'horloge à côté de l'identifiant de course pour sélectionner rapidement parmi les courses récemment synchronisées.

### Synchronisation entre onglets

Si vous utilisez plusieurs onglets dans le même navigateur, les entrées sont synchronisées instantanément via BroadcastChannel (sans passer par le cloud).

---

## Formats d'export

Ski Race Timer prend en charge plusieurs formats d'export pour le traitement des résultats et la documentation.

### CSV (Race Horology)

Le format d'export principal utilise des délimiteurs point-virgule et suit le standard Race Horology :

**Format :** séparé par des points-virgules

**Colonnes :**

```csv
Startnummer;Lauf;Messpunkt;Zeit;Status;Geraet;Torstrafzeit;Torfehler
042;1;FT;12:34:56.78;OK;Chrono Arrivée;;
015;1;FT;12:35:12.34;FLT;Chrono Arrivée;6;PM(3),ENF(5)
```

| Colonne | Description |
|---------|-------------|
| Startnummer | Numéro de dossard (3 chiffres) |
| Lauf | Manche (1 ou 2) |
| Messpunkt | Point de mesure : ST (Départ) ou FT (Arrivée) |
| Zeit | Heure au format HH:MM:SS.ss (centièmes de seconde) |
| Status | OK, DNS, DNF, DSQ ou FLT |
| Geraet | Nom de l'appareil ayant enregistré l'entrée |
| Torstrafzeit | Temps de pénalité de porte en secondes (uniquement pour le statut FLT) |
| Torfehler | Détails des fautes avec numéros de porte (uniquement en cas de fautes) |

> **Remarque :** Les en-têtes CSV restent en allemand pour la compatibilité avec Race Horology. Les formules dans les cellules sont automatiquement échappées avec un guillemet simple pour empêcher l'injection CSV.

### Résumé du Directeur de course

Fichier texte avec un récapitulatif de toutes les fautes :

- Nombre de fautes par dossard
- Portes concernées et types de fautes
- Calcul des pénalités basé sur le mode de pénalité sélectionné
- Séparation par manche (M1/M2)

### Résumé WhatsApp

Texte compact et formaté, automatiquement copié dans le presse-papiers. Optimisé pour un partage rapide via WhatsApp ou d'autres messageries.

### Carte de juge de porte

Texte imprimable au format d'une carte officielle de juge de porte :

- **En-tête** avec les informations de la course (identifiant de course, date, plage de portes)
- **Tableau des fautes** par manche avec dossard, porte, type de faute
- **Ligne de signature** pour le juge de porte
- **Légende des codes de faute** (PM, ENF, FO)

---

## Raccourcis clavier

Ski Race Timer prend en charge la navigation complète au clavier et au pavé numérique USB pour une utilisation sur ordinateur et avec des claviers externes.

### Vue Chronomètre (Cadran radial)

| Touche | Action |
|--------|--------|
| 0-9 | Saisir les chiffres du dossard |
| S | Sélectionner le point de mesure Départ (S) |
| F | Sélectionner le point de mesure Arrivée (F) |
| Alt+1 | Sélectionner la manche 1 |
| Alt+2 | Sélectionner la manche 2 |
| Espace / Entrée | Enregistrer l'horodatage |
| Échap / Suppr | Effacer le numéro de dossard |
| Retour arrière | Supprimer le dernier chiffre |

### Mode Juge de porte

| Touche | Action |
|--------|--------|
| M ou G | Sélectionner le type de faute PM (porte manquée) |
| T | Sélectionner le type de faute ENF (enfourché) |
| B ou R | Sélectionner le type de faute FO (fixation ouverte) |
| 1-9, 0 | Sélectionner le numéro de porte (0 = porte 10) |
| Touches fléchées | Naviguer entre les boutons |
| Espace / Entrée | Confirmer la sélection |
| Alt+1 | Sélectionner la manche 1 |
| Alt+2 | Sélectionner la manche 2 |

### Vue Résultats

| Touche | Action |
|--------|--------|
| Flèche haut / bas | Naviguer entre les entrées |
| Entrée / Espace | Modifier l'entrée sélectionnée |
| E | Modifier l'entrée sélectionnée |
| Suppr / D | Supprimer l'entrée sélectionnée |

### Global

| Touche | Action |
|--------|--------|
| Tab | Passer à la zone suivante |
| Maj+Tab | Passer à la zone précédente |
| Échap | Fermer les dialogues et menus déroulants |
| Touches fléchées | Naviguer à l'intérieur d'une zone |

---

## Dépannage

### Problèmes de synchronisation

**Les entrées n'apparaissent pas sur les autres appareils :**
1. Vérifiez que tous les appareils ont le même identifiant de course
2. Vérifiez que le code PIN est correct
3. Dans la vue Résultats, tirez vers le bas pour actualiser
4. Désactivez puis réactivez la synchronisation cloud

### Problèmes GPS

**Le GPS ne fonctionne pas :**
1. Activez le GPS dans les Paramètres
2. Accordez l'autorisation de localisation lorsque demandé
3. Utilisez l'application en extérieur avec une vue dégagée du ciel
4. Attendez 30 à 60 secondes pour l'acquisition des satellites

### Problèmes de caméra

**La capture photo ne fonctionne pas :**
1. Accordez l'autorisation de la caméra lorsque demandé
2. Activez la capture photo dans les Paramètres
3. Rechargez l'application

### Mode veille

**L'écran s'atténue pendant le chronométrage :**
- Le mode veille atténue l'écran après 30 secondes d'inactivité. La première pression quitte le mode veille (n'enregistre aucun horodatage), la deuxième pression enregistre normalement.
- Si non souhaité, désactivez le mode veille dans Paramètres -> Avancé.

**La première pression n'enregistre pas de temps :**
- C'est un comportement intentionnel. Après le mode veille, la première pression sert uniquement à réveiller l'écran afin d'éviter les enregistrements accidentels.

### Commande vocale

**La commande vocale ne fonctionne pas :**
1. Vérifiez la connexion internet (la commande vocale nécessite une connexion active)
2. Accordez l'autorisation du microphone dans le navigateur
3. Parlez clairement et à un volume normal
4. En cas de bruit de vent, rapprochez-vous du microphone

**Les notes vocales ne sont pas reconnues :**
- La reconnaissance vocale fonctionne hors ligne avec le moteur de reconnaissance de votre appareil
- Vous pouvez toujours saisir manuellement dans le champ de texte

### Problèmes généraux

**L'application ne se charge pas :**
1. Videz le cache du navigateur
2. Réinstallez la PWA
3. Essayez un autre navigateur

**Les données semblent perdues :**
1. Vérifiez que vous utilisez le bon identifiant de course
2. Les données pourraient se trouver sur un autre appareil
3. Si synchronisées, récupérez-les depuis un autre appareil connecté

**Le verrouillage de l'écran ne fonctionne pas :**
- Certains navigateurs ne prennent pas en charge la Wake Lock API. Si l'écran s'éteint malgré un chronométrage actif, augmentez le délai de mise en veille de l'écran dans les paramètres système de votre appareil.

---

## Support

**Signaler un problème :** https://github.com/jmeckel/ski-race-timer/issues

**Version :** 5.24.6

---

*Ski Race Timer - Le chronométrage professionnel en toute simplicité.*
