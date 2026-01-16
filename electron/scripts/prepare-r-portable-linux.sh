#!/bin/bash
# Script pour preparer R portable pour Linux
# A executer sur une machine Linux

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$ELECTRON_DIR/R-portable-linux"

echo "=== Preparation de R Portable pour Linux ==="
echo "Dossier de sortie: $OUTPUT_DIR"

# Nettoyer et creer le dossier
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Verifier si R est installe
if ! command -v R &> /dev/null; then
    echo ""
    echo "R n'est pas installe. Installation..."

    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu
        sudo apt-get update
        sudo apt-get install -y r-base r-base-dev libcurl4-openssl-dev libssl-dev libxml2-dev libsodium-dev
    elif command -v dnf &> /dev/null; then
        # Fedora
        sudo dnf install -y R R-devel libcurl-devel openssl-devel libxml2-devel libsodium-devel
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        sudo yum install -y R R-devel libcurl-devel openssl-devel libxml2-devel libsodium-devel
    else
        echo "ERREUR: Gestionnaire de paquets non reconnu."
        echo "Installez R manuellement depuis: https://cran.r-project.org/"
        exit 1
    fi
fi

echo "R trouve: $(which R)"
echo "Version: $(R --version | head -1)"

# Trouver le repertoire R
R_HOME=$(R RHOME)
echo "R_HOME: $R_HOME"

# Copier R
echo "Copie de R (cela peut prendre quelques minutes)..."
cp -R "$R_HOME"/* "$OUTPUT_DIR/"

# Creer structure bin
mkdir -p "$OUTPUT_DIR/bin"

# Copier ou lier les executables
if [ -f "$R_HOME/bin/R" ]; then
    cp "$R_HOME/bin/R" "$OUTPUT_DIR/bin/"
    cp "$R_HOME/bin/Rscript" "$OUTPUT_DIR/bin/"
fi

# Rendre executables
chmod +x "$OUTPUT_DIR/bin/R" 2>/dev/null || true
chmod +x "$OUTPUT_DIR/bin/Rscript" 2>/dev/null || true

# Installer les packages necessaires
echo ""
echo "Installation des packages R..."
LIB_PATH="$OUTPUT_DIR/library"
mkdir -p "$LIB_PATH"

Rscript -e "
options(repos = c(CRAN = 'https://cloud.r-project.org'))
lib_path <- '$LIB_PATH'

# Liste des packages necessaires (plumber et toutes ses dependances)
# Note: otel (OpenTelemetry) removed - not needed and very slow to compile
packages <- c(
    'plumber', 'jsonlite', 'promises', 'future', 'later',
    'httpuv', 'webutils', 'swagger', 'magrittr', 'crayon',
    'ellipsis', 'lifecycle', 'rlang', 'R6', 'stringi',
    'sodium', 'digest', 'globals', 'listenv', 'parallelly',
    'Rcpp'
)

# Installer les packages (only required dependencies, not Suggests)
for (pkg in packages) {
    if (!requireNamespace(pkg, quietly = TRUE, lib.loc = lib_path)) {
        cat('Installation de', pkg, '...\n')
        install.packages(pkg, lib = lib_path, dependencies = c('Depends', 'Imports', 'LinkingTo'))
    }
}
cat('Packages installes avec succes!\n')
"

# Compiler et installer rchic depuis les sources
echo ""
echo "Compilation et installation du package rchic..."
RCHIC_SRC="$ELECTRON_DIR/../"

if [ -f "$RCHIC_SRC/DESCRIPTION" ]; then
    echo "Installation de rchic depuis les sources..."
    R CMD INSTALL --library="$LIB_PATH" "$RCHIC_SRC"
    echo "Package rchic installe!"
else
    # Essayer le binaire mac (source)
    RCHIC_BINARY="$ELECTRON_DIR/binaries/mac/rchic_0.28.tgz"
    if [ -f "$RCHIC_BINARY" ]; then
        echo "Installation de rchic depuis le binaire source..."
        R CMD INSTALL --library="$LIB_PATH" "$RCHIC_BINARY"
        echo "Package rchic installe!"
    else
        echo "ATTENTION: Sources rchic non trouvees!"
        echo "Compilez rchic manuellement."
    fi
fi

# Verifier l'installation
echo ""
echo "Verification de l'installation..."
Rscript -e "
.libPaths(c('$LIB_PATH', .libPaths()))
library(plumber)
cat('plumber OK\n')
library(rchic)
cat('rchic OK\n')
cat('Tous les packages sont installes correctement!\n')
"

# Afficher la taille
echo ""
echo "=== R Portable pour Linux pret ==="
echo "Dossier: $OUTPUT_DIR"
du -sh "$OUTPUT_DIR"
echo ""
echo "Prochaines etapes:"
echo "1. cd $ELECTRON_DIR && npm install"
echo "2. npm run build:linux-standalone"
