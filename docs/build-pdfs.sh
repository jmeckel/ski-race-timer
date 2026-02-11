#!/bin/bash
# Build PDF documentation using Pandoc + Eisvogel template
# Prerequisites: pandoc, xelatex (TinyTeX), eisvogel template
#
# Install (one-time):
#   brew install pandoc
#   curl -sL "https://yihui.org/tinytex/install-bin-unix.sh" | sh
#   # Then install Eisvogel template and LaTeX packages (see README)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Find xelatex - check TinyTeX first, then PATH
XELATEX="${HOME}/Library/TinyTeX/bin/universal-darwin/xelatex"
if [ ! -x "$XELATEX" ]; then
  XELATEX="$(which xelatex 2>/dev/null || true)"
fi

if [ -z "$XELATEX" ]; then
  echo "Error: xelatex not found. Install TinyTeX or MacTeX."
  echo "  curl -sL 'https://yihui.org/tinytex/install-bin-unix.sh' | sh"
  exit 1
fi

if ! command -v pandoc &>/dev/null; then
  echo "Error: pandoc not found. Install with: brew install pandoc"
  exit 1
fi

PANDOC_OPTS=(
  --template eisvogel
  --pdf-engine="$XELATEX"
  --resource-path="$SCRIPT_DIR"
)

build_pdf() {
  local input="$1"
  local output="$2"
  echo "Building $output..."
  pandoc "$input" "${PANDOC_OPTS[@]}" -o "$output"
  echo "  Done ($(du -h "$output" | cut -f1 | xargs))"
}

build_pdf USER_MANUAL.md USER_MANUAL.pdf
build_pdf USER_MANUAL_DE.md USER_MANUAL_DE.pdf
build_pdf USER_MANUAL_FR.md USER_MANUAL_FR.pdf
build_pdf QUICK_START.md QUICK_START.pdf
build_pdf QUICK_START_DE.md QUICK_START_DE.pdf
build_pdf QUICK_START_FR.md QUICK_START_FR.pdf

echo ""
echo "All PDFs built successfully:"
ls -lh "$SCRIPT_DIR"/*.pdf
