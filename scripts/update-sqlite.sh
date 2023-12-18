#!/bin/sh
set -e

latest_zip=$(curl -s https://www.sqlite.org/download.html | grep 'PRODUCT' | grep 'sqlite-amalgamation-' | cut -d',' -f 3 | head -n 1)

if [ -z "$latest_zip" ]; then
	echo "Could not find latest SQLite version"
	exit 1
fi

echo "Downloading SQLite $latest_zip"

curl -o sqlite.zip "https://www.sqlite.org/$latest_zip"
unzip -o sqlite.zip
rm -f sqlite.zip

mv sqlite-amalgamation-*/* sqlite/
rm -rf sqlite-amalgamation-*
