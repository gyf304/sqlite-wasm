#include "sqlite3.h"

#ifndef SQLITE_IMPORTED_API
#define SQLITE_IMPORTED_API
#endif

#ifndef SQLITE_EXTRA_API
#define SQLITE_EXTRA_API
#endif

#define SQLITE_WASM_FUNC_MODE_SCALAR 0
#define SQLITE_WASM_FUNC_MODE_AGGREGATE 1
#define SQLITE_WASM_FUNC_MODE_WINDOW 2

__attribute__((import_module("imports"),import_name("sqlite3_wasm_log")))
SQLITE_IMPORTED_API void sqlite3_wasm_log(const char *zLog);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_os_init")))
SQLITE_IMPORTED_API int sqlite3_wasm_os_init(void);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_os_end")))
SQLITE_IMPORTED_API int sqlite3_wasm_os_end(void);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_exec_callback")))
SQLITE_IMPORTED_API int sqlite3_wasm_exec_callback(int id, int nCols, char** azCols, char** azColNames);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_close")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_close(sqlite3_vfs *pVfs, int fileId);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_read")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_read(sqlite3_vfs *pVfs, int fileId, void *pBuf, int iAmt, sqlite3_int64 iOfst);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_write")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_write(sqlite3_vfs *pVfs, int fileId, const void *pBuf, int iAmt, sqlite3_int64 iOfst);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_truncate")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_truncate(sqlite3_vfs *pVfs, int fileId, sqlite3_int64 size);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_sync")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_sync(sqlite3_vfs *pVfs, int fileId, int flags);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_file_size")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_file_size(sqlite3_vfs *pVfs, int fileId, sqlite3_int64 *pSize);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_lock")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_lock(sqlite3_vfs *pVfs, int fileId, int locktype);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_unlock")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_unlock(sqlite3_vfs *pVfs, int fileId, int locktype);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_check_reserved_lock")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_check_reserved_lock(sqlite3_vfs *pVfs, int fileId, int *pResOut);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_file_control")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_file_control(sqlite3_vfs *pVfs, int fileId, int op, void *pArg);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_sector_size")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_sector_size(sqlite3_vfs *pVfs, int fileId);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_io_device_characteristics")))
SQLITE_IMPORTED_API int sqlite3_wasm_io_device_characteristics(sqlite3_vfs *pVfs, int fileId);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_vfs_open")))
SQLITE_IMPORTED_API int sqlite3_wasm_vfs_open(sqlite3_vfs *pVfs, const char *zName, int *pOutfileId, int flags, int *pOutFlags);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_vfs_delete")))
SQLITE_IMPORTED_API int sqlite3_wasm_vfs_delete(sqlite3_vfs *pVfs, const char *zName, int syncDir);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_vfs_access")))
SQLITE_IMPORTED_API int sqlite3_wasm_vfs_access(sqlite3_vfs *pVfs, const char *zName, int flags, int *pResOut);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_vfs_full_pathname")))
SQLITE_IMPORTED_API int sqlite3_wasm_vfs_full_pathname(sqlite3_vfs *pVfs, const char *zName, int nOut, char *zOut);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_vfs_randomness")))
SQLITE_IMPORTED_API int sqlite3_wasm_vfs_randomness(sqlite3_vfs *pVfs, int nByte, char *zOut);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_vfs_sleep")))
SQLITE_IMPORTED_API int sqlite3_wasm_vfs_sleep(sqlite3_vfs *pVfs, int microseconds);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_vfs_current_time")))
SQLITE_IMPORTED_API int sqlite3_wasm_vfs_current_time(sqlite3_vfs *pVfs, double *pTimeOut);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_vfs_get_last_error")))
SQLITE_IMPORTED_API int sqlite3_wasm_vfs_get_last_error(sqlite3_vfs *pVfs, int nByte, char *zOut);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_function_func")))
SQLITE_IMPORTED_API void sqlite3_wasm_function_func(sqlite3_context *pCtx, int iArgc, sqlite3_value **ppArgv);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_function_step")))
SQLITE_IMPORTED_API void sqlite3_wasm_function_step(sqlite3_context *pCtx, int iArgc, sqlite3_value **ppArgv);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_function_final")))
SQLITE_IMPORTED_API void sqlite3_wasm_function_final(sqlite3_context *pCtx);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_function_value")))
SQLITE_IMPORTED_API void sqlite3_wasm_function_value(sqlite3_context *pCtx);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_function_inverse")))
SQLITE_IMPORTED_API void sqlite3_wasm_function_inverse(sqlite3_context *pCtx, int iArgc, sqlite3_value **ppArgv);

__attribute__((import_module("imports"),import_name("sqlite3_wasm_function_destroy")))
SQLITE_IMPORTED_API void sqlite3_wasm_function_destroy(void *pArg);

SQLITE_EXTRA_API int sqlite3_wasm_vfs_register(const char *name, int makeDflt, sqlite3_vfs **ppOutVfs);

SQLITE_EXTRA_API int sqlite3_wasm_vfs_unregister(sqlite3_vfs *pVfs);

SQLITE_EXTRA_API int sqlite3_wasm_create_function(sqlite3 *db, const char *zFunctionName, int nArg, int eTextRep, int iFuncId, int mode);

SQLITE_EXTRA_API int sqlite3_wasm_exec(sqlite3 *db, const char *sql, int id, char **errmsg);

SQLITE_EXTRA_API const sqlite3_api_routines *sqlite3_get_api_routines();
