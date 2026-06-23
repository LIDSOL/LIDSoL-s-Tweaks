#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UUID="lidsol-widgets@lidsol"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "==> Compilando schemas…"
glib-compile-schemas "${REPO_DIR}/schemas/"

echo "==> Instalando extensión en ${EXT_DIR}…"
mkdir -p "${HOME}/.local/share/gnome-shell/extensions"
if [ -L "${EXT_DIR}" ] || [ -e "${EXT_DIR}" ]; then
    rm -rf "${EXT_DIR}"
fi
ln -sfT "${REPO_DIR}" "${EXT_DIR}"

echo "==> Habilitando extensión…"
gnome-extensions enable "${UUID}" 2>/dev/null || true

echo "=== Instalación completada ==="
echo "Cierra sesión y vuelve a ingresar (o reinicia GNOME Shell con Alt+F2, r, Enter en X11)."
echo "Para abrir preferencias: gnome-extensions prefs ${UUID}"
