#!/bin/bash
# Optimiza imágenes usando imgproxy en Docker.
# Convierte a JPG comprimido, redimensiona si necesario, opcionalmente genera WebP.
#
# Uso: ./optimize-images-docker.sh <directorio-assets> [--webp]
#
# Ejemplo:
#   ./optimize-images-docker.sh projects/oreka-fisioterapia/redesign/assets
#   ./optimize-images-docker.sh projects/oreka-fisioterapia/redesign/assets --webp

set -e

ASSETS_DIR="${1:?Uso: ./optimize-images-docker.sh <directorio-assets> [--webp]}"
GENERATE_WEBP=false
[[ "${2}" == "--webp" ]] && GENERATE_WEBP=true

MAX_WIDTH=1200
QUALITY=80
CONTAINER_NAME="imgproxy-optimize"
IMGPROXY_PORT=8282

if [ ! -d "$ASSETS_DIR" ]; then
    echo "Error: directorio '$ASSETS_DIR' no existe"
    exit 1
fi

# Convertir a ruta absoluta
ASSETS_ABS=$(cd "$ASSETS_DIR" && pwd)
# If running inside Docker, translate to host path for nested Docker mounts
if [ -n "$HOST_WORKSPACE" ]; then
    ASSETS_ABS="${HOST_WORKSPACE}${ASSETS_ABS#/app}"
fi

echo "=== Optimización de imágenes con imgproxy ==="
echo "  Directorio: $ASSETS_ABS"
echo "  Max ancho: ${MAX_WIDTH}px | Calidad: ${QUALITY}%"
echo "  WebP: $GENERATE_WEBP"
echo ""

# Arrancar imgproxy si no está corriendo
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Arrancando imgproxy..."
    docker run -d --rm \
        --name "$CONTAINER_NAME" \
        -p ${IMGPROXY_PORT}:8080 \
        -v "${ASSETS_ABS}:/images:ro" \
        -e IMGPROXY_LOCAL_FILESYSTEM_ROOT=/images \
        -e IMGPROXY_QUALITY=$QUALITY \
        -e IMGPROXY_MAX_SRC_RESOLUTION=50 \
        darthsim/imgproxy:latest > /dev/null 2>&1

    # Esperar a que esté listo
    for i in $(seq 1 10); do
        if curl -s "http://localhost:${IMGPROXY_PORT}/health" > /dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
    echo "  imgproxy listo."
    echo ""
    STARTED_CONTAINER=true
else
    echo "  imgproxy ya corriendo."
    echo ""
    STARTED_CONTAINER=false
fi

BASE_URL="http://localhost:${IMGPROXY_PORT}"
processed=0
saved_bytes=0

# Función para procesar un archivo
process_image() {
    local filepath="$1"
    local filename=$(basename "$filepath")
    local rel_path="${filepath#$ASSETS_ABS/}"
    local ext="${filename##*.}"
    local name="${filename%.*}"
    local dir=$(dirname "$filepath")
    local original_size=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null)

    # Obtener dimensiones
    local width=$(sips -g pixelWidth "$filepath" 2>/dev/null | grep pixelWidth | awk '{print $2}')

    # Determinar resize
    local resize_w=$MAX_WIDTH
    if [ -n "$width" ] && [ "$width" -le "$MAX_WIDTH" ] 2>/dev/null; then
        resize_w=$width
    fi

    # Generar JPG optimizado
    local tmp_jpg=$(mktemp /tmp/imgopt.XXXXXX.jpg)
    local status=$(curl -s -o "$tmp_jpg" -w "%{http_code}" \
        "${BASE_URL}/insecure/rs:fit:${resize_w}:0/q:${QUALITY}/plain/local:///${rel_path}@jpg")

    if [ "$status" = "200" ] && [ -s "$tmp_jpg" ]; then
        local new_size=$(stat -f%z "$tmp_jpg" 2>/dev/null || stat -c%s "$tmp_jpg" 2>/dev/null)

        # Solo reemplazar si es más pequeño o si el formato original no era JPG
        if [ "$new_size" -lt "$original_size" ] || [[ "$ext" =~ ^(png|PNG|webp|WEBP)$ ]]; then
            # Si el original no era JPG, crear el JPG y borrar el original
            if [[ ! "$ext" =~ ^(jpg|JPG|jpeg|JPEG)$ ]]; then
                local new_path="${dir}/${name}.jpg"
                cp "$tmp_jpg" "$new_path"
                rm "$filepath"
                local diff=$((original_size - new_size))
                echo "  ✓ ${rel_path} → ${name}.jpg (${diff} bytes ahorrados)"
            else
                cp "$tmp_jpg" "$filepath"
                local diff=$((original_size - new_size))
                echo "  ✓ ${rel_path} (${diff} bytes ahorrados)"
            fi
            saved_bytes=$((saved_bytes + (original_size - new_size)))
        else
            echo "  · ${rel_path} (ya óptimo)"
        fi
    else
        echo "  ✗ ${rel_path} (error HTTP ${status})"
    fi
    rm -f "$tmp_jpg"

    # Generar WebP si se pidió
    if [ "$GENERATE_WEBP" = true ]; then
        local tmp_webp=$(mktemp /tmp/imgopt.XXXXXX.webp)
        local webp_status=$(curl -s -o "$tmp_webp" -w "%{http_code}" \
            "${BASE_URL}/insecure/rs:fit:${resize_w}:0/q:${QUALITY}/plain/local:///${rel_path}@webp")

        if [ "$webp_status" = "200" ] && [ -s "$tmp_webp" ]; then
            local webp_name="${name}.webp"
            local webp_dir=$(dirname "${filepath}")
            # Si original fue borrado (era png), usar el nuevo dir
            [[ ! "$ext" =~ ^(jpg|JPG|jpeg|JPEG)$ ]] && webp_dir="$dir"
            cp "$tmp_webp" "${webp_dir}/${webp_name}"
            local webp_size=$(stat -f%z "${webp_dir}/${webp_name}" 2>/dev/null || stat -c%s "${webp_dir}/${webp_name}" 2>/dev/null)
            echo "    + ${webp_name} (${webp_size} bytes)"
        fi
        rm -f "$tmp_webp"
    fi

    processed=$((processed + 1))
}

# Recorrer imágenes recursivamente (process substitution para evitar subshell)
while IFS= read -r img; do
    process_image "$img"
done < <(find "$ASSETS_ABS" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) | sort)

# Parar contenedor si lo arrancamos nosotros
if [ "$STARTED_CONTAINER" = true ]; then
    echo ""
    echo "Parando imgproxy..."
    docker stop "$CONTAINER_NAME" > /dev/null 2>&1 || true
fi

echo ""
echo "=== Resultado ==="
echo "  Imágenes procesadas: $processed"
saved_kb=$((saved_bytes / 1024))
echo "  Ahorro total: ~${saved_kb} KB"
