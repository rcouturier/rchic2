# RCHIC Server Startup Script
# Called by Electron to start the Plumber API

args <- commandArgs(trailingOnly = TRUE)

# Get parameters
port <- if (length(args) >= 1) as.integer(args[1]) else 8484
plumber_dir <- if (length(args) >= 2) args[2] else "."
web_dir <- if (length(args) >= 3) args[3] else "../web"

cat("===========================================\n")
cat("  RCHIC Server\n")
cat("===========================================\n")
cat("Port:", port, "\n")
cat("Plumber dir:", plumber_dir, "\n")
cat("Web dir:", web_dir, "\n")

# Ensure default R library paths are available
default_libs <- c(
  Sys.getenv("R_LIBS_USER"),
  .libPaths(),
  file.path(Sys.getenv("HOME"), "R", paste0("x86_64-pc-linux-gnu-library/", R.version$major, ".", strsplit(R.version$minor, "\\.")[[1]][1])),
  "/usr/local/lib/R/site-library",
  "/usr/lib/R/site-library",
  "/usr/lib/R/library"
)
.libPaths(unique(default_libs[default_libs != ""]))

cat("R library paths:", paste(.libPaths(), collapse=", "), "\n")
cat("===========================================\n\n")

# Set working directory
setwd(plumber_dir)

# Load required packages
suppressPackageStartupMessages({
  library(plumber)
  library(jsonlite)
})

# Source the API
pr <- plumb("api.R")

# Mount static files for web interface
pr$mount("/", PlumberStatic$new(web_dir))

# Configure CORS
pr$filter("cors", function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type")
  plumber::forward()
})

# Run the server
cat("Starting server on http://127.0.0.1:", port, "/\n", sep = "")
pr$run(host = "127.0.0.1", port = port, quiet = FALSE)
