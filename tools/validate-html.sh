#!/bin/bash
# Valida todos los HTML de un directorio usando el W3C Nu Html Checker (Docker).
# Comprueba: tags sin cerrar, atributos inválidos, estructura rota, etc.
#
# Uso: ./validate-html.sh <directorio>
# Ejemplo: ./validate-html.sh projects/carrera-nocturna-isar/redesign

set -e

DIR="${1:?Uso: ./validate-html.sh <directorio>}"

if [ ! -d "$DIR" ]; then
    echo "Error: directorio '$DIR' no existe"
    exit 1
fi

DIR_ABS=$(cd "$DIR" && pwd)
# If running inside Docker, translate to host path for nested Docker mounts
if [ -n "$HOST_WORKSPACE" ]; then
    DIR_ABS="${HOST_WORKSPACE}${DIR_ABS#/app}"
fi

echo "=== Validación HTML (W3C Nu Html Checker) ==="
echo "  Directorio: $DIR_ABS"
echo ""

# Ejecutar validador
docker run --rm -v "${DIR_ABS}:/data:ro" \
    ghcr.io/validator/validator:latest \
    vnu --skip-non-html --also-check-css --format text /data/ 2>&1 | \
while IFS= read -r line; do
    # Colorear errores y warnings
    if echo "$line" | grep -q "error:"; then
        echo "  ✗ $line"
    elif echo "$line" | grep -q "warning:"; then
        echo "  ⚠ $line"
    elif echo "$line" | grep -q "info:"; then
        echo "  · $line"
    else
        echo "  $line"
    fi
done

EXIT_CODE=${PIPESTATUS[0]}

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
    echo "=== ✓ Todos los HTML son válidos ==="
else
    echo "=== ✗ Se encontraron errores — revisar antes de publicar ==="
fi

exit $EXIT_CODE
