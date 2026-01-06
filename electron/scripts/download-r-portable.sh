#!/bin/bash
# Script to download R portable for each platform

R_VERSION="4.3.2"
ELECTRON_DIR="$(dirname "$0")/.."

mkdir -p "$ELECTRON_DIR/R-portable"

echo "==================================="
echo "  R Portable Downloader for RCHIC"
echo "==================================="
echo ""

download_windows() {
    echo "Downloading R for Windows..."
    mkdir -p "$ELECTRON_DIR/R-portable/win32"

    # Download R portable for Windows
    curl -L "https://cran.r-project.org/bin/windows/base/R-${R_VERSION}-win.exe" -o /tmp/R-win.exe

    # Extract using 7z or innoextract
    if command -v 7z &> /dev/null; then
        7z x /tmp/R-win.exe -o"$ELECTRON_DIR/R-portable/win32" -y
    else
        echo "Please install 7z to extract Windows R"
        echo "Or download manually from: https://cran.r-project.org/bin/windows/base/"
    fi
}

download_mac() {
    echo "Downloading R for macOS..."
    mkdir -p "$ELECTRON_DIR/R-portable/darwin"

    # For macOS, we need to extract from the pkg
    curl -L "https://cran.r-project.org/bin/macosx/big-sur-arm64/base/R-${R_VERSION}-arm64.pkg" -o /tmp/R-mac.pkg

    echo "macOS R package downloaded to /tmp/R-mac.pkg"
    echo "Manual extraction required - copy R.framework to R-portable/darwin/"
}

download_linux() {
    echo "Setting up R for Linux..."
    mkdir -p "$ELECTRON_DIR/R-portable/linux"

    # For Linux, we can use the system R or AppImage
    echo "For Linux distribution, you have two options:"
    echo ""
    echo "1. Use system R (users must have R installed)"
    echo "2. Bundle R AppImage from: https://github.com/r-hub/R-portable"
    echo ""
    echo "Recommended: Create an AppImage that includes R"
}

install_r_packages() {
    echo ""
    echo "Installing required R packages..."

    R_LIBS_DIR="$ELECTRON_DIR/R-libs"
    mkdir -p "$R_LIBS_DIR"

    Rscript -e "
        .libPaths(c('$R_LIBS_DIR', .libPaths()))
        install.packages(c('plumber', 'jsonlite', 'stringr', 'Rcpp'),
                        lib='$R_LIBS_DIR',
                        repos='https://cran.r-project.org')
    "
}

# Main
case "$1" in
    windows)
        download_windows
        ;;
    mac)
        download_mac
        ;;
    linux)
        download_linux
        ;;
    packages)
        install_r_packages
        ;;
    all)
        download_windows
        download_mac
        download_linux
        install_r_packages
        ;;
    *)
        echo "Usage: $0 {windows|mac|linux|packages|all}"
        echo ""
        echo "Commands:"
        echo "  windows   - Download R portable for Windows"
        echo "  mac       - Download R for macOS"
        echo "  linux     - Setup instructions for Linux"
        echo "  packages  - Install required R packages"
        echo "  all       - Download all and install packages"
        exit 1
        ;;
esac

echo ""
echo "Done!"
