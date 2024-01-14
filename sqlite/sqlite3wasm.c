#include <stdlib.h>
#include <string.h>

#ifndef SQLITE_IMPORTED_API
#define SQLITE_IMPORTED_API
#endif

__attribute__((import_module("imports"),import_name("sqlite3_wasm_log")))
SQLITE_IMPORTED_API void sqlite3_wasm_log(const char *zLog);

#include "sqlite3.c"
#include "sqlite3exts.c"
#include "sqlite3wasm.h"

#ifndef MAX_EXT_VFS
#define MAX_EXT_VFS 32
#endif

typedef struct sqlite3_wasm_file sqlite3_wasm_file;
struct sqlite3_wasm_file
{
	sqlite3_file base;
	sqlite3_vfs *pVfs;
	int fileId;
};

static sqlite3_api_routines patchedSqlite3Apis;

static int io_close(sqlite3_file *pFile)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	int rc = sqlite3_wasm_io_close(p->pVfs, p->fileId);
	sqlite3_free(p);
	return rc;
}

static int io_read(sqlite3_file *pFile, void *pBuf, int iAmt, sqlite3_int64 iOfst)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_read(p->pVfs, p->fileId, pBuf, iAmt, iOfst);
}

static int io_write(sqlite3_file *pFile, const void *pBuf, int iAmt, sqlite3_int64 iOfst)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_write(p->pVfs, p->fileId, pBuf, iAmt, iOfst);
}

static int io_truncate(sqlite3_file *pFile, sqlite3_int64 size)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_truncate(p->pVfs, p->fileId, size);
}

static int io_sync(sqlite3_file *pFile, int flags)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_sync(p->pVfs, p->fileId, flags);
}

static int io_file_size(sqlite3_file *pFile, sqlite3_int64 *pSize)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_file_size(p->pVfs, p->fileId, pSize);
}

static int io_lock(sqlite3_file *pFile, int locktype)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_lock(p->pVfs, p->fileId, locktype);
}

static int io_unlock(sqlite3_file *pFile, int locktype)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_unlock(p->pVfs, p->fileId, locktype);
}

static int io_check_reserved_lock(sqlite3_file *pFile, int *pResOut)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_check_reserved_lock(p->pVfs, p->fileId, pResOut);
}

static int io_file_control(sqlite3_file *pFile, int op, void *pArg)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_file_control(p->pVfs, p->fileId, op, pArg);
}

static int io_sector_size(sqlite3_file *pFile)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_sector_size(p->pVfs, p->fileId);
}

static int io_device_characteristics(sqlite3_file *pFile)
{
	sqlite3_wasm_file *p = (sqlite3_wasm_file *)pFile;
	return sqlite3_wasm_io_device_characteristics(p->pVfs, p->fileId);
}

static sqlite3_io_methods io_methods = {
	1,
	io_close,
	io_read,
	io_write,
	io_truncate,
	io_sync,
	io_file_size,
	io_lock,
	io_unlock,
	io_check_reserved_lock,
	io_file_control,
	io_sector_size,
	io_device_characteristics,
};

static int vfs_open(sqlite3_vfs *pVfs, const char *zName, sqlite3_file *file, int flags, int *pOutFlags)
{
	int fileId = 0;
	int rc = sqlite3_wasm_vfs_open(pVfs, zName, &fileId, flags, pOutFlags);
	if (fileId == 0) {
		return SQLITE_MISUSE;
	}
	if (rc == SQLITE_OK)
	{
		sqlite3_wasm_file *ext = (sqlite3_wasm_file *)file;
		ext->base.pMethods = &io_methods;
		ext->pVfs = pVfs;
		ext->fileId = fileId;
	}
	return rc;
}

static int vfs_delete(sqlite3_vfs *pVfs, const char *zName, int syncDir)
{
	return sqlite3_wasm_vfs_delete(pVfs, zName, syncDir);
}

static int vfs_access(sqlite3_vfs *pVfs, const char *zName, int flags, int *pResOut)
{
	return sqlite3_wasm_vfs_access(pVfs, zName, flags, pResOut);
}

static int vfs_full_pathname(sqlite3_vfs *pVfs, const char *zName, int nOut, char *zOut)
{
	return sqlite3_wasm_vfs_full_pathname(pVfs, zName, nOut, zOut);
}

static void *vfs_dlopen(sqlite3_vfs *pVfs, const char *zFilename)
{
	return NULL;
}

static void vfs_dlerror(sqlite3_vfs *pVfs, int nByte, char *zErrMsg)
{
	if (nByte > 0)
	{
		strncpy(zErrMsg, "Dynamic linking not supported", nByte - 1);
		zErrMsg[nByte - 1] = '\0';
	}
}

static int vfs_randomness(sqlite3_vfs *pVfs, int nByte, char *zOut)
{
	return sqlite3_wasm_vfs_randomness(pVfs, nByte, zOut);
}

static int vfs_sleep(sqlite3_vfs *pVfs, int microseconds)
{
	return sqlite3_wasm_vfs_sleep(pVfs, microseconds);
}

static int vfs_current_time(sqlite3_vfs *pVfs, double *pTimeOut)
{
	return sqlite3_wasm_vfs_current_time(pVfs, pTimeOut);
}

static int vfs_get_last_error(sqlite3_vfs *pVfs, int nByte, char *zOut)
{
	return sqlite3_wasm_vfs_get_last_error(pVfs, nByte, zOut);
}

static int exec_callback(void *pArg, int nCols, char **azCols, char **azColNames)
{
	return sqlite3_wasm_exec_callback((int)pArg, nCols, azCols, azColNames);
}

int sqlite3_wasm_vfs_register(const char *name, int makeDflt, sqlite3_vfs **ppOutVfs)
{
	if (ppOutVfs == NULL) {
		return SQLITE_MISUSE;
	}

	sqlite3_vfs *pVfs = sqlite3_malloc(sizeof(sqlite3_vfs));
	if (pVfs == NULL) {
		return SQLITE_NOMEM;
	}
	memset(pVfs, 0, sizeof(sqlite3_vfs));

	if (name == NULL) {
		name = "ext";
	}

	char *nameCopy = sqlite3_malloc(strlen(name) + 1);
	if (nameCopy == NULL) {
		sqlite3_free(pVfs);
		return SQLITE_NOMEM;
	}
	strcpy(nameCopy, name);

	pVfs->iVersion = 1;
	pVfs->szOsFile = sizeof(sqlite3_wasm_file);
	pVfs->mxPathname = 256;
	pVfs->zName = nameCopy;
	pVfs->pAppData = 0;
	pVfs->xOpen = vfs_open;
	pVfs->xDelete = vfs_delete;
	pVfs->xAccess = vfs_access;
	pVfs->xFullPathname = vfs_full_pathname;
	pVfs->xDlOpen = vfs_dlopen;
	pVfs->xDlError = vfs_dlerror;
	pVfs->xDlSym = NULL;
	pVfs->xDlClose = NULL;
	pVfs->xRandomness = vfs_randomness;
	pVfs->xSleep = vfs_sleep;
	pVfs->xCurrentTime = vfs_current_time;
	pVfs->xGetLastError = vfs_get_last_error;

	int rc = sqlite3_vfs_register(pVfs, makeDflt);

	if (rc == SQLITE_OK)
	{
		*ppOutVfs = pVfs;
		return SQLITE_OK;
	}

	sqlite3_free(nameCopy);
	sqlite3_free(pVfs);

	return rc;
}

int sqlite3_wasm_vfs_unregister(sqlite3_vfs *pVfs)
{
	int rc = sqlite3_vfs_unregister(pVfs);
	if (rc == SQLITE_OK) {
		sqlite3_free((void *)(pVfs->zName));
		sqlite3_free(pVfs);
	}
	return rc;
}

int sqlite3_wasm_create_function(sqlite3 *db, const char *zFunctionName, int nArg, int eTextRep, int iFuncId, int mode) {
	switch (mode) {
		case SQLITE_WASM_FUNC_MODE_SCALAR:
			return sqlite3_create_function_v2(
				db, zFunctionName, nArg, eTextRep, (void *)iFuncId,
				sqlite3_wasm_function_func,
				NULL,
				NULL,
				sqlite3_wasm_function_destroy
			);
		case SQLITE_WASM_FUNC_MODE_AGGREGATE:
			return sqlite3_create_function(
				db, zFunctionName, nArg, eTextRep, (void *)iFuncId,
				NULL,
				sqlite3_wasm_function_step,
				sqlite3_wasm_function_final
			);
		case SQLITE_WASM_FUNC_MODE_WINDOW:
			return sqlite3_create_window_function(
				db, zFunctionName, nArg, eTextRep, (void *)iFuncId,
				sqlite3_wasm_function_step,
				sqlite3_wasm_function_final,
				sqlite3_wasm_function_value,
				sqlite3_wasm_function_inverse,
				sqlite3_wasm_function_destroy
			);
		default:
			return SQLITE_MISUSE;
	}
}

int sqlite3_os_init()
{
	return sqlite3_wasm_os_init();
}

int sqlite3_os_end()
{
	return sqlite3_wasm_os_end();
}

int sqlite3_wasm_exec(sqlite3 *db, const char *sql, int id, char **errmsg)
{
	return sqlite3_exec(db, sql, exec_callback, (void *)id, errmsg);
}

SQLITE_EXTRA_API const sqlite3_api_routines *sqlite3_get_api_routines() {
	return &sqlite3Apis;
}
