/*
** 2024-01-10
**
** The author disclaims copyright to this source code.  In place of
** a legal notice, here is a blessing:
**
**    May you do good and not evil.
**    May you find forgiveness for yourself and forgive others.
**    May you share freely, never taking more than you give.
**
*/

#include <stddef.h>
#include "sqlite3ext.h"

#ifndef SQLITE_PRIVATE
#define SQLITE_PRIVATE static
#endif

SQLITE_EXTENSION_INIT1

static void noopImplFunc(
	sqlite3_context *context,
	int argc,
	sqlite3_value **argv
) {
	sqlite3_result_value(context, argv[0]);
}

static int noopInit(sqlite3 *db) {
	int rc = SQLITE_OK;

	rc = sqlite3_create_function(db, "noop", 1, SQLITE_UTF8|SQLITE_DETERMINISTIC, NULL, noopImplFunc, NULL, NULL);
	if (rc != SQLITE_OK) {
		return rc;
	}

	return rc;
}

#ifndef SQLITE_CORE
#ifdef _WIN32
__declspec(dllexport)
#endif
int sqlite3_noop_init(sqlite3 *db, char **pzErrMsg, const sqlite3_api_routines *pApi) {
	SQLITE_EXTENSION_INIT2(pApi);
	(void)pzErrMsg; /* unused */
	return noopInit(db);
}
#else
SQLITE_PRIVATE int sqlite3NoopInit(sqlite3 *db) {
	return noopInit(db);
}
#endif
