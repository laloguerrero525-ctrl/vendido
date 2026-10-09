#!/bin/bash
# Doble clic para arrancar VENDIDO en tu Mac.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js. Instala la versión LTS desde https://nodejs.org y vuelve a abrir este archivo."
  open "https://nodejs.org/es/download"
  read -r -p "  Presiona Enter para cerrar..."
  exit 1
fi
if [ ! -d node_modules/express ] || [ ! -d node_modules/socket.io ]; then
  echo "  Instalando lo necesario (solo la primera vez)..."
  npm install --omit=dev || { read -r -p "  Hubo un error. Presiona Enter para cerrar..."; exit 1; }
fi
( sleep 2; open "http://localhost:3000" ) &
npm start
