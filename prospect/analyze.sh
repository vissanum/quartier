#!/bin/bash
set -e

# Analiza las webs de prospectos con Docker (Puppeteer + Lighthouse).
# Toma screenshots, detecta tecnologías, mide rendimiento.
#
# Uso:
#   bash prospect-analyze.sh                    # analiza todos los prospectos con web
#   bash prospect-analyze.sh --limit 5          # solo los primeros 5
#   bash prospect-analyze.sh --id peluqueria-javi  # uno concreto

WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_DIR="$WORKSPACE_DIR/docker/analyzer"
PROSPECTS_FILE="$WORKSPACE_DIR/prospects/prospects.json"
OUTPUT_DIR="$WORKSPACE_DIR/prospects/analysis"
# If running inside Docker, translate to host path for nested Docker mounts
HOST_WORKSPACE_DIR="$WORKSPACE_DIR"
if [ -n "$HOST_WORKSPACE" ]; then
    HOST_WORKSPACE_DIR="${HOST_WORKSPACE}${WORKSPACE_DIR#/app}"
fi
IMAGE_NAME="prospect-analyzer"
CONTAINER_NAME="prospect-analyzer-run"

# --- Args ---

LIMIT=""
SINGLE_ID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --limit) LIMIT="$2"; shift 2 ;;
        --id) SINGLE_ID="$2"; shift 2 ;;
        *) echo "Uso: bash prospect-analyze.sh [--limit N] [--id <prospect-id>]"; exit 1 ;;
    esac
done

# --- Comprobar Docker ---

if ! command -v docker &> /dev/null; then
    echo "✗ Docker no está instalado"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "✗ Docker no está corriendo"
    exit 1
fi

# --- Build imagen si hace falta ---

echo "=== Prospect Analyzer ==="
echo ""

# Comprobar si la imagen existe
if ! docker image inspect "$IMAGE_NAME" &> /dev/null; then
    echo "Construyendo imagen Docker (primera vez, puede tardar)..."
    docker build -t "$IMAGE_NAME" "$HOST_WORKSPACE_DIR/docker/analyzer"
    echo "✓ Imagen construida"
    echo ""
else
    echo "✓ Imagen Docker encontrada"
fi

# --- Preparar input ---

# Crear directorio de trabajo temporal
WORK_DIR=$(mktemp -d)
INPUT_DIR="$WORK_DIR/input"
CONTAINER_OUTPUT="$WORK_DIR/output"
mkdir -p "$INPUT_DIR" "$CONTAINER_OUTPUT"

# Extraer URLs de prospects.json
echo "Preparando URLs..."

node -e "
const fs = require('fs');
const prospects = JSON.parse(fs.readFileSync('$PROSPECTS_FILE', 'utf-8'));

let targets = prospects.filter(p => p.website && p.status !== 'rejected');

const singleId = '$SINGLE_ID';
if (singleId) {
    targets = targets.filter(p => p.id === singleId);
}

// Excluir ya analizados (tienen campo analysis)
targets = targets.filter(p => !p.analysis);

const limit = parseInt('$LIMIT', 10);
if (limit > 0) targets = targets.slice(0, limit);

const urls = targets.map(p => ({ id: p.id, url: p.website }));
fs.writeFileSync('$INPUT_DIR/urls.json', JSON.stringify(urls, null, 2));
console.log('URLs a analizar: ' + urls.length);
urls.forEach(u => console.log('  → ' + u.id + ' — ' + u.url));
"

URL_COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('$INPUT_DIR/urls.json','utf-8'));console.log(d.length)")

if [ "$URL_COUNT" = "0" ]; then
    echo ""
    echo "No hay URLs pendientes de analizar."
    echo "Todas ya están analizadas o no tienen web."
    rm -rf "$WORK_DIR"
    exit 0
fi

echo ""

# --- Ejecutar Docker ---

echo "Lanzando análisis en Docker..."
echo "(Puppeteer + Lighthouse — puede tardar ~30s por web)"
echo ""

docker run --rm \
    --init \
    --cap-add=SYS_ADMIN \
    --memory=3g \
    --name "$CONTAINER_NAME" \
    -v "$INPUT_DIR:/app/input:ro" \
    -v "$CONTAINER_OUTPUT:/app/output" \
    -v /dev/shm:/dev/shm \
    "$IMAGE_NAME" 2>&1

echo ""

# --- Comprobar resultados ---

RESULTS_FILE="$CONTAINER_OUTPUT/results.json"

if [ ! -f "$RESULTS_FILE" ]; then
    echo "✗ No se generó results.json"
    rm -rf "$WORK_DIR"
    exit 1
fi

# --- Copiar screenshots ---

echo "Copiando screenshots..."
mkdir -p "$OUTPUT_DIR/screenshots"
if [ -d "$CONTAINER_OUTPUT/screenshots" ]; then
    cp -r "$CONTAINER_OUTPUT/screenshots/"* "$OUTPUT_DIR/screenshots/" 2>/dev/null || true
fi

# --- Mergear resultados en prospects.json ---

echo "Actualizando prospects.json..."

node -e "
const fs = require('fs');
const prospects = JSON.parse(fs.readFileSync('$PROSPECTS_FILE', 'utf-8'));
const results = JSON.parse(fs.readFileSync('$RESULTS_FILE', 'utf-8'));

let updated = 0;
for (const result of results) {
    const prospect = prospects.find(p => p.id === result.id);
    if (!prospect) continue;

    prospect.analysis = {
        analyzedAt: result.analyzedAt,
        error: result.error,
        classification: result.classification,
        http: result.http,
        meta: result.meta,
        tech: result.tech,
        freshness: result.freshness,
        lighthouse: result.lighthouse,
        metrics: result.metrics,
        screenshots: result.screenshots,
    };

    // Reclasificar si es social media
    if (result.classification?.isSocialMedia) {
        prospect.category = 'nueva';
        prospect.website = null;  // No es una web real
    }

    prospect.fetched = true;
    updated++;
}

fs.writeFileSync('$PROSPECTS_FILE', JSON.stringify(prospects, null, 2));
console.log('Prospectos actualizados: ' + updated);
"

# --- Limpieza ---

rm -rf "$WORK_DIR"

echo ""
echo "✓ Análisis completado"
echo "  Screenshots en: prospects/analysis/screenshots/"
echo "  Datos en: prospects/prospects.json (campo 'analysis')"
