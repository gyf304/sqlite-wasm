#include "exts/noop.c" 

int sqlite3_extra_autoext(sqlite3 *db) {
	return SQLITE_OK
		|| sqlite3NoopInit(db);
}
