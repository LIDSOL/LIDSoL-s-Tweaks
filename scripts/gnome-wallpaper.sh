#!/bin/bash

# Script to change the GNOME wallpaper
# Usage: ./wallpaper.sh [--log FILE] [--exit N] [DIRECTORY] [MODE] [ORDER]
#   --log : logs every run to FILE (checks runAtBoot/delay)
#   --exit: forces the exit code (for testing checkExitCode)
#
# Output is always plain (no ANSI colors), suitable for checkCommand.

set -e

# Global variables
LOG=""
EXIT_CODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --log)   LOG="$2"; shift 2 ;;
    --exit)  EXIT_CODE="$2"; shift 2 ;;
    *)       break ;;
  esac
done
DIRECTORY="${1:-.}"
MODE="${2:-random}"
ORDER="${3:-asc}"
# Sequential modes (alphabetical/date, next/previous) — shared list+index.
# Random mode picks one image at random per run, so it needs no state at all.
STATE_FILE="$HOME/.cache/wallpaper_state"
INDEX_FILE="$HOME/.cache/wallpaper_index"
MARKER_FILE="$HOME/.cache/gnome-wallpaper_marker"

# Run log (--log): timestamp + text
log_line() {
  [[ -n "$LOG" ]] || return 0
  printf '%s\t%s\n' "$(date +%s.%N)" "$*" >>"$LOG" || true
}

# Show help
show_help() {
  cat <<EOF
=== GNOME Wallpaper Script ===

Usage:
    $0 [--log FILE] [--exit N] [DIRECTORY] [MODE] [ORDER]

Arguments:
    --log FILE  : Logs every run to FILE (checks runAtBoot/delay)
    --exit N    : Forces the exit code N (for testing checkExitCode)
    DIRECTORY   : Path to the directory with images (default: current directory)
    MODE        : random | alphabetical | date | next | previous | status | current | marker (default: random)
    ORDER       : asc | desc (default: asc) - only for alphabetical and date; subcommand on|off|status for marker

Note (marker mode):
    The DIRECTORY position is a placeholder (not used or validated): $0 . marker on

Examples:
    $0 ~/Images random              # Random mode without repeats
    $0 ~/Images alphabetical asc    # Ascending alphabetical
    $0 ~/Images date desc           # By modification date, descending
    $0 ~/Images current             # Name of the current wallpaper (plain)
    $0 . marker on                  # Deterministic state: on (DIR not used)
    $0 . marker status              # Read the state (plain, exit 0)

Modes:
    random      : Picks a random image from the directory on each run
    alphabetical: Order by path alphabetically
    date        : Order by modification date
    next        : Next image in the saved list
    previous    : Previous image in the saved list
    status      : Show the state of the saved list
    current     : Name of the current wallpaper (plain output)
    marker      : State 'on'|'off' in ~/.cache/gnome-wallpaper_marker

Order (for alphabetical and date):
    asc         : Ascending
    desc        : Descending

Dependencies:
    - gsettings (included in GNOME)
    - find
    - sort

EOF
}

# Validate directory
validate_directory() {
  if [[ ! -d "$DIRECTORY" ]]; then
    echo "Error: directory '$DIRECTORY' does not exist" >&2
    exit 1
  fi
}

# Get list of images
get_images() {
  local format="$1"
  local order="$2"

  # Find image files (recursively)
  # Supports: jpg, jpeg, png, bmp, gif, webp
  local files
  files=$(find "$DIRECTORY" -type f \( \
    -iname "*.jpg" -o \
    -iname "*.jpeg" -o \
    -iname "*.png" -o \
    -iname "*.bmp" -o \
    -iname "*.gif" -o \
    -iname "*.webp" \
    \))

  if [[ -z "$files" ]]; then
    echo "Error: no images found in '$DIRECTORY'" >&2
    exit 1
  fi

  # Sort according to the format
  case "$format" in
  alphabetical)
    if [[ "$order" == "desc" ]]; then
      echo "$files" | sort -r
    else
      echo "$files" | sort
    fi
    ;;
  date)
    if [[ "$order" == "desc" ]]; then
      echo "$files" | xargs -I {} stat --printf='%Y %n\n' {} | sort -rn | awk '{$1=""; print $0}' | sed 's/^ //'
    else
      echo "$files" | xargs -I {} stat --printf='%Y %n\n' {} | sort -n | awk '{$1=""; print $0}' | sed 's/^ //'
    fi
    ;;
  random)
    echo "$files" | shuf
    ;;
  esac
}

# Set wallpaper
set_wallpaper() {
  local image="$1"
  local abs_path

  # Convert to absolute path
  abs_path=$(cd "$(dirname "$image")" && pwd)/$(basename "$image")

  if [[ ! -f "$abs_path" ]]; then
    echo "Error: cannot access image '$abs_path'" >&2
    return 1
  fi

  # Set wallpaper using gsettings
  gsettings set org.gnome.desktop.background picture-uri "file://$abs_path"
  gsettings set org.gnome.desktop.background picture-uri-dark "file://$abs_path"
  log_line "wallpaper $(basename "$image")"

  echo "Wallpaper set: $(basename "$image")"
}

# Random mode: picks one image at random from the directory on every run.
# No state needed (repeats are allowed — that is what random means).
mode_random() {
  local image
  image=$(get_images "random" "asc" | head -n 1)
  set_wallpaper "$image"
}

# Sequential mode (alphabetical or by date)
mode_sequential() {
  local format="$1"
  local order="$2"
  local images

  images=$(get_images "$format" "$order")

  # Save the sorted list
  echo "$images" >"$STATE_FILE"

  # Get the first image
  local image
  image=$(head -n 1 "$STATE_FILE")

  # Reset index
  echo "1" >"$INDEX_FILE"

  # Set wallpaper
  set_wallpaper "$image"
}

# Next in sequence
next_sequential() {
  local index
  index=$(cat "$INDEX_FILE" 2>/dev/null || echo "1")

  local image
  image=$(sed -n "$((index + 1))p" "$STATE_FILE")

  if [[ -z "$image" ]]; then
    echo "End of list. Restarting..."
    index=0
    image=$(head -n 1 "$STATE_FILE")
  fi

  echo "$((index + 1))" >"$INDEX_FILE"
  set_wallpaper "$image"
}

# Previous in sequence
previous_sequential() {
  local index
  index=$(cat "$INDEX_FILE" 2>/dev/null || echo "1")

  local image
  image=$(sed -n "$((index - 1))p" "$STATE_FILE")

  if [[ -z "$image" ]]; then
    echo "End of list. Restarting..."
    index=0
    image=$(head -n 1 "$STATE_FILE")
  fi

  echo "$((index - 1))" >"$INDEX_FILE"
  set_wallpaper "$image"
}

# Show state
show_state() {
  if [[ -f "$STATE_FILE" ]] && [[ -s "$STATE_FILE" ]]; then
    local total
    total=$(wc -l <"$STATE_FILE")
    local index
    index=$(cat "$INDEX_FILE" 2>/dev/null || echo "0")
    local current
    current=$(sed -n "$((index))p" "$STATE_FILE")

    echo "Current state:"
    echo "  Mode: $MODE"
    echo "  Image: $((index))/$total"
    echo "  File: $(basename "$current")"
  else
    echo "No saved state"
  fi
}

# Name of the current wallpaper (plain output, for checkCommand).
# Does not require a valid directory and modifies nothing.
mode_current() {
  local uri
  uri=$(gsettings get org.gnome.desktop.background picture-uri-dark 2>/dev/null || true)
  if [[ -z "$uri" ]] || [[ "$uri" == "''" ]]; then
    uri=$(gsettings get org.gnome.desktop.background picture-uri 2>/dev/null || true)
  fi
  # gsettings returns single-quoted values: 'file:///path/image.jpg'
  uri="${uri//\'/}"
  uri="${uri//\"/}"
  uri="${uri#file://}"
  local base
  base=$(basename "$uri" 2>/dev/null || true)
  if [[ -z "$base" ]] || [[ "$base" == "." ]] || [[ "$base" == "/" ]]; then
    echo "none"
  else
    echo "$base"
  fi
  exit 0
}

# Deterministic state machine (for checkCommand/checkRegex).
#   marker on|off  : writes the state to MARKER_FILE
#   marker status  : prints 'on'|'off' (plain, exit 0)
# Does not require a valid directory and does not change the wallpaper.
mode_marker() {
  case "$ORDER" in
    on)
      echo "on" >"$MARKER_FILE"
      log_line "marker on"
      echo "Marker: on"
      ;;
    off)
      echo "off" >"$MARKER_FILE"
      log_line "marker off"
      echo "Marker: off"
      ;;
    *)
      cat "$MARKER_FILE" 2>/dev/null || echo "off"
      ;;
  esac
  exit 0
}

# Initial validations
if [[ "$DIRECTORY" == "-h" ]] || [[ "$DIRECTORY" == "--help" ]]; then
  show_help
  exit 0
fi

# Modes that only query (do not require a valid directory)
if [[ "$MODE" != "status" && "$MODE" != "current" && "$MODE" != "marker" ]]; then
  validate_directory
fi

# Process according to mode
case "$MODE" in
random)
  mode_random
  ;;
alphabetical)
  mode_sequential "alphabetical" "$ORDER"
  ;;
date)
  mode_sequential "date" "$ORDER"
  ;;
next)
  next_sequential
  ;;
previous)
  previous_sequential
  ;;
status)
  show_state
  ;;
current)
  mode_current
  ;;
marker)
  mode_marker
  ;;
*)
  echo "Error: unknown mode '$MODE'" >&2
  echo "Valid modes: random, alphabetical, date, next, previous, status, current, marker"
  exit 1
  ;;
esac

# Force exit code (--exit) for testing checkExitCode
if [[ -n "$EXIT_CODE" ]]; then
  exit "$EXIT_CODE"
fi