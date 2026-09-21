#!/usr/bin/env bash
# syncthing-toggle.sh  —  Test helper para toggles personalizados de LIDSoL's Widgets
#
# Ejercita todos los campos de configuración de un toggle personalizado:
#   commandOn / commandOff / checkCommand / checkRegex / checkExitCode / commandSync
#
# USO:
#   ./syncthing-toggle.sh status   → stdout "running"|"stopped", exit 0|1
#   ./syncthing-toggle.sh on       → inicia syncthing
#   ./syncthing-toggle.sh off      → detiene syncthing
#   ./syncthing-toggle.sh fail     → simula fallo (exit 1, para checkExitCode)

SCRIPT_NAME="$(basename "$0")"

usage() {
    echo "Uso: $SCRIPT_NAME {status|on|off|fail}"
    echo ""
    echo "  status   Verifica si syncthing está activo"
    echo "           stdout: 'running' (exit 0) | 'stopped' (exit 1)"
    echo "  on       Inicia syncthing (systemd --user o directo)"
    echo "  off      Detiene syncthing"
    echo "  fail     Simula un fallo (exit 1) para probar checkExitCode"
    exit 1
}

CMD="${1:-status}"

case "$CMD" in
    status)
        # Estado real: systemd --user primero, pgrep como respaldo
        state=$(systemctl --user is-active syncthing 2>/dev/null || echo "unknown")
        if [[ "$state" == "active" ]] || pgrep -x syncthing >/dev/null 2>&1; then
            echo "running"
            exit 0
        else
            echo "stopped"
            exit 1
        fi
        ;;
    on)
        # Intentar systemd —user; si no está disponible, lanzar en background
        if systemctl --user start syncthing 2>/dev/null; then
            echo "Syncthing iniciado (systemd)"
        else
            syncthing &>/dev/null &
            echo "Syncthing iniciado (directo)"
        fi
        ;;
    off)
        if systemctl --user stop syncthing 2>/dev/null; then
            echo "Syncthing detenido (systemd)"
        else
            pkill -x syncthing 2>/dev/null && echo "Syncthing detenido" || echo "Syncthing no estaba en ejecución"
        fi
        ;;
    fail)
        echo "fallo simulado"
        exit 1
        ;;
    *)
        usage
        ;;
esac
