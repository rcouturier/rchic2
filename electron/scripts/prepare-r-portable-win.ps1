# Script PowerShell pour preparer R portable pour Windows
# A executer sur une machine Windows

$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUTPUT_DIR = Join-Path $SCRIPT_DIR "..\R-portable-win"
$TEMP_DIR = Join-Path $env:TEMP "r-portable-setup"

Write-Host "=== Preparation de R Portable pour Windows ===" -ForegroundColor Green
Write-Host "Dossier de sortie: $OUTPUT_DIR"

# Creer les dossiers
if (Test-Path $OUTPUT_DIR) {
    Write-Host "Suppression de l'ancien dossier R-portable-win..."
    Remove-Item -Recurse -Force $OUTPUT_DIR
}
New-Item -ItemType Directory -Path $OUTPUT_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $TEMP_DIR -Force | Out-Null

# Methode 1: Copier R depuis l'installation existante
$existingR = "C:\Program Files\R"
$rVersions = @()
if (Test-Path $existingR) {
    $rVersions = Get-ChildItem $existingR -Directory | Where-Object { $_.Name -match "^R-\d" } | Sort-Object Name -Descending
}

if ($rVersions.Count -gt 0) {
    $selectedR = $rVersions[0].FullName
    Write-Host "Utilisation de R existant: $selectedR" -ForegroundColor Cyan
    Write-Host "Copie des fichiers R (cela peut prendre quelques minutes)..."
    Copy-Item -Path "$selectedR\*" -Destination $OUTPUT_DIR -Recurse
} else {
    # Methode 2: Telecharger R
    Write-Host "Aucune installation R trouvee. Telechargement..."
    $R_VERSION = "4.5.1"
    $R_URL = "https://cran.r-project.org/bin/windows/base/R-$R_VERSION-win.exe"

    $installerPath = Join-Path $TEMP_DIR "R-$R_VERSION-win.exe"

    Write-Host "Telechargement de R $R_VERSION depuis $R_URL..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($R_URL, $installerPath)
    } catch {
        Write-Host "ERREUR: Impossible de telecharger R." -ForegroundColor Red
        Write-Host "Telechargez manuellement R depuis: https://cran.r-project.org/bin/windows/base/" -ForegroundColor Yellow
        Write-Host "Puis installez-le et relancez ce script." -ForegroundColor Yellow
        exit 1
    }

    # Extraire R
    $extractDir = Join-Path $TEMP_DIR "R-extracted"
    Write-Host "Extraction de R..."
    Start-Process -FilePath $installerPath -ArgumentList "/VERYSILENT", "/DIR=$extractDir", "/NOICONS" -Wait

    Write-Host "Copie des fichiers R..."
    Copy-Item -Path "$extractDir\*" -Destination $OUTPUT_DIR -Recurse
}

# Installer les packages necessaires
Write-Host "Installation des packages R..." -ForegroundColor Cyan
$rscript = Join-Path $OUTPUT_DIR "bin\Rscript.exe"

# Verifier aussi dans bin\x64
if (!(Test-Path $rscript)) {
    $rscript = Join-Path $OUTPUT_DIR "bin\x64\Rscript.exe"
}

if (!(Test-Path $rscript)) {
    Write-Host "ERREUR: Rscript.exe non trouve!" -ForegroundColor Red
    exit 1
}

Write-Host "Utilisation de Rscript: $rscript"

# Creer un dossier library dans R-portable
$libPath = Join-Path $OUTPUT_DIR "library"

# Script R pour installer les packages (meme liste que macOS)
$installScript = @"
options(repos = c(CRAN = 'https://cloud.r-project.org'))
pkgs <- c('plumber', 'jsonlite', 'promises', 'future', 'later',
          'httpuv', 'webutils', 'swagger', 'magrittr', 'crayon',
          'ellipsis', 'lifecycle', 'rlang', 'R6', 'stringi',
          'digest', 'globals', 'listenv', 'parallelly', 'Rcpp')
install.packages(pkgs, lib = '$($libPath -replace '\\', '/')')
"@

$installScriptPath = Join-Path $TEMP_DIR "install_packages.R"
# Use ASCII encoding to avoid BOM issues with R
$installScript | Out-File -FilePath $installScriptPath -Encoding ASCII

& $rscript $installScriptPath

# Copier le package rchic pre-compile
$rchicBinary = Join-Path $SCRIPT_DIR "..\binaries\win\rchic_0.28.zip"
Write-Host "Recherche de rchic a: $rchicBinary"

if (Test-Path $rchicBinary) {
    Write-Host "Installation du package rchic..." -ForegroundColor Cyan
    $installRchicScript = @"
install.packages('$($rchicBinary -replace '\\', '/')', repos = NULL, type = 'win.binary', lib = '$($libPath -replace '\\', '/')')
"@
    $installRchicScriptPath = Join-Path $TEMP_DIR "install_rchic.R"
    # Use ASCII encoding to avoid BOM issues with R
    $installRchicScript | Out-File -FilePath $installRchicScriptPath -Encoding ASCII
    & $rscript $installRchicScriptPath

    # Verifier l'installation
    $rchicInstalled = Join-Path $libPath "rchic"
    if (Test-Path $rchicInstalled) {
        Write-Host "Package rchic installe avec succes!" -ForegroundColor Green
    } else {
        Write-Host "ERREUR: Installation de rchic echouee!" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Host "ERREUR: Package rchic non trouve!" -ForegroundColor Red
    Write-Host "Le fichier doit etre a: $rchicBinary" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Assurez-vous que le dossier 'binaries/win/' contient 'rchic_0.28.zip'" -ForegroundColor Yellow
    Write-Host "Ce fichier doit etre copie depuis la machine Linux." -ForegroundColor Yellow
    exit 1
}

# Nettoyer
Write-Host "Nettoyage..."
Remove-Item -Recurse -Force $TEMP_DIR -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== R Portable pret ===" -ForegroundColor Green
Write-Host "Dossier: $OUTPUT_DIR"
Write-Host ""
Write-Host "Prochaines etapes:"
Write-Host "1. Copiez le dossier R-portable-win vers votre machine Linux"
Write-Host "2. Executez le build: npm run build:win-standalone"
