#!/bin/bash
# Script pour vérifier la structure des binaires R

echo "Vérification de la structure des binaires R..."
echo ""

check_platform() {
  local platform=$1
  local dir="R-portable-$platform"

  echo "=== $platform ==="

  if [ ! -d "$dir" ]; then
    echo "❌ Dossier $dir n'existe pas"
    return 1
  fi

  echo "✓ Dossier $dir existe"

  case $platform in
    mac)
      if [ -f "$dir/bin/Rscript" ]; then
        echo "✓ Wrapper $dir/bin/Rscript trouvé"
        if [ -x "$dir/bin/Rscript" ]; then
          echo "✓ Rscript est exécutable"
        else
          echo "⚠ Rscript n'est pas exécutable (chmod +x nécessaire)"
        fi
      else
        echo "❌ Wrapper $dir/bin/Rscript manquant"
        return 1
      fi

      if [ -d "$dir/R.framework" ]; then
        echo "✓ R.framework trouvé"
      else
        echo "⚠ R.framework manquant (binaires macOS pas encore installés)"
      fi
      ;;

    win)
      if [ -f "$dir/bin/Rscript.exe" ] || [ -f "$dir/bin/x64/Rscript.exe" ]; then
        echo "✓ Rscript.exe trouvé"
      else
        echo "⚠ Rscript.exe manquant (binaires Windows pas encore installés)"
      fi
      ;;

    linux)
      if [ -f "$dir/bin/Rscript" ]; then
        echo "✓ Wrapper $dir/bin/Rscript trouvé"
        if [ -x "$dir/bin/Rscript" ]; then
          echo "✓ Rscript est exécutable"
        else
          echo "⚠ Rscript n'est pas exécutable (chmod +x nécessaire)"
        fi
      else
        echo "❌ Wrapper $dir/bin/Rscript manquant"
        return 1
      fi

      if [ -d "$dir/lib/R" ]; then
        echo "✓ lib/R trouvé"
      else
        echo "⚠ lib/R manquant (binaires Linux pas encore installés)"
      fi
      ;;
  esac

  echo ""
  return 0
}

check_platform "mac"
check_platform "win"
check_platform "linux"

echo "=== Résumé ==="
echo "Consultez BINARIES.md pour les instructions d'installation des binaires R"
