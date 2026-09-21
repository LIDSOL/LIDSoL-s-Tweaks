#!/bin/bash

# Script para cambiar wallpaper de GNOME
# Uso: ./wallpaper.sh [--plano] [--log ARCHIVO] [--exit N] [DIRECTORIO] [MODO] [ORDEN]
#   --plano : salida sin códigos de color (para usar como checkCommand)
#   --log   : registra cada ejecución en ARCHIVO (verifica runAtBoot/retardo)
#   --exit  : fuerza el código de salida (para probar checkExitCode)

set -e

# Variables globales
PLANO=0
LOG=""
EXIT_CODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plano) PLANO=1; shift ;;
    --log)   LOG="$2"; shift 2 ;;
    --exit)  EXIT_CODE="$2"; shift 2 ;;
    *)       break ;;
  esac
done
DIRECTORIO="${1:-.}"
MODO="${2:-random}"
ORDEN="${3:-asc}"
ARCHIVO_ESTADO="$HOME/.cache/wallpaper_random_state"
ARCHIVO_INDICE="$HOME/.cache/wallpaper_indice"
ARCHIVO_MARCADOR="$HOME/.cache/gnome-wallpaper_marcador"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Modo plano: quitar códigos ANSI (checkCommand limpio)
if [[ "$PLANO" == "1" ]]; then
  RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

# Registro de ejecuciones (--log): marca de tiempo + texto
log_line() {
  [[ -n "$LOG" ]] || return 0
  printf '%s\t%s\n' "$(date +%s.%N)" "$*" >>"$LOG" || true
}

# Función: mostrar ayuda
mostrar_ayuda() {
  cat <<EOF
${BLUE}=== Script de Wallpaper para GNOME ===${NC}

${GREEN}Uso:${NC}
    $0 [--plano] [--log ARCHIVO] [--exit N] [DIRECTORIO] [MODO] [ORDEN]

${GREEN}Argumentos:${NC}
    --plano     : Salida sin códigos de color (para checkCommand de toggles)
    --log FILE  : Registra cada ejecución en FILE (verifica runAtBoot/retardo)
    --exit N    : Fuerza el código de salida N (para probar checkExitCode)
    DIRECTORIO  : Ruta del directorio con imágenes (default: directorio actual)
    MODO        : random | alfabetico | fecha | siguiente | anterior | estado | actual | marcador (default: random)
    ORDEN       : asc | desc (default: asc) - solo para alfabetico y fecha; subcomando on|off|estado para marcador

${GREEN}Nota (modo marcador):${NC}
    La posición DIRECTORIO es un placeholder (no se usa ni se valida): $0 . marcador on

${GREEN}Ejemplos:${NC}
    $0 ~/Imágenes random              # Modo aleatorio sin repetir
    $0 ~/Imágenes alfabetico asc      # Alfabéticamente ascendente
    $0 ~/Imágenes fecha desc          # Por fecha descendente
    $0 --plano ~/Imágenes actual      # Nombre del wallpaper actual (plano)
    $0 . marcador on                  # Estado determinista: on (DIR no se usa)
    $0 --plano . marcador estado      # Lee el estado (plano, exit 0)

${GREEN}Modos:${NC}
    ${YELLOW}random${NC}      : Imagen aleatoria sin repetir hasta recorrer todas
    ${YELLOW}alfabetico${NC}  : Orden alfabético de rutas
    ${YELLOW}fecha${NC}       : Orden por fecha de modificación
    ${YELLOW}siguiente${NC}   : Siguiente imagen de la lista guardada
    ${YELLOW}anterior${NC}    : Imagen anterior de la lista guardada
    ${YELLOW}estado${NC}      : Muestra el estado de la lista guardada
    ${YELLOW}actual${NC}      : Nombre del wallpaper actual (salida plana)
    ${YELLOW}marcador${NC}    : Estado 'on'|'off' en ~/.cache/gnome-wallpaper_marcador

${GREEN}Orden (para alfabetico y fecha):${NC}
    ${YELLOW}asc${NC}         : Ascendente
    ${YELLOW}desc${NC}        : Descendente

${GREEN}Dependencias:${NC}
    - gsettings (incluido en GNOME)
    - find
    - sort

EOF
}

# Función: validar directorio
validar_directorio() {
  if [[ ! -d "$DIRECTORIO" ]]; then
    echo -e "${RED}Error: El directorio '$DIRECTORIO' no existe${NC}" >&2
    exit 1
  fi
}

# Función: obtener lista de imágenes
obtener_imagenes() {
  local formato="$1"
  local orden="$2"

  # Encontrar archivos de imagen (recursivamente)
  # Soporta: jpg, jpeg, png, bmp, gif, webp
  local archivos
  archivos=$(find "$DIRECTORIO" -type f \( \
    -iname "*.jpg" -o \
    -iname "*.jpeg" -o \
    -iname "*.png" -o \
    -iname "*.bmp" -o \
    -iname "*.gif" -o \
    -iname "*.webp" \
    \))

  if [[ -z "$archivos" ]]; then
    echo -e "${RED}Error: No se encontraron imágenes en '$DIRECTORIO'${NC}" >&2
    exit 1
  fi

  # Ordenar según el formato
  case "$formato" in
  alfabetico)
    if [[ "$orden" == "desc" ]]; then
      echo "$archivos" | sort -r
    else
      echo "$archivos" | sort
    fi
    ;;
  fecha)
    if [[ "$orden" == "desc" ]]; then
      echo "$archivos" | xargs -I {} stat --printf='%Y %n\n' {} | sort -rn | awk '{$1=""; print $0}' | sed 's/^ //'
    else
      echo "$archivos" | xargs -I {} stat --printf='%Y %n\n' {} | sort -n | awk '{$1=""; print $0}' | sed 's/^ //'
    fi
    ;;
  random)
    echo "$archivos" | shuf
    ;;
  esac
}

# Función: establecer wallpaper
establecer_wallpaper() {
  local imagen="$1"
  local ruta_absoluta

  # Convertir a ruta absoluta
  ruta_absoluta=$(cd "$(dirname "$imagen")" && pwd)/$(basename "$imagen")

  if [[ ! -f "$ruta_absoluta" ]]; then
    echo -e "${RED}Error: No se puede acceder a la imagen '$ruta_absoluta'${NC}" >&2
    return 1
  fi

  # Establecer wallpaper usando gsettings
  gsettings set org.gnome.desktop.background picture-uri "file://$ruta_absoluta"
  gsettings set org.gnome.desktop.background picture-uri-dark "file://$ruta_absoluta"
  log_line "wallpaper $(basename "$imagen")"

  echo -e "${GREEN}✓ Wallpaper establecido:${NC} $(basename "$imagen")"
}

# Función: modo random sin repetición
modo_random() {
  local imagenes
  imagenes=$(obtener_imagenes "random" "asc")

  # Crear lista de imágenes si no existe o se reinicia
  if [[ ! -f "$ARCHIVO_ESTADO" ]] || [[ ! -s "$ARCHIVO_ESTADO" ]]; then
    echo "$imagenes" >"$ARCHIVO_ESTADO"
    echo "0" >"$ARCHIVO_INDICE"
    echo -e "${YELLOW}Reiniciando lista de imágenes...${NC}"
  fi

  # Leer índice actual
  local indice
  indice=$(cat "$ARCHIVO_INDICE" 2>/dev/null || echo "0")

  # Obtener la siguiente imagen
  local imagen
  imagen=$(sed -n "$((indice + 1))p" "$ARCHIVO_ESTADO")

  if [[ -z "$imagen" ]]; then
    # Reiniciar desde el principio
    indice=0
    imagen=$(sed -n "1p" "$ARCHIVO_ESTADO")
    echo -e "${YELLOW}Reiniciando ciclo de imágenes...${NC}"
  fi

  # Incrementar índice
  echo "$((indice + 1))" >"$ARCHIVO_INDICE"

  # Establecer wallpaper
  establecer_wallpaper "$imagen"
}

# Función: modo secuencial (alfabético o por fecha)
modo_secuencial() {
  local formato="$1"
  local orden="$2"
  local imagenes

  imagenes=$(obtener_imagenes "$formato" "$orden")

  # Guardar lista ordenada
  echo "$imagenes" >"$ARCHIVO_ESTADO"

  # Obtener primera imagen
  local imagen
  imagen=$(head -n 1 "$ARCHIVO_ESTADO")

  # Reiniciar índice
  echo "1" >"$ARCHIVO_INDICE"

  # Establecer wallpaper
  establecer_wallpaper "$imagen"
}

# Función: siguiente en secuencia
siguiente_secuencial() {
  local indice
  indice=$(cat "$ARCHIVO_INDICE" 2>/dev/null || echo "1")

  local imagen
  imagen=$(sed -n "$((indice + 1))p" "$ARCHIVO_ESTADO")

  if [[ -z "$imagen" ]]; then
    echo -e "${YELLOW}Fin de la lista. Reiniciando...${NC}"
    indice=0
    imagen=$(head -n 1 "$ARCHIVO_ESTADO")
  fi

  echo "$((indice + 1))" >"$ARCHIVO_INDICE"
  establecer_wallpaper "$imagen"
}

# Función: anterior en secuencia
anterior_secuencial() {
  local indice
  indice=$(cat "$ARCHIVO_INDICE" 2>/dev/null || echo "1")

  local imagen
  imagen=$(sed -n "$((indice - 1))p" "$ARCHIVO_ESTADO")

  if [[ -z "$imagen" ]]; then
    echo -e "${YELLOW}Fin de la lista. Reiniciando...${NC}"
    indice=0
    imagen=$(head -n 1 "$ARCHIVO_ESTADO")
  fi

  echo "$((indice - 1))" >"$ARCHIVO_INDICE"
  establecer_wallpaper "$imagen"
}

# Función: mostrar estado
mostrar_estado() {
  if [[ -f "$ARCHIVO_ESTADO" ]] && [[ -s "$ARCHIVO_ESTADO" ]]; then
    local total
    total=$(wc -l <"$ARCHIVO_ESTADO")
    local indice
    indice=$(cat "$ARCHIVO_INDICE" 2>/dev/null || echo "0")
    local actual
    actual=$(sed -n "$((indice))p" "$ARCHIVO_ESTADO")

    echo -e "${BLUE}Estado actual:${NC}"
    echo "  Modo: $MODO"
    echo "  Imagen: $((indice))/$total"
    echo "  Archivo: $(basename "$actual")"
  else
    echo -e "${YELLOW}No hay estado guardado${NC}"
  fi
}

# Función: nombre del wallpaper actual (salida plana, para checkCommand).
# No requiere directorio válido ni modifica nada.
modo_actual() {
  local uri
  uri=$(gsettings get org.gnome.desktop.background picture-uri-dark 2>/dev/null || true)
  if [[ -z "$uri" ]] || [[ "$uri" == "''" ]]; then
    uri=$(gsettings get org.gnome.desktop.background picture-uri 2>/dev/null || true)
  fi
  # gsettings devuelve comillas simples: 'file:///ruta/imagen.jpg'
  uri="${uri//\'/}"
  uri="${uri//\"/}"
  uri="${uri#file://}"
  local base
  base=$(basename "$uri" 2>/dev/null || true)
  if [[ -z "$base" ]] || [[ "$base" == "." ]] || [[ "$base" == "/" ]]; then
    echo "ninguno"
  else
    echo "$base"
  fi
  exit 0
}

# Función: máquina de estados determinista (para checkCommand/checkRegex).
#   marcador on|off  : escribe el estado en ARCHIVO_MARCADOR
#   marcador estado  : imprime 'on'|'off' plano (exit 0)
# No requiere directorio válido ni modifica el wallpaper.
modo_marcador() {
  case "$ORDEN" in
    on)
      echo "on" >"$ARCHIVO_MARCADOR"
      log_line "marcador on"
      echo -e "${GREEN}Marcador: on${NC}"
      ;;
    off)
      echo "off" >"$ARCHIVO_MARCADOR"
      log_line "marcador off"
      echo -e "${GREEN}Marcador: off${NC}"
      ;;
    *)
      cat "$ARCHIVO_MARCADOR" 2>/dev/null || echo "off"
      ;;
  esac
  exit 0
}

# Validaciones iniciales
if [[ "$DIRECTORIO" == "-h" ]] || [[ "$DIRECTORIO" == "--help" ]]; then
  mostrar_ayuda
  exit 0
fi

# Modos que solo consultan (no requieren directorio válido)
if [[ "$MODO" != "estado" && "$MODO" != "actual" && "$MODO" != "marcador" ]]; then
  validar_directorio
fi

# Procesar según modo
case "$MODO" in
random)
  modo_random
  ;;
alfabetico)
  modo_secuencial "alfabetico" "$ORDEN"
  ;;
fecha)
  modo_secuencial "fecha" "$ORDEN"
  ;;
siguiente)
  siguiente_secuencial
  ;;
anterior)
  anterior_secuencial
  ;;
estado)
  mostrar_estado
  ;;
actual)
  modo_actual
  ;;
marcador)
  modo_marcador
  ;;
*)
  echo -e "${RED}Error: Modo desconocido '$MODO'${NC}" >&2
  echo "Modos válidos: random, alfabetico, fecha, siguiente, anterior, estado, actual, marcador"
  exit 1
  ;;
esac

# Forzar código de salida (--exit) para probar checkExitCode
if [[ -n "$EXIT_CODE" ]]; then
  exit "$EXIT_CODE"
fi
