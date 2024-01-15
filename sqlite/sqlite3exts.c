#include "exts/noop.c"
#include "exts/vfsfileio.c"

int sqlite3_extra_autoext(sqlite3 *db) {
	return SQLITE_OK
		|| sqlite3NoopInit(db)
		|| sqlite3VfsFileIoInit(db);
}
