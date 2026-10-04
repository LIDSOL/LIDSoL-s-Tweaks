#!/usr/bin/env bash
# build-i18n.sh — Actualiza po/lidsol-widgets.pot, los archivos .po y compila
# las traducciones a locale/<lang>/LC_MESSAGES/lidsol-widgets.mo
#
# Uso:
#   scripts/build-i18n.sh update-pot   # regenera el .pot desde el código
#   scripts/build-i18n.sh update-po    # hace msgmerge de los .po contra el .pot
#   scripts/build-i18n.sh build        # msgfmt .po -> .mo en locale/ (default)
#   scripts/build-i18n.sh all          # update-pot + update-po + build
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_DIR}"

DOMAIN="lidsol-widgets"
POT="po/${DOMAIN}.pot"
POT_TMP="$(mktemp --suffix=.pot)"
SOURCES_TMP="$(mktemp --suffix=.txt)"
POT_JS="$(mktemp --suffix=.pot)"
POT_UI="$(mktemp --suffix=.pot)"

LINGUAS=$(cat po/LINGUAS)

gettext_version() { xgettext --version | head -1; }

update-pot() {
    echo "==> [update-pot] $(gettext_version)"

    find . -type f -name '*.js' \
        -not -path './po/*' \
        -not -path './locale/*' \
        -not -path './node_modules/*' \
        -not -path './.git/*' > "${SOURCES_TMP}"

    # Cadenas JS (esta versión de xgettext soporta --language=JavaScript)
    xgettext --from-code=UTF-8 \
        --keyword=_ --keyword=N_ \
        --language=JavaScript \
        --package-name="${DOMAIN}" \
        --package-version="1.0" \
        --msgid-bugs-address="" \
        -o "${POT_JS}" -f "${SOURCES_TMP}" || true

    # Cadenas de archivos .ui (GtkBuilder, translatable="yes")
    find . -type f -name '*.ui' \
        -not -path './po/*' \
        -not -path './node_modules/*' \
        -not -path './.git/*' > "${SOURCES_TMP}"
    if [ -s "${SOURCES_TMP}" ]; then
        xgettext --from-code=UTF-8 \
            --language=Glade \
            --package-name="${DOMAIN}" \
            --package-version="1.0" \
            --msgid-bugs-address="" \
            -o "${POT_UI}" -f "${SOURCES_TMP}" || true
    else
        : > "${POT_UI}"
    fi

    # Unir ambos .pot en uno solo (msgcat descarta duplicados)
    msgcat --use-first -o "${POT_TMP}" "${POT_JS}" "${POT_UI}"

    sed -i \
        -e 's|^"POT-Creation-Date:.*$|"POT-Creation-Date: '"$(date +'%Y-%m-%d %H:%M%z')"'\\n"|' \
        -e 's|^"Project-Id-Version: .*$|"Project-Id-Version: LIDSoL'"'"'s Tweaks\\n"|' \
        "${POT_TMP}"

    mv "${POT_TMP}" "${POT}"
    rm -f "${POT_JS}" "${POT_UI}" "${SOURCES_TMP}"
    echo "==> [update-pot] OK: ${POT} ($(grep -c '^msgid ' "${POT}" || true) msgid)"
}

update-po() {
    echo "==> [update-po] msgmerge frente a ${POT}"
    for lang in ${LINGUAS}; do
        if [ -f "po/${lang}.po" ]; then
            cp "po/${lang}.po" "po/${lang}.po.bak"
            msgmerge --no-wrap --update "po/${lang}.po" "${POT}"
            rm -f "po/${lang}.po.bak"
            echo "    po/${lang}.po actualizado"
        else
            echo "    (salto) falta po/${lang}.po"
        fi
    done
}

build() {
    echo "==> [build] msgfmt -> locale/"
    for lang in ${LINGUAS}; do
        if [ ! -f "po/${lang}.po" ]; then
            echo "    (salto) falta po/${lang}.po"
            continue
        fi
        DIR="locale/${lang}/LC_MESSAGES"
        mkdir -p "${DIR}"
        msgfmt --check \
            -o "${DIR}/${DOMAIN}.mo" \
            "po/${lang}.po"
        echo "    ${DIR}/${DOMAIN}.mo OK"
    done
}

case "${1:-build}" in
    update-pot) update-pot ;;
    update-po)  update-po ;;
    build)      build ;;
    all)
        update-pot
        update-po
        build
        ;;
    *) echo "Uso: $0 {update-pot|update-po|build|all}" >&2; exit 1 ;;
esac