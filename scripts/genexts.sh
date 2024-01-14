#!/bin/sh

loads=$(grep -Eo 'sqlite3[a-zA-Z]+Init' $@ | sed 's/^/\t\t|| /g' | sed 's/$/(db)/g')
includes=$(echo $@ | tr ' ' '\n' | sed 's/^/#include "/g' | sed 's/$/"/g' | tr '\n' ' ')

cat << EOF
$includes

int sqlite3_extra_autoext(sqlite3 *db) {
	return SQLITE_OK
$loads;
}
EOF
