# Installation des binaires R pour les builds Electron

Ce document explique comment installer les binaires R nécessaires pour construire les versions macOS, Windows et Linux de l'application Rchic2.

## Structure attendue

Les binaires R portables doivent être placés dans les dossiers suivants (créés lors du build) :

```
electron/
├── R-portable-mac/      # macOS (Intel & ARM)
├── R-portable-win/      # Windows
└── R-portable-linux/    # Linux
```

## macOS (Intel x86_64)

1. Obtenez les binaires R pour macOS Intel depuis :
   - https://cran.r-project.org/bin/macosx/
   - Téléchargez le fichier R-x.x.x-x86_64.pkg ou similaire

2. Extrayez le R.framework dans `electron/R-portable-mac/R.framework/`

3. Vérifiez que la structure est :
   ```
   R-portable-mac/
   ├── bin/Rscript (wrapper - déjà inclus)
   └── R.framework/
       └── Versions/4.x/Resources/bin/Rscript
   ```

4. Rendez les binaires exécutables :
   ```bash
   chmod +x electron/R-portable-mac/R.framework/Versions/4.x/Resources/bin/Rscript
   chmod +x electron/R-portable-mac/R.framework/Versions/4.x/Resources/bin/R
   ```

## Windows

1. Obtenez R pour Windows depuis : https://cran.r-project.org/bin/windows/

2. Extrayez les binaires dans `electron/R-portable-win/`

3. Structure attendue :
   ```
   R-portable-win/
   ├── bin/Rscript.exe
   └── bin/x64/Rscript.exe
   ```

## Linux

1. Compilez R pour Linux ou téléchargez les binaires

2. Placez dans `electron/R-portable-linux/`

3. Structure attendue :
   ```
   R-portable-linux/
   ├── bin/Rscript (wrapper)
   └── lib/R/bin/Rscript
   ```

4. Rendez exécutables :
   ```bash
   chmod +x electron/R-portable-linux/lib/R/bin/Rscript
   ```

## Notes importantes

- Les dossiers `R-portable-*` sont dans `.gitignore` car ils contiennent des binaires volumineux
- Les wrappers scripts `bin/Rscript` (et `bin/Rscript` pour Linux) sont déjà fournis
- Sur macOS, le wrapper gère App Translocation automatiquement
- Sur Windows, vous pouvez aussi utiliser la structure standard R avec `bin/x64/Rscript.exe`

## Build

Une fois les binaires en place, construisez l'application :

```bash
cd electron
npm install
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux
```

## Dépannage

Si vous obtenez "R: No such file or directory", vérifiez :
1. Que le dossier R-portable-* existe
2. Que la structure de répertoires correspond au fichier wrapper
3. Que les binaires sont exécutables (chmod +x sur Unix)
4. Le chemin exact dans les logs d'erreur Electron
