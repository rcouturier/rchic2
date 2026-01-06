# RCHIC Desktop - Application Electron

Application desktop standalone pour l'Analyse Statistique Implicative.

## Prérequis pour le développement

- Node.js >= 18
- R >= 4.0 (pour le mode développement)
- npm ou yarn

## Installation

```bash
cd electron
npm install
```

## Mode développement

En mode développement, l'application utilise le R installé sur le système :

```bash
npm run dev
```

## Construction des binaires

### 1. Préparer R portable

Pour créer une application standalone, vous devez d'abord télécharger R portable :

```bash
# Installer les packages R nécessaires
./scripts/download-r-portable.sh packages

# Télécharger R pour Windows
./scripts/download-r-portable.sh windows

# Télécharger R pour macOS
./scripts/download-r-portable.sh mac

# Instructions pour Linux
./scripts/download-r-portable.sh linux
```

### 2. Créer les icônes

Placez vos icônes dans le dossier `assets/` :
- `icon.png` - 512x512 pixels (Linux)
- `icon.ico` - Multi-résolution (Windows)
- `icon.icns` - Multi-résolution (macOS)

Vous pouvez utiliser des outils en ligne comme [iConvert Icons](https://iconverticons.com/) pour convertir un PNG.

### 3. Construire l'application

```bash
# Windows uniquement
npm run build:win

# macOS uniquement
npm run build:mac

# Linux uniquement
npm run build:linux

# Toutes les plateformes (depuis macOS)
npm run build:all
```

Les binaires seront générés dans le dossier `dist/`.

## Structure des fichiers

```
electron/
├── package.json          # Configuration npm et electron-builder
├── src/
│   └── main.js          # Process principal Electron
├── assets/
│   ├── icon.png         # Icône Linux
│   ├── icon.ico         # Icône Windows
│   └── icon.icns        # Icône macOS
├── scripts/
│   └── download-r-portable.sh  # Script de téléchargement R
├── R-portable/          # R embarqué (créé par le script)
│   ├── win32/
│   ├── darwin/
│   └── linux/
└── dist/                # Binaires générés
```

## Formats de distribution

| Plateforme | Formats | Taille approximative |
|------------|---------|---------------------|
| Windows | .exe (NSIS), .exe (portable) | ~200 Mo |
| macOS | .dmg, .zip | ~250 Mo |
| Linux | .AppImage, .deb | ~200 Mo |

## Notes importantes

1. **Windows** : L'installateur NSIS permet une installation classique
2. **macOS** : Nécessite la signature du code pour éviter les avertissements Gatekeeper
3. **Linux** : AppImage est le format le plus portable

## Dépannage

### Le serveur R ne démarre pas
- Vérifiez que R portable est correctement installé dans `R-portable/`
- Consultez les logs dans `~/.config/rchic-desktop/logs/`

### Erreur de packages R manquants
- Exécutez `./scripts/download-r-portable.sh packages`
- Vérifiez que le dossier `R-libs/` contient les packages

## Licence

GPL-3.0 - Voir le fichier LICENSE dans le dossier parent.
