# =============================================================================
# RCHIC Plumber API
# API REST pour l'Analyse Statistique Implicative
# =============================================================================

library(plumber)
library(jsonlite)

# Charger les fonctions C++ de rchic
library(rchic)

# Variable globale pour stocker les donnees de session
.rchic_env <- new.env(parent = emptyenv())

# Buffer pour les messages de la console
.rchic_env$console_messages <- character(0)

# Langue courante (defaut: francais)
.rchic_env$locale <- "fr"

# Traductions
.rchic_env$translations <- list(
  fr = list(
    implicative_graph = "GRAPHE IMPLICATIF",
    similarity_tree = "ARBRE DE SIMILARITE",
    hierarchy_tree = "ARBRE HIERARCHIQUE",
    date = "Date",
    computing_mode = "Mode de calcul",
    min_threshold = "Seuil minimum",
    complete_graph = "Graphe complet",
    contributions = "Contributions",
    typicalities = "Typicalites",
    yes = "Oui",
    no = "Non",
    selected_variables = "Variables selectionnees",
    total_rules = "Regles totales analysees",
    graph_nodes = "Noeuds dans le graphe",
    graph_edges = "Aretes dans le graphe",
    tree_levels = "Niveaux de l'arbre",
    significant_nodes = "Noeuds significatifs",
    final_nodes = "Noeuds finaux",
    end_calculation = "FIN DU CALCUL",
    error = "ERREUR"
  ),
  en = list(
    implicative_graph = "IMPLICATIVE GRAPH",
    similarity_tree = "SIMILARITY TREE",
    hierarchy_tree = "HIERARCHY TREE",
    date = "Date",
    computing_mode = "Computing mode",
    min_threshold = "Minimum threshold",
    complete_graph = "Complete graph",
    contributions = "Contributions",
    typicalities = "Typicalities",
    yes = "Yes",
    no = "No",
    selected_variables = "Selected variables",
    total_rules = "Total rules analyzed",
    graph_nodes = "Nodes in graph",
    graph_edges = "Edges in graph",
    tree_levels = "Tree levels",
    significant_nodes = "Significant nodes",
    final_nodes = "Final nodes",
    end_calculation = "END OF CALCULATION",
    error = "ERROR"
  ),
  pt = list(
    implicative_graph = "GRAFO IMPLICATIVO",
    similarity_tree = "ARVORE DE SIMILARIDADE",
    hierarchy_tree = "ARVORE HIERARQUICA",
    date = "Data",
    computing_mode = "Modo de calculo",
    min_threshold = "Limiar minimo",
    complete_graph = "Grafo completo",
    contributions = "Contribuicoes",
    typicalities = "Tipicalidades",
    yes = "Sim",
    no = "Nao",
    selected_variables = "Variaveis selecionadas",
    total_rules = "Regras totais analisadas",
    graph_nodes = "Nos no grafo",
    graph_edges = "Arestas no grafo",
    tree_levels = "Niveis da arvore",
    significant_nodes = "Nos significativos",
    final_nodes = "Nos finais",
    end_calculation = "FIM DO CALCULO",
    error = "ERRO"
  )
)

# Fonction de traduction
tr <- function(key) {
  locale <- .rchic_env$locale
  if (is.null(.rchic_env$translations[[locale]])) {
    locale <- "fr"
  }
  result <- .rchic_env$translations[[locale]][[key]]
  if (is.null(result)) {
    return(key)
  }
  return(result)
}

# Fonction pour definir la langue
set_locale <- function(locale) {
  if (locale %in% names(.rchic_env$translations)) {
    .rchic_env$locale <- locale
  }
}

# Fonction pour ajouter un message a la console
rchic_message <- function(...) {
  msg <- paste0(...)
  .rchic_env$console_messages <- c(.rchic_env$console_messages, msg)
  cat(msg, "\n")
}

# Fonction pour effacer les messages
rchic_clear_console <- function() {
  .rchic_env$console_messages <- character(0)
}

# Creer un repertoire de travail temporaire (necessaire pour AppImage)
.rchic_env$workdir <- file.path(tempdir(), "rchic_work")
if (!dir.exists(.rchic_env$workdir)) {
  dir.create(.rchic_env$workdir, recursive = TRUE)
}
setwd(.rchic_env$workdir)
cat("Working directory:", getwd(), "\n")

# =============================================================================
# Filtres et configuration CORS
# =============================================================================

#* @filter cors
function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req$REQUEST_METHOD == "OPTIONS") {
    res$status <- 200
    return(list())
  }

  plumber::forward()
}

# =============================================================================
# Endpoints de base
# =============================================================================

#* Health check
#* @get /api/health
function() {
  list(
    status = "ok",
    version = as.character(packageVersion("rchic")),
    timestamp = Sys.time()
  )
}

#* Recuperer les messages de la console
#* @get /api/console
function() {
  list(
    success = TRUE,
    messages = .rchic_env$console_messages
  )
}

#* Effacer les messages de la console
#* @post /api/console/clear
function() {
  rchic_clear_console()
  list(success = TRUE)
}

#* Definir la langue
#* @param locale:str Code de langue (fr, en, pt)
#* @post /api/locale
function(locale = "fr", req) {
  # Extraire locale du body JSON si present
  if (!is.null(req$body$locale)) {
    locale <- req$body$locale
  }
  set_locale(locale)
  cat("Locale set to:", .rchic_env$locale, "\n")
  list(success = TRUE, locale = .rchic_env$locale)
}

#* Liste des fichiers de donnees disponibles
#* @get /api/files
function() {
  files <- list.files(pattern = "\\.(csv|CSV)$", full.names = TRUE)
  list(files = files)
}

# =============================================================================
# Chargement des donnees
# =============================================================================

#* Charger un fichier de donnees
#* @param filepath:str Chemin vers le fichier CSV
#* @post /api/load
function(filepath, res) {
  tryCatch({
    if (!file.exists(filepath)) {
      res$status <- 404
      return(list(success = FALSE, error = paste("File not found:", filepath)))
    }

    # S'assurer que le repertoire de travail est correct
    if (!is.null(.rchic_env$workdir)) {
      setwd(.rchic_env$workdir)
    }

    # Lire et analyser les donnees
    result <- readAndAnalyzeData(fileName = filepath)
    dataCSV <- result[[1]]
    supplementary_variables <- result[[2]]

    # Preparer les transactions
    data2transac(dataCSV)

    # Appeler l'algorithme apriori
    callAsirules()

    # Stocker les donnees en session
    .rchic_env$dataCSV <- dataCSV
    .rchic_env$supplementary_variables <- supplementary_variables
    .rchic_env$list_variables <- names(dataCSV)[-1]
    .rchic_env$filepath <- filepath

    list(
      success = TRUE,
      filename = basename(filepath),
      variables = .rchic_env$list_variables,
      n_rows = nrow(dataCSV),
      n_variables = length(.rchic_env$list_variables),
      supplementary_variables = supplementary_variables
    )
  }, error = function(e) {
    res$status <- 500
    list(success = FALSE, error = e$message)
  })
}

#* Upload d'un fichier CSV (multipart)
#* @parser octet
#* @parser text
#* @post /api/upload
function(req, res) {
  tryCatch({
    body <- req$body

    if (is.null(body) || length(body) == 0) {
      res$status <- 400
      return(list(success = FALSE, error = "No data received. Send CSV content as request body."))
    }

    temp_file <- tempfile(fileext = ".csv")

    if (is.raw(body)) {
      writeBin(body, temp_file)
    } else if (is.character(body)) {
      writeLines(body, temp_file)
    } else {
      res$status <- 400
      return(list(success = FALSE, error = paste("Unexpected body type:", class(body))))
    }

    # S'assurer que le repertoire de travail est correct
    if (!is.null(.rchic_env$workdir)) {
      setwd(.rchic_env$workdir)
    }

    # Charger les donnees
    result <- readAndAnalyzeData(fileName = temp_file)
    dataCSV <- result[[1]]
    supplementary_variables <- result[[2]]

    data2transac(dataCSV)
    callAsirules()

    .rchic_env$dataCSV <- dataCSV
    .rchic_env$supplementary_variables <- supplementary_variables
    .rchic_env$list_variables <- names(dataCSV)[-1]
    .rchic_env$filepath <- temp_file

    list(
      success = TRUE,
      variables = .rchic_env$list_variables,
      n_rows = nrow(dataCSV),
      n_variables = length(.rchic_env$list_variables)
    )
  }, error = function(e) {
    res$status <- 500
    list(success = FALSE, error = e$message)
  })
}

#* Debug upload - voir la structure
#* @parser multi
#* @post /api/debug-upload
function(req, file = NULL) {
  # Essayer de trouver le raw recursivement
  find_raw <- function(x, depth = 0) {
    if (is.raw(x)) return(list(found = TRUE, depth = depth, len = length(x)))
    if (!is.list(x) || depth > 5) return(list(found = FALSE, depth = depth))
    for (i in seq_along(x)) {
      res <- find_raw(x[[i]], depth + 1)
      if (res$found) return(res)
    }
    return(list(found = FALSE, depth = depth))
  }

  raw_info <- find_raw(file)

  list(
    file_class = class(file),
    file_str = capture.output(str(file, max.level = 3)),
    raw_found = raw_info$found,
    raw_depth = raw_info$depth,
    raw_len = raw_info$len
  )
}

# =============================================================================
# Graphe Implicatif
# =============================================================================

#* Calculer le graphe implicatif
#* @param threshold:dbl Seuil minimum (defaut 85)
#* @param computing_mode:int Mode de calcul (1=classic, 2=confidence, 3=implifiance, 4=entropic)
#* @param complete_graph:bool Graphe complet (defaut FALSE)
#* @param selected_variables Variables selectionnees (optionnel)
#* @post /api/implicative
function(threshold = 85, computing_mode = 1, complete_graph = FALSE, selected_variables = NULL, res) {
  tryCatch({
    if (is.null(.rchic_env$list_variables)) {
      res$status <- 400
      return(list(success = FALSE, error = "No data loaded. Call /api/load first."))
    }

    # Effacer les anciens messages et commencer le log
    rchic_clear_console()
    rchic_message(paste0("=== ", tr("implicative_graph"), " ==="))
    rchic_message(paste0(tr("date"), ": ", Sys.time()))

    mode_names <- c("Classique", "Classique + Confiance", "Implifiance", "Entropique")
    rchic_message(paste0(tr("computing_mode"), ": ", mode_names[computing_mode]))
    rchic_message(paste0(tr("min_threshold"), ": ", threshold))
    rchic_message(paste0(tr("complete_graph"), ": ", ifelse(complete_graph, tr("yes"), tr("no"))))

    # Lire les regles calculees
    rules <- read.table(
      file = 'transaction.out',
      header = TRUE,
      row.names = 1,
      sep = ',',
      stringsAsFactors = FALSE
    )

    row_names <- row.names(rules)
    rules <- as.data.frame(lapply(rules, as.numeric))
    row.names(rules) <- row_names

    # Determiner l'index selon le mode
    index_imp <- switch(as.character(computing_mode),
      "1" = 5,  # classic
      "2" = 5,  # classic + confidence
      "3" = 7,  # implifiance
      "4" = 6,  # entropic
      5
    )

    # Variables selectionnees
    list_variables <- .rchic_env$list_variables
    if (is.null(selected_variables)) {
      selected_variables <- list_variables
    }

    # Filtrer les regles
    nodes <- list()
    edges <- list()
    edge_id <- 1

    n <- nrow(rules)
    for (i in 1:n) {
      rule_parts <- strsplit(row.names(rules)[i], split = ' -> ')[[1]]
      from <- rule_parts[1]
      to <- rule_parts[2]

      imp_value <- rules[i, index_imp]
      confidence <- rules[i, 4]
      occ_from <- rules[i, 1]
      occ_to <- rules[i, 2]
      counter_examples <- rules[i, 3]

      # Appliquer les filtres
      if (imp_value > threshold &&
          from %in% selected_variables &&
          to %in% selected_variables &&
          (complete_graph || occ_from <= occ_to)) {

        # Ajouter les noeuds
        if (!(from %in% names(nodes))) {
          nodes[[from]] <- list(
            id = from,
            label = from,
            occurrences = occ_from
          )
        }
        if (!(to %in% names(nodes))) {
          nodes[[to]] <- list(
            id = to,
            label = to,
            occurrences = occ_to
          )
        }

        # Ajouter l'arete
        edges[[edge_id]] <- list(
          id = paste0("e", edge_id),
          source = from,
          target = to,
          implication = round(imp_value, 2),
          confidence = round(confidence, 4),
          counter_examples = counter_examples
        )
        edge_id <- edge_id + 1
      }
    }

    # Messages de resultats
    rchic_message("")
    rchic_message(paste0(tr("selected_variables"), ": ", length(selected_variables)))
    rchic_message(paste0(tr("total_rules"), ": ", nrow(rules)))
    rchic_message(paste0(tr("graph_nodes"), ": ", length(nodes)))
    rchic_message(paste0(tr("graph_edges"), ": ", length(edges)))
    rchic_message("")
    rchic_message(paste0("=== ", tr("end_calculation"), " ==="))

    list(
      success = TRUE,
      nodes = unname(nodes),
      edges = unname(edges),
      threshold = threshold,
      computing_mode = computing_mode,
      n_nodes = length(nodes),
      n_edges = length(edges)
    )
  }, error = function(e) {
    rchic_message(paste0(tr("error"), ": ", e$message))
    res$status <- 500
    list(success = FALSE, error = e$message)
  })
}

# =============================================================================
# Arbre de Similarite
# =============================================================================

#* Calculer l'arbre de similarite
#* @param selected_variables Variables selectionnees (optionnel)
#* @param contribution_supp:bool Calculer les contributions
#* @param typicality_supp:bool Calculer les typicalites
#* @post /api/similarity
function(selected_variables = NULL, contribution_supp = FALSE, typicality_supp = FALSE, res) {
  tryCatch({
    if (is.null(.rchic_env$list_variables)) {
      res$status <- 400
      return(list(success = FALSE, error = "No data loaded. Call /api/load first."))
    }

    # Effacer les anciens messages et commencer le log
    rchic_clear_console()
    rchic_message(paste0("=== ", tr("similarity_tree"), " ==="))
    rchic_message(paste0(tr("date"), ": ", Sys.time()))
    rchic_message(paste0(tr("contributions"), ": ", ifelse(contribution_supp, tr("yes"), tr("no"))))
    rchic_message(paste0(tr("typicalities"), ": ", ifelse(typicality_supp, tr("yes"), tr("no"))))

    list_variables <- .rchic_env$list_variables
    supplementary_variables <- .rchic_env$supplementary_variables

    # Transformer supplementary_variables en matrice (comme dans le code original)
    if (length(supplementary_variables) == 0 || is.null(supplementary_variables)) {
      contribution_supp <- FALSE
      typicality_supp <- FALSE
      # Creer une matrice vide avec les bonnes dimensions
      supp_matrix <- matrix(numeric(0), nrow = nrow(.rchic_env$dataCSV), ncol = 0)
    } else {
      supp_df <- data.frame(supplementary_variables)
      supp_matrix <- as.matrix(supp_df)
      storage.mode(supp_matrix) <- "numeric"
      row.names(supp_matrix) <- row.names(.rchic_env$dataCSV)
    }

    # Lire les regles
    rules <- read.table(
      file = 'transaction.out',
      header = TRUE,
      row.names = 1,
      sep = ',',
      stringsAsFactors = FALSE
    )
    row_names <- row.names(rules)
    rules <- as.data.frame(lapply(rules, as.numeric))
    row.names(rules) <- row_names

    # Construire la matrice de similarite
    similarity_matrix <- matrix(
      0,
      nrow = length(list_variables),
      ncol = length(list_variables)
    )
    colnames(similarity_matrix) <- list_variables
    rownames(similarity_matrix) <- list_variables

    # Initialiser le vecteur d'occurrences avec des noms
    list_occurrences <- numeric(length(list_variables))
    names(list_occurrences) <- list_variables

    n <- nrow(rules)
    for (i in 1:n) {
      rule_parts <- strsplit(row.names(rules)[i], split = ' -> ')[[1]]
      from <- rule_parts[1]
      to <- rule_parts[2]
      val <- rules[i, 7]  # Similarite
      if (from %in% list_variables && to %in% list_variables) {
        similarity_matrix[from, to] <- val
        list_occurrences[from] <- rules[i, 1]
      }
    }

    similarity_matrix[is.na(similarity_matrix)] <- 0
    similarity_matrix <- similarity_matrix / 100

    # Filtrer par variables selectionnees
    if (!is.null(selected_variables) && length(selected_variables) > 0) {
      selected <- list_variables %in% selected_variables
    } else {
      selected <- rep(TRUE, length(list_variables))
    }

    sub_matrix <- similarity_matrix[selected, selected, drop = FALSE]
    sub_list_occ <- list_occurrences[selected]
    sub_variables <- list_variables[selected]

    # Matrice de valeurs pour les contributions
    matrix_values <- as.matrix(.rchic_env$dataCSV[, -1, drop = FALSE])
    storage.mode(matrix_values) <- "numeric"
    row.names(matrix_values) <- row.names(.rchic_env$dataCSV)

    # Appeler le calcul C++
    result <- callSimilarityComputation(
      sub_matrix,
      as.numeric(sub_list_occ),
      supp_matrix,
      matrix_values,
      contribution_supp,
      typicality_supp,
      FALSE  # verbose
    )

    # Extraire les resultats bruts du C++
    list_indexes_raw <- result[[1]][[1]]  # Ex: "(((1 4) 5) (2 3))"
    list_vars_raw <- result[[1]][[2]]     # Ex: "(((Agile Beau) Attirant) (Agressif Angoissant))"
    variable_left <- result[[2]]          # Ex: c(2, 1, 1, 1)
    variable_right <- result[[3]]         # Ex: c(3, 4, 5, 3)
    nb_levels <- result[[4]]
    significant_nodes <- result[[5]]

    # Parser pour obtenir l'ordre des variables feuilles
    list_vars_clean <- gsub("[()]", "", list_vars_raw)
    list_vars_clean <- strsplit(trimws(list_vars_clean), "\\s+")[[1]]

    # L'ordre des variables utilisé pour le calcul (indices 1 à n)
    # list_variables contient l'ordre original des colonnes
    input_variables <- sub_variables

    # Messages de resultats
    rchic_message("")
    rchic_message(paste0(tr("selected_variables"), ": ", length(input_variables)))
    rchic_message(paste0(tr("tree_levels"), ": ", nb_levels))
    rchic_message(paste0(tr("significant_nodes"), ": ", sum(significant_nodes[1:nb_levels])))
    rchic_message("")
    rchic_message(paste0("=== ", tr("end_calculation"), " ==="))

    list(
      success = TRUE,
      tree_type = "similarity",
      # Données brutes pour le rendu
      input_variables = input_variables,        # Variables dans l'ordre d'entrée (indices)
      variables_order = list_vars_clean,        # Ordre des feuilles de gauche à droite
      variable_left = as.integer(variable_left),
      variable_right = as.integer(variable_right),
      nb_levels = nb_levels,
      significant = as.integer(significant_nodes[1:nb_levels]),
      # Format structuré (pour debug)
      raw_indexes = list_indexes_raw,
      raw_variables = list_vars_raw
    )
  }, error = function(e) {
    rchic_message(paste0(tr("error"), ": ", e$message))
    res$status <- 500
    list(success = FALSE, error = e$message)
  })
}

# =============================================================================
# Arbre Hierarchique
# =============================================================================

#* Calculer l'arbre hierarchique
#* @param computing_mode:int Mode de calcul (1=classic, 2=confidence, 3=implifiance)
#* @param selected_variables Variables selectionnees (optionnel)
#* @param contribution_supp:bool Calculer les contributions
#* @param typicality_supp:bool Calculer les typicalites
#* @post /api/hierarchy
function(computing_mode = 1, selected_variables = NULL, contribution_supp = FALSE, typicality_supp = FALSE, res) {
  tryCatch({
    if (is.null(.rchic_env$list_variables)) {
      res$status <- 400
      return(list(success = FALSE, error = "No data loaded. Call /api/load first."))
    }

    # Effacer les anciens messages et commencer le log
    rchic_clear_console()
    rchic_message(paste0("=== ", tr("hierarchy_tree"), " ==="))
    rchic_message(paste0(tr("date"), ": ", Sys.time()))

    mode_names <- c("Classique", "Classique + Confiance", "Implifiance")
    rchic_message(paste0(tr("computing_mode"), ": ", mode_names[computing_mode]))
    rchic_message(paste0(tr("contributions"), ": ", ifelse(contribution_supp, tr("yes"), tr("no"))))
    rchic_message(paste0(tr("typicalities"), ": ", ifelse(typicality_supp, tr("yes"), tr("no"))))

    list_variables <- .rchic_env$list_variables
    supplementary_variables <- .rchic_env$supplementary_variables

    # Transformer supplementary_variables en matrice
    if (length(supplementary_variables) == 0 || is.null(supplementary_variables)) {
      contribution_supp <- FALSE
      typicality_supp <- FALSE
      supp_matrix <- matrix(numeric(0), nrow = nrow(.rchic_env$dataCSV), ncol = 0)
    } else {
      supp_df <- data.frame(supplementary_variables)
      supp_matrix <- as.matrix(supp_df)
      storage.mode(supp_matrix) <- "numeric"
      row.names(supp_matrix) <- row.names(.rchic_env$dataCSV)
    }

    # Lire les regles
    rules <- read.table(
      file = 'transaction.out',
      header = TRUE,
      row.names = 1,
      sep = ',',
      stringsAsFactors = FALSE,
      strip.white = TRUE
    )
    row_names <- row.names(rules)
    rules <- as.data.frame(lapply(rules, as.numeric))
    row.names(rules) <- row_names

    # Determiner l'index selon le mode
    index_imp <- switch(as.character(computing_mode),
      "1" = 5,
      "2" = 5,
      "3" = 6,
      5
    )

    # Construire la matrice de cohesion
    cohesion_matrix <- matrix(
      0,
      nrow = length(list_variables),
      ncol = length(list_variables)
    )
    colnames(cohesion_matrix) <- list_variables
    rownames(cohesion_matrix) <- list_variables

    # Initialiser le vecteur d'occurrences
    list_occurrences <- numeric(length(list_variables))
    names(list_occurrences) <- list_variables

    n <- nrow(rules)
    for (i in 1:n) {
      rule_parts <- strsplit(row.names(rules)[i], split = ' -> ')[[1]]
      from <- rule_parts[1]
      to <- rule_parts[2]
      val <- rules[i, index_imp]
      if (from %in% list_variables && to %in% list_variables) {
        cohesion_matrix[from, to] <- val
        list_occurrences[from] <- rules[i, 1]
      }
    }

    cohesion_matrix[is.na(cohesion_matrix)] <- 0
    cohesion_matrix <- cohesion_matrix / 100
    cohesion_matrix[cohesion_matrix < 0.5] <- 0

    # Appliquer la formule de cohesion
    cohesion_matrix <- sqrt(1 - (-cohesion_matrix * log2(cohesion_matrix) -
                                  (1 - cohesion_matrix) * log2(1 - cohesion_matrix))^2)
    cohesion_matrix[is.na(cohesion_matrix)] <- 0

    # Filtrer par variables selectionnees
    if (!is.null(selected_variables) && length(selected_variables) > 0) {
      selected <- list_variables %in% selected_variables
    } else {
      selected <- rep(TRUE, length(list_variables))
    }

    sub_matrix <- cohesion_matrix[selected, selected, drop = FALSE]
    sub_list_occ <- list_occurrences[selected]

    matrix_values <- as.matrix(.rchic_env$dataCSV[, -1, drop = FALSE])
    storage.mode(matrix_values) <- "numeric"
    row.names(matrix_values) <- row.names(.rchic_env$dataCSV)

    # Appeler le calcul C++
    result <- callHierarchyComputation(
      sub_matrix,
      as.numeric(sub_list_occ),
      supp_matrix,
      matrix_values,
      contribution_supp,
      typicality_supp,
      FALSE
    )

    # Extraire les resultats bruts du C++
    list_indexes_raw <- result[[1]][[1]]
    list_vars_raw <- result[[1]][[2]]
    variable_left <- result[[2]]
    variable_right <- result[[3]]
    nb_levels <- result[[4]]
    significant_nodes <- result[[5]]
    final_nodes <- result[[6]]

    # Parser pour obtenir l'ordre des variables feuilles
    list_vars_clean <- gsub("[()]", "", list_vars_raw)
    list_vars_clean <- strsplit(trimws(list_vars_clean), "\\s+")[[1]]

    # Variables d'entrée
    input_variables <- list_variables[selected]

    # Messages de resultats
    rchic_message("")
    rchic_message(paste0(tr("selected_variables"), ": ", length(input_variables)))
    rchic_message(paste0(tr("tree_levels"), ": ", nb_levels))
    rchic_message(paste0(tr("significant_nodes"), ": ", sum(significant_nodes[1:nb_levels])))
    rchic_message(paste0(tr("final_nodes"), ": ", sum(final_nodes)))
    rchic_message("")
    rchic_message(paste0("=== ", tr("end_calculation"), " ==="))

    list(
      success = TRUE,
      tree_type = "hierarchy",
      computing_mode = computing_mode,
      # Données brutes pour le rendu
      input_variables = input_variables,
      variables_order = list_vars_clean,
      variable_left = as.integer(variable_left),
      variable_right = as.integer(variable_right),
      nb_levels = nb_levels,
      significant = as.integer(significant_nodes[1:nb_levels]),
      final_nodes = as.integer(final_nodes),
      # Format structuré (pour debug)
      raw_indexes = list_indexes_raw,
      raw_variables = list_vars_raw
    )
  }, error = function(e) {
    rchic_message(paste0(tr("error"), ": ", e$message))
    res$status <- 500
    list(success = FALSE, error = e$message)
  })
}

# =============================================================================
# Export des resultats
# =============================================================================

#* Exporter les regles en CSV
#* @get /api/export/rules
#* @serializer contentType list(type="text/csv; charset=UTF-8")
function(res) {
  tryCatch({
    if (!file.exists('transaction.out')) {
      res$status <- 404
      return("error,No rules computed")
    }

    rules <- read.table(
      file = 'transaction.out',
      header = TRUE,
      row.names = 1,
      sep = ','
    )

    # Ajouter les noms des regles comme colonne
    rules$rule <- row.names(rules)
    rules <- rules[, c("rule", names(rules)[names(rules) != "rule"])]

    # Convert to CSV string manually (no readr dependency)
    csv_lines <- capture.output(write.csv(rules, row.names = FALSE))
    paste(csv_lines, collapse = "\n")
  }, error = function(e) {
    res$status <- 500
    paste("error,", e$message)
  })
}

#* Obtenir toutes les regles avec details (format JSON)
#* @get /api/rules
function(res) {
  tryCatch({
    if (!file.exists('transaction.out')) {
      res$status <- 404
      return(list(success = FALSE, error = "No rules computed"))
    }

    rules <- read.table(
      file = 'transaction.out',
      header = TRUE,
      row.names = 1,
      sep = ',',
      stringsAsFactors = FALSE
    )

    # Convertir en data.frame avec noms explicites (plus rapide que lapply)
    rules_df <- data.frame(
      rule = row.names(rules),
      occ_hypothese = as.numeric(rules[, 1]),
      occ_conclusion = as.numeric(rules[, 2]),
      contre_exemples = as.numeric(rules[, 3]),
      confiance = as.numeric(rules[, 4]),
      implication_classique = as.numeric(rules[, 5]),
      implication_entropique = as.numeric(rules[, 6]),
      implifiance = as.numeric(rules[, 7]),
      similarite_classique = as.numeric(rules[, 8]),
      similarite_entropique = as.numeric(rules[, 9]),
      stringsAsFactors = FALSE
    )

    # Convertir en liste de listes pour JSON
    rules_list <- lapply(split(rules_df, seq(nrow(rules_df))), function(x) as.list(x))
    names(rules_list) <- NULL

    list(
      success = TRUE,
      n_rules = nrow(rules),
      rules = rules_list
    )
  }, error = function(e) {
    res$status <- 500
    list(success = FALSE, error = e$message)
  })
}

#* Obtenir les statistiques des donnees
#* @get /api/stats
function(res) {
  tryCatch({
    if (is.null(.rchic_env$dataCSV)) {
      res$status <- 400
      return(list(success = FALSE, error = "No data loaded"))
    }

    data <- .rchic_env$dataCSV

    # Statistiques par variable
    var_stats <- lapply(names(data)[-1], function(var) {
      col <- data[[var]]
      list(
        variable = var,
        n_values = length(unique(col)),
        n_non_zero = sum(col != 0),
        proportion = round(sum(col != 0) / length(col), 3)
      )
    })

    list(
      success = TRUE,
      n_observations = nrow(data),
      n_variables = ncol(data) - 1,
      variables = var_stats
    )
  }, error = function(e) {
    res$status <- 500
    list(success = FALSE, error = e$message)
  })
}
