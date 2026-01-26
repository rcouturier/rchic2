# R-portable for Linux

Placez ici les binaires R compilés pour Linux.

## Structure attendue

```
R-portable-linux/
├── bin/
│   └── Rscript (wrapper script - déjà inclus)
└── lib/R/
    └── bin/
        ├── Rscript
        └── R
```

## Notes

- Le wrapper `bin/Rscript` pointe vers `lib/R/bin/Rscript`
- Assurez-vous que les binaires sont exécutables (chmod +x)
