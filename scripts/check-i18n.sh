#!/usr/bin/env bash
# check-i18n.sh — Guard de mantenimiento i18n de LIDSoL's Tweaks
#
# Uso:
#   scripts/check-i18n.sh          # todos los checks (exit 0 = limpio / 1 = hay problemas)
#   scripts/check-i18n.sh listas   # solo lista fuzzy/untranslated, sin fallar
#
# Loop de mantenimiento (cuando editas cadenas visibles en el código):
#   1) envuelve la cadena en _('...')        # msgid en inglés y ESTABLE
#   2) bash scripts/build-i18n.sh all        # regenera pot -> po -> mo
#   3) bash scripts/check-i18n.sh            # este guard
#   4) traduce lo nuevo en po/es.po y po/ja.po  # en.po se regenera solo (msgstr=msgid)
#   5) bash scripts/install.sh               # o build) para compilar los .mo
#
# Checks:
#   · pot      .pot del repo al día con el código fuente (xgettext -> diff de msgids)
#   · ausentes msgids del .pot que no existen en cada .po (saldrían en inglés sin avisar)
#   · untranslated msgstr vacíos (excepto la cabecera)
#   · fuzzy     #[.,], fuzzy — NO llegan al .mo (traducción invisible)
#   · format    msgfmt --check-format (placeholders %s / markup rotos)
#   · en        po/en.po: todo msgstr == msgid
#   · smoke     GJS con mock de gettext: sin llamadas _() durante la evaluación
#               de módulos prefs (regresión: "gettext can only be called from
#               extensions" — ver scripts/tests/i18n-eager-smoke.mjs)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_DIR}"

DOMAIN="lidsol-widgets"
POT="po/${DOMAIN}.pot"

[ -f po/LINGUAS ] || { echo "ERROR: falta po/LINGUAS (¿estás en la raíz del repo?)" >&2; exit 2; }
LINGUAS=$(cat po/LINGUAS)

fail=0
note_fail() { echo "  [FAIL] $1"; fail=1; }

# msgid (primera línea de cada bloque, sin cabecera) de un .pot/.po
msgid_lines() {
    grep '^msgid ' "$1" | sed 's/^msgid //' | grep -v '^""$' | sort -u
}

# msgid COMPLETOS (une líneas multilínea, sin cabecera) desde la salida de msgattrib
msgattrib_msgids() {
    awk '
        /^msgid / {
            if (have && id != "\"\"") print id
            have = 1
            id = substr($0, 7)
            next
        }
        /^msgstr / {
            if (have) { if (id != "\"\"") print id; have = 0; id = "" }
            next
        }
        /^"/ { if (have) id = id $0 }
        END { if (have && id != "\"\"") print id }
    ' "$1"
}

check_pot() {
    echo "==> [pot] .pot al día con el código fuente"
    [ -f "${POT}" ] || { note_fail "falta ${POT} (bash scripts/build-i18n.sh update-pot)"; return; }

    local tmp js ui src a b
    tmp="$(mktemp --suffix=.pot)"
    js="$(mktemp --suffix=.pot)"
    ui="$(mktemp --suffix=.pot)"
    src="$(mktemp --suffix=.txt)"
    a="$(mktemp)"; b="$(mktemp)"

    find . -type f -name '*.js' \
        -not -path './po/*' -not -path './locale/*' \
        -not -path './node_modules/*' -not -path './.git/*' > "${src}"
    xgettext --from-code=UTF-8 --keyword=_ --keyword=N_ --language=JavaScript \
        --package-name="${DOMAIN}" --package-version="1.0" \
        -o "${js}" -f "${src}" 2>/dev/null || true

    : > "${src}"
    find . -type f -name '*.ui' \
        -not -path './po/*' -not -path './node_modules/*' -not -path './.git/*' > "${src}"
    if [ -s "${src}" ]; then
        xgettext --from-code=UTF-8 --language=Glade \
            --package-name="${DOMAIN}" --package-version="1.0" \
            -o "${ui}" -f "${src}" 2>/dev/null || true
    else
        : > "${ui}"
    fi

    msgcat --use-first -o "${tmp}" "${js}" "${ui}"

    msgid_lines "${tmp}" > "${a}"
    msgid_lines "${POT}" > "${b}"

    if ! diff -q "${a}" "${b}" >/dev/null; then
        note_fail "el .pot del repo está desincronizado con el código:"
        echo "    msgids en el código pero no en ${POT}:"
        comm -23 "${a}" "${b}" | sed 's/^/      /'
        echo "    msgids en ${POT} pero no en el código:"
        comm -13 "${a}" "${b}" | sed 's/^/      /'
        echo "    -> bash scripts/build-i18n.sh update-pot"
    else
        echo "    OK ($(wc -l < "${b}") msgids)"
    fi

    rm -f "${tmp}" "${js}" "${ui}" "${src}" "${a}" "${b}"
}

check_lang() {
    local lang="$1" po="po/$1.po"
    echo "==> [${lang}] po/${lang}.po"

    # msgids del .pot ausentes del .po -> saldrán en inglés sin aparecer como pendientes
    if [ -f "${POT}" ]; then
        local a b miss
        a="$(mktemp)"; b="$(mktemp)"
        msgid_lines "${POT}" > "${a}"
        msgid_lines "${po}" > "${b}"
        miss="$(comm -23 "${a}" "${b}" || true)"
        if [ -n "${miss}" ]; then
            note_fail "${lang}: $(printf '%s\n' "${miss}" | sed '/^$/d' | wc -l) msgid del .pot ausentes del .po"
            printf '%s\n' "${miss}" | sed '/^$/d' | sed 's/^/      /'
            echo "    -> bash scripts/build-i18n.sh update-po"
        fi
        rm -f "${a}" "${b}"
    fi

    # untranslated (msgstr vacío, sin cabecera)
    local u
    u="$(msgattrib --no-wrap --untranslated "${po}" 2>/dev/null | msgattrib_msgids - || true)"
    if [ -n "${u}" ]; then
        note_fail "${lang}: $(printf '%s\n' "${u}" | wc -l) msgid sin traducir (traduce o quedan en inglés)"
        printf '%s\n' "${u}" | sed 's/^/      /'
    fi

    # fuzzy (no llegan al .mo)
    local fz
    fz="$(msgattrib --no-wrap --only-fuzzy "${po}" 2>/dev/null | msgattrib_msgids - || true)"
    if [ -n "${fz}" ]; then
        note_fail "${lang}: $(printf '%s\n' "${fz}" | wc -l) msgid marcados #, fuzzy (NO llegan al .mo)"
        printf '%s\n' "${fz}" | sed 's/^/      /'
        echo "    -> desmarca/retraduce (msgmerge los marca al reordenar/renombrar msgids)"
    fi

    # format/placeholders en msgstr
    if ! msgfmt --check --check-format -o /dev/null "${po}" 2>/dev/null; then
        note_fail "${lang}: msgfmt --check-format falló (placeholders %s / markup inválidos)"
    fi
}

check_en() {
    echo "==> [en] po/en.po msgstr == msgid"
    local pyout pyrc
    pyout="$(python3 - <<'PY'
import ast
import sys

def load(path):
    msgs = []
    cur = None
    for raw in open(path, encoding='utf-8'):
        line = raw.rstrip('\n')
        if line.startswith('msgid '):
            if cur is not None:
                msgs.append(cur)
            cur = {'id': [line[6:].strip()], 'str': None}
        elif line.startswith('msgstr '):
            cur['str'] = [line[7:].strip()]
        elif line.startswith('"') and cur is not None:
            if cur['str'] is None:
                cur['id'].append(line.strip())
            else:
                cur['str'].append(line.strip())
    if cur is not None:
        msgs.append(cur)
    return msgs

def value(frags):
    # Cada fragmento es un literal C válido; unescape por separado y une.
    out = []
    for f in frags:
        try:
            out.append(ast.literal_eval(f))
        except Exception:
            out.append(f)
    return ''.join(out)

bad = []
for m in load('po/en.po'):
    vid = value(m['id'])
    if vid == '':
        continue  # cabecera del .po
    if value(m['str']) != vid:
        bad.append(''.join(m['id']))
for b in bad:
    print(b)
sys.exit(1 if bad else 0)
PY
)"
    pyrc=$?
    if [ "${pyrc}" -ne 0 ]; then
        note_fail "en.po: $(printf '%s\n' "${pyout}" | sed '/^$/d' | wc -l) msgid con msgstr != msgid"
        printf '%s\n' "${pyout}" | sed '/^$/d' | sed 's/^/      /'
        echo "    -> regenerar en.po (msgstr=msgid)"
    else
        echo "    OK ($(grep -c '^msgid ' po/en.po) msgids)"
    fi
}

SMOKE_SED_FROM="'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'"
SMOKE_PREFS_MODULES="topBarOrganizer quickSettingsTweaks workspaceIndicator workspace userAvatar"

check_smoke() {
    echo "==> [smoke] GJS: sin _() eager en módulos prefs (mock-import)"
    if ! command -v gjs >/dev/null 2>&1; then
        echo "    [WARN] gjs no encontrado; se omite el smoke. Instálalo para activar este check."
        return
    fi
    if [ ! -f scripts/tests/i18n-mock-prefs.mjs ] || [ ! -f scripts/tests/i18n-eager-smoke.mjs ]; then
        note_fail "faltan scripts/tests/i18n-{mock-prefs,eager-smoke}.mjs"
        return
    fi

    local tmp
    tmp="$(mktemp -d)"

    # Copia el árbol prefs (los módulos que importan gettext del shell)
    cp prefs.js "${tmp}/"
    mkdir -p "${tmp}/extension/utils"
    cp extension/utils/prefsHelpers.js "${tmp}/extension/utils/"
    for m in ${SMOKE_PREFS_MODULES}; do
        mkdir -p "${tmp}/extension/modules/${m}"
        cp "extension/modules/${m}/prefsSettings.js" "${tmp}/extension/modules/${m}/"
    done

    # Mock y driver en la raíz tmp (comparten instancia de gettext)
    cp scripts/tests/i18n-mock-prefs.mjs   "${tmp}/mock-prefs.js"
    cp scripts/tests/i18n-eager-smoke.mjs  "${tmp}/i18n-eager-smoke.mjs"

    # Redirige el import del gettext del shell hacia el mock
    sed -i "s|${SMOKE_SED_FROM}|'./mock-prefs.js'|" "${tmp}/prefs.js"
    sed -i "s|${SMOKE_SED_FROM}|'../../mock-prefs.js'|" "${tmp}/extension/utils/prefsHelpers.js"
    for m in ${SMOKE_PREFS_MODULES}; do
        sed -i "s|${SMOKE_SED_FROM}|'../../../mock-prefs.js'|" "${tmp}/extension/modules/${m}/prefsSettings.js"
    done

    # Exports temporales (solo en la copia tmp) para verificar mapas internos
    printf '\nexport { TOP_BAR_ITEM_NAMES, BOX_NAMES };\n' >> "${tmp}/extension/modules/topBarOrganizer/prefsSettings.js"
    printf '\nexport { SYSTEM_NAMES, SYSTEM_ITEM_NAMES };\n' >> "${tmp}/extension/modules/quickSettingsTweaks/prefsSettings.js"

    if ! (cd "${tmp}" && gjs -m i18n-eager-smoke.mjs); then
        note_fail "smoke GJS: se llamó a _() durante la evaluación de módulos prefs (ver mensaje arriba)"
    fi
    rm -rf "${tmp}"
}

main() {
    case "${1:-all}" in
        all|"")
            check_pot
            for l in ${LINGUAS}; do check_lang "${l}"; done
            check_en
            check_smoke
            ;;
        listas)
            for l in ${LINGUAS}; do
                echo "== [${l}] fuzzy:"
                msgattrib --no-wrap --only-fuzzy "po/${l}.po" 2>/dev/null | msgattrib_msgids - | sed 's/^/   /' || true
                echo "== [${l}] untranslated:"
                msgattrib --no-wrap --untranslated "po/${l}.po" 2>/dev/null | msgattrib_msgids - | sed 's/^/   /' || true
            done
            ;;
        *) echo "Uso: $0 {all|listas}" >&2; exit 2 ;;
    esac

    echo
    if [ "${fail}" = "1" ]; then
        echo "RESULTADO: hay problemas pendientes (revisa arriba y sigue el loop de mantenimiento)."
        exit 1
    fi
    echo "RESULTADO: todo limpio."
    exit 0
}

main "$@"