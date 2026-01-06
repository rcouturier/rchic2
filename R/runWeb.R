#' @title Lance l'interface web RCHIC
#'
#' @description Demarre le serveur Plumber et ouvre l'interface web dans le navigateur.
#'
#' @param port Port du serveur (defaut: 8484)
#' @param host Adresse d'ecoute (defaut: "127.0.0.1")
#' @param launch_browser Ouvrir automatiquement le navigateur (defaut: TRUE)
#'
#' @details
#' Cette fonction demarre un serveur web local qui expose l'API RCHIC
#' et sert l'interface utilisateur. L'interface permet de:
#' \itemize{
#'   \item Charger des fichiers CSV
#'   \item Calculer et visualiser le graphe implicatif
#'   \item Calculer et visualiser l'arbre de similarite
#'   \item Calculer et visualiser l'arbre hierarchique
#'   \item Exporter les resultats
#' }
#'
#' @examples
#' \dontrun{
#' # Demarrer le serveur sur le port par defaut
#' runRchicWeb()
#'
#' # Demarrer sur un port specifique
#' runRchicWeb(port = 9000)
#'
#' # Demarrer sans ouvrir le navigateur
#' runRchicWeb(launch_browser = FALSE)
#' }
#'
#' @author Raphael Couturier
#' @export
runRchicWeb <- function(port = 8484, host = "127.0.0.1", launch_browser = TRUE) {

  # Verifier que plumber est installe

if (!requireNamespace("plumber", quietly = TRUE)) {
    stop("Le package 'plumber' est requis. Installez-le avec:\n",
         "  install.packages('plumber')")
  }

  # Trouver les fichiers
  api_path <- system.file("plumber", "api.R", package = "rchic")
  web_path <- system.file("web", package = "rchic")

  # Si pas trouve dans le package, chercher dans le repertoire de dev
  if (api_path == "") {
    dev_api <- file.path(getwd(), "inst", "plumber", "api.R")
    if (file.exists(dev_api)) {
      api_path <- dev_api
    } else {
      stop("Impossible de trouver api.R. Assurez-vous que le package est correctement installe.")
    }
  }

  if (web_path == "" || !dir.exists(web_path)) {
    dev_web <- file.path(getwd(), "inst", "web")
    if (dir.exists(dev_web)) {
      web_path <- dev_web
    } else {
      warning("Dossier web non trouve. Seule l'API sera disponible.")
      web_path <- NULL
    }
  }

  message("=================================================")
  message("        RCHIC Web Server")
  message("=================================================")
  message("")
  message("API:  ", api_path)
  message("Web:  ", ifelse(is.null(web_path), "Non disponible", web_path))
  message("URL:  http://", host, ":", port, "/")
  message("")
  message("Appuyez sur Echap ou Ctrl+C pour arreter")
  message("=================================================")

  # Creer le serveur
  pr <- plumber::plumb(api_path)

  # Monter les fichiers statiques
  if (!is.null(web_path) && dir.exists(web_path)) {
    pr$mount("/", plumber::PlumberStatic$new(web_path))
  }

  # Ouvrir le navigateur
  if (launch_browser) {
    url <- paste0("http://", ifelse(host == "0.0.0.0", "localhost", host), ":", port)
    later::later(function() {
      utils::browseURL(url)
    }, delay = 1)
  }

  # Demarrer le serveur
  pr$run(host = host, port = port, docs = FALSE)
}


#' @title Lance l'API RCHIC (mode headless)
#'
#' @description Demarre uniquement l'API Plumber sans interface web.
#' Utile pour les integrations avec d'autres applications.
#'
#' @param port Port du serveur (defaut: 8484)
#' @param host Adresse d'ecoute (defaut: "0.0.0.0")
#' @param docs Afficher la documentation Swagger (defaut: TRUE)
#'
#' @examples
#' \dontrun{
#' # Demarrer l'API
#' runRchicAPI()
#' }
#'
#' @author Raphael Couturier
#' @export
runRchicAPI <- function(port = 8484, host = "0.0.0.0", docs = TRUE) {

  if (!requireNamespace("plumber", quietly = TRUE)) {
    stop("Le package 'plumber' est requis.")
  }

  api_path <- system.file("plumber", "api.R", package = "rchic")

  if (api_path == "") {
    dev_api <- file.path(getwd(), "inst", "plumber", "api.R")
    if (file.exists(dev_api)) {
      api_path <- dev_api
    } else {
      stop("Impossible de trouver api.R")
    }
  }

  message("RCHIC API Server")
  message("URL: http://", host, ":", port, "/api/")
  if (docs) {
    message("Docs: http://", host, ":", port, "/__docs__/")
  }

  pr <- plumber::plumb(api_path)
  pr$run(host = host, port = port, docs = docs)
}
