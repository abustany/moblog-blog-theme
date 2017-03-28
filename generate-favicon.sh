#!/bin/sh

set -e
cd $(dirname $0)

inkscape --without-gui -f favicon.svg --export-png=favicon_32.png --export-area-page -w 32 -h 32
inkscape --without-gui -f favicon.svg --export-png=favicon_16.png --export-area-page -w 16 -h 16
convert -background transparent favicon_16.png favicon_32.png static/favicon.ico
rm favicon_16.png favicon_32.png
