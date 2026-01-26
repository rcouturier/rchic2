# R-portable for Windows

Placez ici les binaires R compilés pour Windows.

## Structure attendue

```
R-portable-win/
├── bin/
│   ├── Rscript.exe (binaire Windows - à fournir)
│   └── R.exe (binaire Windows - à fournir)
└── bin/x64/
    ├── Rscript.exe (alternative avec architecture spécifique)
    └── R.exe
```

## Installation des binaires

1. Téléchargez l'installeur R pour Windows depuis https://cran.r-project.org/bin/windows/

2. Extrayez les binaires :
   - Si vous utilisez l'installeur R, naviguez vers le dossier d'installation R (ex: `C:\Program Files\R\R-4.x.x`)
   - Copiez tout le contenu dans ce dossier `electron/R-portable-win/`

3. Vérifiez la structure :
   - Vous devez avoir `electron/R-portable-win/bin/Rscript.exe` et `electron/R-portable-win/bin/R.exe`

## Notes

- Les binaires x64 sont fortement recommandés
- Assurez-vous que les exécutables R.exe et Rscript.exe existent dans bin/
- Le workflow CI/CD recherchera d'abord `bin/Rscript.exe`, puis `bin/x64/Rscript.exe` en fallback
