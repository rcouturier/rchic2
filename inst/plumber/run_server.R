#!/usr/bin/env Rscript

# =============================================================================
# RCHIC Web Server Launcher
# Demarre le serveur Plumber avec l'interface web
# =============================================================================

# Configuration
DEFAULT_PORT <- 8484
DEFAULT_HOST <- "0.0.0.0"

# Parse command line arguments
args <- commandArgs(trailingOnly = TRUE)
port <- if (length(args) >= 1) as.integer(args[1]) else DEFAULT_PORT
host <- if (length(args) >= 2) args[2] else DEFAULT_HOST

# Verifier les dependances
check_packages <- function() {
  required <- c("plumber", "jsonlite", "stringr", "rchic")
  missing <- required[!sapply(required, requireNamespace, quietly = TRUE)]

  if (length(missing) > 0) {
    stop(paste("Packages manquants:", paste(missing, collapse = ", "),
               "\nInstallez-les avec: install.packages(c('",
               paste(missing, collapse = "', '"), "'))"))
  }
}

check_packages()

library(plumber)

# Trouver les chemins des fichiers
find_paths <- function() {
  # Essayer plusieurs emplacements possibles
  possible_api <- c(
    "api.R",
    "inst/plumber/api.R",
    system.file("plumber", "api.R", package = "rchic"),
    file.path(getwd(), "inst/plumber/api.R")
  )

  possible_web <- c(
    "../web",
    "inst/web",
    system.file("web", package = "rchic"),
    file.path(getwd(), "inst/web")
  )

  api_path <- NULL
  for (p in possible_api) {
    if (file.exists(p)) {
      api_path <- normalizePath(p)
      break
    }
  }

  web_path <- NULL
  for (p in possible_web) {
    if (dir.exists(p)) {
      web_path <- normalizePath(p)
      break
    }
  }

  list(api = api_path, web = web_path)
}

paths <- find_paths()

if (is.null(paths$api)) {
  stop("Impossible de trouver api.R")
}

cat("=================================================\n")
cat("        RCHIC Web Server\n")
cat("=================================================\n")
cat("\n")
cat("API:        ", paths$api, "\n")
cat("Web:        ", paths$web, "\n")
cat("Host:       ", host, "\n")
cat("Port:       ", port, "\n")
cat("\n")

# Creer et configurer le serveur Plumber
pr <- plumber::plumb(paths$api)

# Ajouter le service des fichiers statiques si le dossier web existe
if (!is.null(paths$web) && dir.exists(paths$web)) {
  pr$mount("/", plumber::PlumberStatic$new(paths$web))
  cat("Interface web disponible sur: http://localhost:", port, "/\n", sep = "")
} else {
  cat("ATTENTION: Dossier web non trouve, seule l'API est disponible\n")
}

cat("API disponible sur:           http://localhost:", port, "/api/\n", sep = "")
cat("\n")
cat("Endpoints disponibles:\n")
cat("  GET  /api/health       - Verification du serveur\n")
cat("  POST /api/load         - Charger un fichier (filepath)\n")
cat("  POST /api/upload       - Upload d'un fichier CSV\n")
cat("  POST /api/implicative  - Calculer le graphe implicatif\n")
cat("  POST /api/similarity   - Calculer l'arbre de similarite\n")
cat("  POST /api/hierarchy    - Calculer l'arbre hierarchique\n")
cat("  GET  /api/stats        - Statistiques des donnees\n")
cat("  GET  /api/export/rules - Exporter les regles en CSV\n")
cat("\n")
cat("Appuyez sur Ctrl+C pour arreter le serveur\n")
cat("=================================================\n")
cat("\n")

# Demarrer le serveur
pr$run(host = host, port = port, docs = TRUE)
