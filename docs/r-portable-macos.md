# R Portable sur macOS - Architecture Intel & ARM

## Probleme

Le binaire R installe depuis CRAN contient des chemins absolus hardcodes
(`/Library/Frameworks/R.framework/Resources`) dans ses scripts shell (`bin/R`)
et sa configuration de compilation (`etc/Makeconf`). Cela empeche R de
fonctionner lorsqu'il est embarque dans une app Electron a un chemin different.

## Solution

### Patch de `bin/R`

Le script shell `bin/R` determine `R_HOME` de maniere statique. On le remplace
par une detection dynamique basee sur le chemin du script lui-meme :

```sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
R_HOME_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
```

Ce patch doit etre applique dans chaque version d'architecture :
- `R.framework/Versions/4.5-x86_64/Resources/bin/R`
- `R.framework/Versions/4.5-arm64/Resources/bin/R`

### Patch de `etc/Makeconf`

La ligne `LIBR` reference le framework via un chemin absolu. On la remplace par :
```
LIBR = -L"$(R_HOME)/lib" -lR
```

### Symlinks absolus

Les symlinks dans `R.framework` (fontconfig, etc.) pointent vers
`/Library/Frameworks/...` et doivent etre convertis en chemins relatifs.

### Detection d'architecture

`main.js` utilise `process.arch` pour choisir le bon R :
1. Architecture native (arm64 sur Apple Silicon, x86_64 sur Intel)
2. Fallback vers l'autre architecture (via Rosetta)
3. Fallback vers n'importe quelle version disponible

Le wrapper `bin/Rscript` utilise `uname -m` pour la meme logique.

### Invocation de R

Sur macOS, on utilise `bin/R` (script shell) au lieu de `bin/Rscript` (binaire
compile avec des chemins hardcodes non patchables). Les arguments passent par
`--file=script.R --args ...` au lieu de la syntaxe Rscript.

## Regenerer le R portable

Les packages R (plumber, jsonlite, rchic...) et les frameworks ARM64/x86_64
sont des artefacts generes, gitignores. Pour les regenerer localement :

```sh
# Depuis electron/
R_BIN="R-portable-mac/R.framework/Versions/4.5-arm64/Resources/bin/R"
$R_BIN --slave --no-restore -e \
  'install.packages(c("plumber","jsonlite","stringr"), repos="https://cloud.r-project.org")'
$R_BIN CMD INSTALL ../   # installe rchic
```

En CI, le workflow `build-portable-folder.yml` gere tout automatiquement.
