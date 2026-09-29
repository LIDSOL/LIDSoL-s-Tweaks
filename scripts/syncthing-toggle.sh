#!/usr/bin/env bash
# syncthing-toggle.sh  —  Custom toggle helper for LIDSoL's Widgets (Syncthing)
#
# Exercises the configurable fields of a custom toggle:
#   commandOn / commandOff / checkCommand / checkRegex / checkExitCode / commandSync
#
# USAGE:
#   ./syncthing-toggle.sh status         → stdout "running"|"stopped", exit 0|1
#   ./syncthing-toggle.sh on|start       → starts syncthing
#   ./syncthing-toggle.sh off|stop       → stops syncthing
#   ./syncthing-toggle.sh web            → opens the web UI in the browser
#   ./syncthing-toggle.sh monitor        → checks pending errors and notifies
#                                          (notify-send) only when new errors
#                                          appear; stdout "ok" or the errors
#   ./syncthing-toggle.sh fail           → simulates a failure (exit 1, for checkExitCode)

SCRIPT_NAME="$(basename "$0")"
CONFIG_XML="$HOME/.config/syncthing/config.xml"
MONITOR_STATE="$HOME/.cache/syncthing-monitor.last"

usage() {
    echo "Usage: $SCRIPT_NAME {status|on|off|web|monitor|fail}"
    echo ""
    echo "  status     Checks whether syncthing is running"
    echo "             stdout: 'running' (exit 0) | 'stopped' (exit 1)"
    echo "  on | start Starts syncthing (systemd --user, or direct)"
    echo "  off | stop Stops syncthing"
    echo "  web        Opens the web UI (address from config.xml,"
    echo "             defaults to http://127.0.0.1:8384/)"
    echo "  monitor    Checks pending errors (syncthing cli errors show)"
    echo "             and notifies with notify-send when new errors appear"
    echo "  fail       Simulates a failure (exit 1) to test checkExitCode"
    exit 1
}

# Is syncthing active? systemd --user first, pgrep as fallback.
is_running() {
    local state
    state=$(systemctl --user is-active syncthing 2>/dev/null || echo "unknown")
    [[ "$state" == "active" ]] && return 0
    pgrep -x syncthing >/dev/null 2>&1
}

cmd_status() {
    if is_running; then
        echo "running"
        exit 0
    else
        echo "stopped"
        exit 1
    fi
}

cmd_start() {
    if is_running; then
        echo "Syncthing is already running"
        exit 0
    fi
    # Try systemd --user; if unavailable, launch in the background
    if systemctl --user start syncthing 2>/dev/null; then
        echo "Syncthing started (systemd)"
    else
        syncthing &>/dev/null &
        echo "Syncthing started (direct)"
    fi
}

cmd_stop() {
    if ! is_running; then
        echo "Syncthing is not running"
        exit 0
    fi
    if systemctl --user stop syncthing 2>/dev/null; then
        echo "Syncthing stopped (systemd)"
    else
        pkill -x syncthing 2>/dev/null && echo "Syncthing stopped" ||
            echo "Failed to stop syncthing"
    fi
}

cmd_web() {
    # GUI address from the <gui> block of config.xml; official default port.
    local gui_scheme="http"
    local gui_address="127.0.0.1:8384"

    if [[ -f "$CONFIG_XML" ]]; then
        local gui_block addr
        gui_block=$(sed -n '/<gui[ >]/,/<\/gui>/p' "$CONFIG_XML")
        [[ -n "$gui_block" ]] || gui_block=$(sed -n '/<gui/,/<\/gui>/p' "$CONFIG_XML")

        grep -q 'tls="true"' <<<"$gui_block" && gui_scheme="https"

        addr=$(sed -n 's/.*<address>\([^<]*\)<\/address>.*/\1/p' <<<"$gui_block" | head -n 1)
        [[ -n "$addr" ]] && gui_address="$addr"
    fi

    echo "Opening web UI: ${gui_scheme}://${gui_address}/"
    xdg-open "${gui_scheme}://${gui_address}/"
}

cmd_monitor() {
    # Error monitoring. `syncthing cli errors show` returns JSON
    # ({"errors": null} when clean, or a list with "message" keys).
    # Anti-spam: only notifies when the set of errors CHANGES (the last
    # notification is kept in MONITOR_STATE). If syncthing is down it does not
    # notify: `status` already reflects that in the toggle.
    if ! is_running; then
        echo "stopped"
        exit 1
    fi

    local errors_json errors last
    errors_json=$(syncthing cli errors show 2>/dev/null)

    # Readable messages from the pending errors (one per line).
    errors=$(printf '%s\n' "$errors_json" |
        sed -n 's/.*"message" *: *"\(.*\)",/\1/p' |
        sed 's/\\\\"/"/g; s/\\"/"/g; s/\\"/"/g' |
        head -n 3)

    if [[ -z "$errors" ]]; then
        : >"$MONITOR_STATE"
        echo "ok"
        exit 0
    fi

    last=$(cat "$MONITOR_STATE" 2>/dev/null || true)
    if [[ "$errors" != "$last" ]]; then
        notify-send -u normal -i dialog-error \
            "Syncthing: sync error" "$(printf '%s\n' "$errors")"
        printf '%s\n' "$errors" >"$MONITOR_STATE"
    fi
    printf '%s\n' "$errors"
    exit 1
}

CMD="${1:-status}"

case "$CMD" in
    status)     cmd_status ;;
    on|start)   cmd_start ;;
    off|stop)   cmd_stop ;;
    web)        cmd_web ;;
    monitor)    cmd_monitor ;;
    fail)
        echo "simulated failure"
        exit 1
        ;;
    *)
        usage
        ;;
esac