/*
** 2024-01-07
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

static void readfileFunc(
	sqlite3_context *context,
	int argc,
	sqlite3_value **argv
) {
	sqlite3 *db;
	const char *zVfsName;
	const char *zFilename;
	sqlite3_vfs *vfs;
	sqlite3_file *pFile;
	sqlite3_int64 size;
	int rc;
	int mxBlob;
	void *blob;

	if (argc != 1 && argc != 2) {
		sqlite3_result_error(context, "vfsreadfile() takes 1 or 2 argument(s)", -1);
		return;
	}

	zVfsName = NULL;
	zFilename = (const char *)sqlite3_value_text(argv[0]);
	if (zFilename == NULL) {
		sqlite3_result_error(context, "vfsreadfile() argument must be a string", -1);
		return;
	}

	if (argc == 2) {
		zVfsName = (const char *)sqlite3_value_text(argv[1]);
		if (zVfsName == NULL) {
			sqlite3_result_error(context, "vfsreadfile() vfs argument must be a string", -1);
			return;
		}
	}

	vfs = sqlite3_vfs_find(zVfsName);
	if (vfs == NULL) {
		sqlite3_result_error(context, "vfsreadfile() cannot find specified vfs", -1);
		return;
	}

	pFile = NULL;
	pFile = sqlite3_malloc(vfs->szOsFile);
	if (pFile == NULL) {
		sqlite3_result_error_nomem(context);
		return;
	}

	rc = vfs->xOpen(vfs, zFilename, pFile, SQLITE_OPEN_READONLY, NULL);
	if (rc != SQLITE_OK) {
		if (rc == SQLITE_CANTOPEN) {
			sqlite3_result_null(context);
			return;
		}
		sqlite3_result_error_code(context, rc);
		return;
	}

	size = 0;
	db = sqlite3_context_db_handle(context);
	mxBlob = sqlite3_limit(db, SQLITE_LIMIT_LENGTH, -1);
	rc = pFile->pMethods->xFileSize(pFile, &size);
	if (rc != SQLITE_OK) {
		sqlite3_result_error_code(context, rc);
		goto end;
	}

	if (size < 0) {
		sqlite3_result_error(context, "vfsreadfile() cannot get file size", -1);
		goto end;
	}

	if (size > mxBlob) {
		sqlite3_result_error_toobig(context);
		goto end;
	}

	blob = sqlite3_malloc((int)size);
	if (blob == NULL) {
		sqlite3_result_error_nomem(context);
		goto end;
	}

	rc = pFile->pMethods->xRead(pFile, blob, (int)size, 0);
	if (rc != SQLITE_OK) {
		sqlite3_result_error_code(context, rc);
		goto end;
	}

	sqlite3_result_blob64(context, blob, (sqlite3_uint64)size, sqlite3_free);
end:
	if (pFile != NULL) {
		pFile->pMethods->xClose(pFile);
		sqlite3_free(pFile);
	}

	if (rc != SQLITE_OK && blob != NULL) {
		sqlite3_free(blob);
	}
}

static void writefileFunc(
	sqlite3_context *context,
	int argc,
	sqlite3_value **argv
) {
	const char *zVfsName;
	const char *zFilename;
	sqlite3_vfs *pVfs;
	sqlite3_file *pFile;
	int size;
	int rc;
	const void *blob;

	if (argc != 2 && argc != 3) {
		sqlite3_result_error(context, "vfswritefile() takes 2 or 3 argument(s)", -1);
		return;
	}

	zVfsName = NULL;
	zFilename = (const char *)sqlite3_value_text(argv[0]);
	if (zFilename == NULL) {
		sqlite3_result_error(context, "vfswritefile() argument must be a string", -1);
		return;
	}

	size = sqlite3_value_bytes(argv[1]);
	if (size < 0) {
		sqlite3_result_error(context, "vfswritefile() cannot get blob size", -1);
		return;
	}

	blob = sqlite3_value_blob(argv[1]);
	if (blob == NULL && size > 0) {
		sqlite3_result_error(context, "vfswritefile() cannot get blob", -1);
		return;
	}

	if (argc == 3) {
		zVfsName = (const char *)sqlite3_value_text(argv[2]);
		if (zVfsName == NULL) {
			sqlite3_result_error(context, "vfs argument must be a string", -1);
			return;
		}
	}

	pVfs = sqlite3_vfs_find(zVfsName);
	if (pVfs == NULL) {
		sqlite3_result_error(context, "vfswritefile() cannot find specified vfs", -1);
		return;
	}

	pFile = NULL;
	pFile = sqlite3_malloc(pVfs->szOsFile);
	if (pFile == NULL) {
		sqlite3_result_error_nomem(context);
		return;
	}

	rc = pVfs->xOpen(pVfs, zFilename, pFile, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE, NULL);
	if (rc != SQLITE_OK) {
		sqlite3_result_error_code(context, rc);
		return;
	}

	rc = pFile->pMethods->xTruncate(pFile, 0);
	if (rc != SQLITE_OK) {
		sqlite3_result_error_code(context, rc);
		goto end;
	}

	if (size > 0) {
		rc = pFile->pMethods->xWrite(pFile, blob, size, 0);
		if (rc != SQLITE_OK) {
			sqlite3_result_error_code(context, rc);
			goto end;
		}
	}

	sqlite3_result_int(context, size);

end:
	if (pFile != NULL) {
		pFile->pMethods->xClose(pFile);
		sqlite3_free(pFile);
	}
}


static int vfsFileIoInit(sqlite3 *db) {
	int rc = SQLITE_OK;

	rc = sqlite3_create_function(db, "vfsreadfile", -1, SQLITE_UTF8|SQLITE_DETERMINISTIC, NULL, readfileFunc, NULL, NULL);
	if (rc != SQLITE_OK) {
		return rc;
	}

	rc = sqlite3_create_function(db, "vfswritefile", -1, SQLITE_UTF8|SQLITE_DIRECTONLY, NULL, writefileFunc, NULL, NULL);
	if (rc != SQLITE_OK) {
		return rc;
	}

	return rc;
}

#ifndef SQLITE_CORE
#ifdef _WIN32
__declspec(dllexport)
#endif
int sqlite3_vfsfileio_init(sqlite3 *db, char **pzErrMsg, const sqlite3_api_routines *pApi) {
	SQLITE_EXTENSION_INIT2(pApi);
	(void)pzErrMsg; /* unused */
	return vfsFileIoInit(db);
}
#else
SQLITE_PRIVATE int sqlite3VfsFileIoInit(sqlite3 *db) {
	return vfsFileIoInit(db);
}
#endif
