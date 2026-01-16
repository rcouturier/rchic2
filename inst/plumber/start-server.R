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

# Check for bundled R-portable library (standalone mode)
r_home <- Sys.getenv("R_HOME")
if (nzchar(r_home)) {
  portable_lib <- file.path(r_home, "library")
  if (dir.exists(portable_lib)) {
    default_libs <- c(portable_lib, default_libs)
    cat("Using R-portable library:", portable_lib, "\n")
  }
}

.libPaths(unique(default_libs[default_libs != ""]))

cat("R library paths:", paste(.libPaths(), collapse=", "), "\n")
cat("===========================================\n\n")

# ============================================================================
# Auto-install rchic package if not available
# ============================================================================
install_rchic_if_needed <- function(plumber_dir) {
  # Check for marker file to skip verification (faster startup)
  marker_file <- file.path(dirname(plumber_dir), ".rchic_ready")
  if (file.exists(marker_file)) {
    cat("Package 'rchic' already configured (marker found).\n")
    return(invisible(NULL))
  }

  # In portable mode with R-portable, rchic should already be installed
  r_home <- Sys.getenv("R_HOME")
  if (nzchar(r_home)) {
    portable_rchic <- file.path(r_home, "library", "rchic")
    if (dir.exists(portable_rchic)) {
      cat("Package 'rchic' found in R-portable.\n")
      # Create marker for faster startup next time
      tryCatch({
        writeLines("installed", marker_file)
        cat("Created startup marker for faster launches.\n")
      }, error = function(e) {
        # Ignore if we can't write the marker (read-only filesystem)
      })
      return(invisible(NULL))
    }
  }

  if (!requireNamespace("rchic", quietly = TRUE)) {
    cat("Package 'rchic' not found. Installing from bundled binary...\n")

    # Detect platform
    os_type <- Sys.info()["sysname"]
    cat("Detected OS:", os_type, "\n")

    # Find the binaries directory (relative to plumber dir)
    binaries_dir <- file.path(dirname(plumber_dir), "binaries")

    # Determine the correct binary file based on OS
    if (os_type == "Darwin") {
      # macOS
      pkg_file <- file.path(binaries_dir, "mac", "rchic_0.28.tgz")
    } else if (os_type == "Windows") {
      # Windows
      pkg_file <- file.path(binaries_dir, "win", "rchic_0.28.zip")
    } else {
      # Linux
      pkg_file <- file.path(binaries_dir, "linux", "rchic_0.28.tar.gz")
    }

    cat("Looking for binary at:", pkg_file, "\n")

    if (file.exists(pkg_file)) {
      cat("Found rchic binary at:", pkg_file, "\n")

      # Create a writable library path if needed
      user_lib <- Sys.getenv("R_LIBS_USER")
      if (user_lib == "" || !nzchar(user_lib)) {
        # On Windows, HOME may not be set, use USERPROFILE instead
        home_dir <- Sys.getenv("HOME")
        if (home_dir == "" || !nzchar(home_dir)) {
          home_dir <- Sys.getenv("USERPROFILE")
        }
        user_lib <- file.path(home_dir, "R", "library")
      }
      if (!dir.exists(user_lib)) {
        dir.create(user_lib, recursive = TRUE)
        cat("Created user library:", user_lib, "\n")
      }
      .libPaths(c(user_lib, .libPaths()))

      # Determine package type for install
      pkg_type <- if (os_type == "Windows") "win.binary" else if (os_type == "Darwin") "mac.binary" else "source"
      cat("Installing with type:", pkg_type, "\n")

      # Install the package from binary
      tryCatch({
        install.packages(pkg_file, repos = NULL, type = pkg_type, lib = user_lib)
        cat("Successfully installed rchic package!\n")
        # Create marker for faster startup next time
        marker_file <- file.path(dirname(plumber_dir), ".rchic_ready")
        tryCatch({
          writeLines("installed", marker_file)
          cat("Created startup marker for faster launches.\n")
        }, error = function(e) {
          # Ignore if we can't write the marker
        })
      }, error = function(e) {
        cat("Error installing rchic:", e$message, "\n")
        stop("Failed to install rchic package")
      })
    } else {
      cat("ERROR: rchic binary not found at:", pkg_file, "\n")
      cat("Available files in binaries dir:\n")
      if (dir.exists(binaries_dir)) {
        cat(paste(list.files(binaries_dir, recursive = TRUE), collapse = "\n"), "\n")
      } else {
        cat("Binaries directory does not exist:", binaries_dir, "\n")
      }
      stop("Cannot find rchic package binary for this platform")
    }
  } else {
    cat("Package 'rchic' is already installed.\n")
    # Create marker for faster startup next time
    marker_file <- file.path(dirname(plumber_dir), ".rchic_ready")
    tryCatch({
      writeLines("installed", marker_file)
      cat("Created startup marker for faster launches.\n")
    }, error = function(e) {
      # Ignore if we can't write the marker
    })
  }
}

# Install rchic if needed
install_rchic_if_needed(plumber_dir)

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
