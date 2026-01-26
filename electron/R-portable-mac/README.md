# R-portable for macOS

Placez ici les binaires R compilés pour macOS (Intel x86_64 et/ou ARM64).

## Structure attendue

```
R-portable-mac/
├── bin/
│   └── Rscript (wrapper script - déjà inclus)
└── R.framework/
    └── Versions/
        ├── 4.x/
        │   └── Resources/
        │       └── bin/
        │           ├── Rscript
        │           ├── R
        │           └── exec/
        │               └── R
        └── Current -> 4.x (symlink)
```

## Notes

- Le wrapper `bin/Rscript` pointe vers `R.framework/Resources/bin/Rscript`
- Assurez-vous que les binaires sont exécutables (chmod +x)
- Compatible avec App Translocation macOS
