#!/bin/bash
# Script pour preparer R portable pour macOS
# A executer sur un Mac

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$ELECTRON_DIR/R-portable-mac"
R_VERSION="4.4.2"

echo "=== Preparation de R Portable pour macOS ==="
echo "Dossier de sortie: $OUTPUT_DIR"

# Detecter l'architecture
ARCH=$(uname -m)
echo "Architecture detectee: $ARCH"

# Nettoyer et creer le dossier
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Verifier si R est installe
if ! command -v R &> /dev/null; then
    echo ""
    echo "R n'est pas installe. Installation via Homebrew..."

    if ! command -v brew &> /dev/null; then
        echo "ERREUR: Homebrew n'est pas installe."
        echo "Installez Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        echo "Ou installez R depuis: https://cran.r-project.org/bin/macosx/"
        exit 1
    fi

    brew install r
fi

# Trouver R.framework
R_FRAMEWORK=""
if [ -d "/Library/Frameworks/R.framework" ]; then
    R_FRAMEWORK="/Library/Frameworks/R.framework"
elif [ -d "/opt/homebrew/Cellar/r" ]; then
    # Homebrew sur Apple Silicon
    R_FRAMEWORK=$(find /opt/homebrew/Cellar/r -name "R.framework" -type d | head -1)
elif [ -d "/usr/local/Cellar/r" ]; then
    # Homebrew sur Intel
    R_FRAMEWORK=$(find /usr/local/Cellar/r -name "R.framework" -type d | head -1)
fi

if [ -z "$R_FRAMEWORK" ] || [ ! -d "$R_FRAMEWORK" ]; then
    echo "ERREUR: R.framework non trouve!"
    echo "Installez R depuis: https://cran.r-project.org/bin/macosx/"
    exit 1
fi

echo "R.framework trouve: $R_FRAMEWORK"

# Copier R.framework
echo "Copie de R.framework (cela peut prendre quelques minutes)..."
cp -R "$R_FRAMEWORK" "$OUTPUT_DIR/"

# Creer structure pour Rscript
mkdir -p "$OUTPUT_DIR/bin"

# Creer un wrapper pour Rscript
cat > "$OUTPUT_DIR/bin/Rscript" << 'EOF'
#!/bin/bash
# Resolve the actual directory of this script (handles symlinks)
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

# Set R_HOME relative to this script
R_HOME="$SCRIPT_DIR/../R.framework/Resources"
export R_HOME

# Also set DYLD_LIBRARY_PATH for dynamic libraries
export DYLD_LIBRARY_PATH="$R_HOME/lib:$DYLD_LIBRARY_PATH"

# Debug info (comment out for production)
# echo "R_HOME: $R_HOME" >&2
# echo "Rscript: $R_HOME/bin/Rscript" >&2

exec "$R_HOME/bin/Rscript" "$@"
EOF
chmod +x "$OUTPUT_DIR/bin/Rscript"

# Creer un wrapper pour R
cat > "$OUTPUT_DIR/bin/R" << 'EOF'
#!/bin/bash
# Resolve the actual directory of this script (handles symlinks)
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

# Set R_HOME relative to this script
R_HOME="$SCRIPT_DIR/../R.framework/Resources"
export R_HOME

# Also set DYLD_LIBRARY_PATH for dynamic libraries
export DYLD_LIBRARY_PATH="$R_HOME/lib:$DYLD_LIBRARY_PATH"

exec "$R_HOME/bin/R" "$@"
EOF
chmod +x "$OUTPUT_DIR/bin/R"

# Installer les packages necessaires
echo ""
echo "Installation des packages R..."
LIB_PATH="$OUTPUT_DIR/R.framework/Resources/library"

"$OUTPUT_DIR/bin/Rscript" -e "
options(repos = c(CRAN = 'https://cloud.r-project.org'))
lib_path <- '$LIB_PATH'

# Liste des packages necessaires (plumber et toutes ses dependances)
packages <- c(
    'plumber', 'jsonlite', 'promises', 'future', 'later',
    'httpuv', 'webutils', 'swagger', 'magrittr', 'crayon',
    'ellipsis', 'lifecycle', 'rlang', 'R6', 'stringi',
    'sodium', 'otel', 'digest', 'globals', 'listenv', 'parallelly'
)

# Installer les packages manquants
for (pkg in packages) {
    if (!requireNamespace(pkg, quietly = TRUE)) {
        cat('Installation de', pkg, '...\n')
        install.packages(pkg, lib = lib_path, dependencies = TRUE)
    }
}
cat('Packages installes avec succes!\n')
"

# Installer le package rchic depuis le binaire
RCHIC_BINARY="$ELECTRON_DIR/binaries/mac/rchic_0.28.tgz"
if [ -f "$RCHIC_BINARY" ]; then
    echo ""
    echo "Installation du package rchic..."
    "$OUTPUT_DIR/bin/Rscript" -e "install.packages('$RCHIC_BINARY', repos = NULL, type = 'source', lib = '$LIB_PATH')"
    echo "Package rchic installe!"
else
    echo ""
    echo "ATTENTION: Binaire rchic non trouve: $RCHIC_BINARY"
    echo "Copiez rchic_0.28.tgz dans $ELECTRON_DIR/binaries/mac/"
fi

# Verifier l'installation
echo ""
echo "Verification de l'installation..."
"$OUTPUT_DIR/bin/Rscript" -e "
library(plumber)
cat('plumber OK\n')
library(rchic)
cat('rchic OK\n')
cat('Tous les packages sont installes correctement!\n')
"

# Afficher la taille
echo ""
echo "=== R Portable pour macOS pret ==="
echo "Dossier: $OUTPUT_DIR"
du -sh "$OUTPUT_DIR"
echo ""
echo "Prochaines etapes:"
echo "1. Executez le build: cd $ELECTRON_DIR && npm run build:mac-standalone"
