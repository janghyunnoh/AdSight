#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if command -v conda >/dev/null 2>&1; then
  ADSIGHT_CONDA_BASE="$(conda info --base)"
else
  ADSIGHT_CONDA_BASE="${ADSIGHT_CONDA_ROOT:-$HOME/opt/anaconda3}"
fi
source "$ADSIGHT_CONDA_BASE/etc/profile.d/conda.sh"
conda activate adsight
unset VIRTUAL_ENV VIRTUAL_ENV_PROMPT

if [[ "${1:-}" == "--check" ]]; then
  python -c 'import sys, fastapi, uvicorn, httpx, dotenv; print("Python", sys.version.split()[0]); print("Environment:", sys.prefix); print("FastAPI", fastapi.__version__)'
  exit 0
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  exec /usr/bin/caffeinate -i python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log
else
  exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log
fi
