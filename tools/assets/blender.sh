#!/usr/bin/env bash
# Blender 4.3 sin interfaz, sin sudo: desempaqueta los paquetes de Debian en tools/.cache/blender.
# Uso: tools/assets/blender.sh -b --python script.py -- args
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/.cache/blender"
ROOT="$DIR/root"
PKGS="blender blender-data libassimp5 libboost-locale1.83.0 libcharls2 libdcmtk19 dcmtk-data libdraco8 libgdcm3.0t64
  liblog4cplus-2.0.5t64 libopencolorio2.1t64 libopencv-imgcodecs410 libopencv-videoio410 libopenimageio2.5 libopenvdb10.0t64
  libopenxr-loader1 libosdcpu3.6.0 libosdgpu3.6.0 libpotrace0 libpystring0 libshaderc1 libsocket++1 libspnav0 libyaml-cpp0.8 fonts-dejavu"
if [ ! -x "$ROOT/usr/bin/blender" ]; then
  mkdir -p "$DIR/debs" "$ROOT"
  cd "$DIR/debs"
  for p in $PKGS; do ls ${p}_*.deb >/dev/null 2>&1 || apt-get download "$p" >/dev/null; done
  for d in *.deb; do dpkg -x "$d" "$ROOT"; done
  cd - >/dev/null
fi
LIB="$ROOT/usr/lib/aarch64-linux-gnu"
export LD_LIBRARY_PATH="$LIB:$LIB/blender:$ROOT/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export BLENDER_SYSTEM_RESOURCES="$ROOT/usr/share/blender"
exec "$ROOT/usr/bin/blender" "$@"
