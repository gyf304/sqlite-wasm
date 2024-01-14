import type { SQLiteExports, CPointer, SQLiteImports } from "./api";
import { ResultCode, Datatype, SyncFlag, LockLevel, AccessFlag, OpenFlag, VERSION_NUMBER } from "./constants";

import * as constants from "./constants";
import { SQLiteError, toScalar } from "./types";
import { SQLiteUtils } from "./utils";
import { VFS, VFSFile } from "./vfs/index";
import { JSVFS } from "./vfs/js";

import type { ExtendedScalar, Scalar } from "./types";
import type { Function } from "./func";

function mustGet<T, K>(map: Map<T, K>, key: T): K {
	const value = map.get(key);
	if (value === undefined) {
		throw new Error(`No value for ${key}`);
	}
	return value;
}

export class SQLite {
	private readonly instance: WebAssembly.Instance;

	private _vfsMap: Map<number, VFS> = new Map();
	private _vfsLastErrorMap: Map<number, SQLiteError> = new Map();

	private _fileMap: Map<number, VFSFile> = new Map();
	private _fileId: number = 1;

	private _readCounter: number = 0;
	private _writeCounter: number = 0;

	/** @internal */
	public _funcMap: Map<number, Function> = new Map();

	/** @internal */
	public _funcId: number = 1;

	public readonly utils: SQLiteUtils;
	public readonly exports: SQLiteExports;

	/** @internal */
	public _execCallback: SQLiteImports["sqlite3_wasm_exec_callback"] | undefined;

	public static instantiate(module: WebAssembly.Module): Promise<SQLite>;
	public static instantiate(module: WebAssembly.Module, async: true): Promise<SQLite>;
	public static instantiate(module: WebAssembly.Module, async: false): SQLite;
	public static instantiate(module: WebAssembly.Module, async: boolean = true): Promise<SQLite> | SQLite {
		let sqlite: SQLite;

		const imports: SQLiteImports = {
			sqlite3_wasm_log(zLog) {
				console.log(sqlite.utils.decodeString(zLog));
			},
			sqlite3_wasm_io_check_reserved_lock(_, _fileId, pResOut) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					const res = file.checkReservedLock();
					sqlite.utils.dataView.setUint32(pResOut, res ? 1 : 0, true);
				}).code;
			},
			sqlite3_wasm_io_close(_, _fileId) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					file.close();
					sqlite._fileMap.delete(_fileId);
				}).code;
			},
			sqlite3_wasm_io_device_characteristics(_, _fileId) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return file.deviceCharacteristics();
			},
			sqlite3_wasm_io_file_control(_, _fileId, op, pArg) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					const arg = sqlite.utils.deref32(pArg);
					const argBuf = sqlite.utils.u8.slice(arg).buffer as ArrayBuffer;
					file.fileControl(op, argBuf);
				}).code;
			},
			sqlite3_wasm_io_file_size(_, _fileId, pSize) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					const size = file.fileSize();
					sqlite.utils.dataView.setBigUint64(pSize, BigInt(size), true);
				}).code;
			},
			sqlite3_wasm_io_lock(_, _fileId, locktype) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					file.lock(locktype as LockLevel);
				}).code;
			},
			sqlite3_wasm_io_read(_, _fileId, pBuf, iAmt, iOfst) {
				sqlite._readCounter += 1;
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					const buf = sqlite.utils.u8.subarray(pBuf, pBuf + iAmt);
					file.read(buf, iOfst);
				}).code;
			},
			sqlite3_wasm_io_sector_size(_, _fileId) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return file.sectorSize();
			},
			sqlite3_wasm_io_sync(_, _fileId, flags) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					file.sync(flags as SyncFlag);
				}).code;
			},
			sqlite3_wasm_io_unlock(_, _fileId, locktype) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					file.unlock(locktype as LockLevel);
				}).code;
			},
			sqlite3_wasm_io_truncate(_, _fileId, size) {
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					file.truncate(Number(size));
				}).code;
			},
			sqlite3_wasm_io_write(_, _fileId, pBuf, iAmt, iOfst) {
				sqlite._writeCounter += 1;
				const file = mustGet(sqlite._fileMap, _fileId);
				return sqlite.utils.wrapError(() => {
					const buf = sqlite.utils.u8.subarray(pBuf, pBuf + iAmt);
					file.write(buf, iOfst);
				}).code;
			},
			sqlite3_wasm_vfs_access(id, zName, flags, pResOut) {
				const vfs = mustGet(sqlite._vfsMap, id);
				return sqlite.utils.wrapError(() => {
					const res = vfs.access(sqlite.utils.decodeString(zName), flags as AccessFlag);
					sqlite.utils.dataView.setUint32(pResOut, res ? 1 : 0, true);
				}).code;
			},
			sqlite3_wasm_vfs_delete(id, zName, syncDir) {
				const vfs = mustGet(sqlite._vfsMap, id);
				return sqlite.utils.wrapError(() => {
					vfs.delete(sqlite.utils.decodeString(zName), syncDir !== 0);
				}).code;
			},
			sqlite3_wasm_vfs_open(id, zName, pOut_fileId, flags, pOutFlags) {
				const vfs = mustGet(sqlite._vfsMap, id);
				return sqlite.utils.wrapError(() => {
					const _fileId = sqlite._fileId;
					const file = vfs.open(sqlite.utils.decodeString(zName), flags as OpenFlag);
					sqlite._fileMap.set(_fileId, file);
					sqlite._fileId += 1;
					sqlite.utils.dataView.setUint32(pOut_fileId, _fileId, true);
					sqlite.utils.dataView.setUint32(pOutFlags, file.openFlags, true);
				}).code;
			},
			sqlite3_wasm_vfs_get_last_error(id, nByte, zOut) {
				const e = sqlite._vfsLastErrorMap.get(id) ?? sqlite.utils.ok;
				const code = e.code;
				sqlite.utils.setString(zOut, nByte, e.message);
				return code;
			},
			sqlite3_wasm_vfs_full_pathname(id, zName, nOut, zOut) {
				const vfs = mustGet(sqlite._vfsMap, id);
				return sqlite.utils.wrapError(() => {
					const path = vfs.fullPathname(sqlite.utils.decodeString(zName));
					sqlite.utils.setString(zOut, nOut, path);
				}).code;
			},
			sqlite3_wasm_vfs_current_time(id, pTimeOut) {
				const vfs = mustGet(sqlite._vfsMap, id);
				return sqlite.utils.wrapError(() => {
					const time = vfs.currentTime();
					sqlite.utils.dataView.setFloat64(pTimeOut, time, true);
				}).code;
			},
			sqlite3_wasm_vfs_randomness(id, nByte, zOut) {
				const vfs = mustGet(sqlite._vfsMap, id);
				return sqlite.utils.wrapError(() => {
					vfs.randomness(sqlite.utils.u8.subarray(zOut, zOut + nByte));
				}).code;
			},
			sqlite3_wasm_vfs_sleep(id, microseconds) {
				const vfs = mustGet(sqlite._vfsMap, id);
				return sqlite.utils.wrapError(() => {
					vfs.sleep(microseconds);
				}).code;
			},
			sqlite3_wasm_function_func(pCtx, iArgc, ppArgv) {
				const funcId = sqlite.exports.sqlite3_user_data(pCtx);
				const func = mustGet(sqlite._funcMap, funcId);
				return sqlite.utils.functionShim(func.func!, pCtx, iArgc, ppArgv);
			},
			sqlite3_wasm_function_step(pCtx, iArgc, ppArgv) {
				const funcId = sqlite.exports.sqlite3_user_data(pCtx);
				const func = mustGet(sqlite._funcMap, funcId);
				return sqlite.utils.functionShim(func.step!, pCtx, iArgc, ppArgv);
			},
			sqlite3_wasm_function_final(pCtx) {
				const func = mustGet(sqlite._funcMap, pCtx);
				return sqlite.utils.functionShim(func.final!, pCtx);
			},
			sqlite3_wasm_function_value(pCtx) {
				const funcId = sqlite.exports.sqlite3_user_data(pCtx);
				const func = mustGet(sqlite._funcMap, funcId);
				return sqlite.utils.functionShim(func.value!, pCtx);
			},
			sqlite3_wasm_function_inverse(pCtx, iArgc, ppArgv) {
				const funcId = sqlite.exports.sqlite3_user_data(pCtx);
				const func = mustGet(sqlite._funcMap, funcId);
				return sqlite.utils.functionShim(func.inverse!, pCtx, iArgc, ppArgv);
			},
			sqlite3_wasm_function_destroy(pArg) {
				sqlite._funcMap.delete(pArg);
				return;
			},
			sqlite3_wasm_os_init() {
				const pId = sqlite.utils.malloc(4);
				const pName = sqlite.utils.cString(JSVFS.name);
				const rc = sqlite.exports.sqlite3_wasm_vfs_register(pName, 1, pId);
				const id = sqlite.utils.deref32(pId);
				sqlite._vfsMap.set(id, JSVFS);
				sqlite.utils.free(pName);
				sqlite.utils.free(pId);
				sqlite.utils.checkError(rc);
				return ResultCode.OK;
			},
			sqlite3_wasm_os_end() {
				return ResultCode.OK;
			},
			sqlite3_wasm_exec_callback(i, nCols, azCols, azColNames) {
				return sqlite._execCallback!(i, nCols, azCols, azColNames);
			},
		};

		if (async) {
			return (async () => {
				const instance = await WebAssembly.instantiate(module, {
					imports: {
						...imports,
					},
				});

				sqlite = new SQLite(instance);
				sqlite.initialize();
				return sqlite;
			})();
		} else {
			const instance = new WebAssembly.Instance(module, {
				imports: {
					...imports,
				},
			});
			sqlite = new SQLite(instance);
			sqlite.initialize();
			return sqlite;
		}
	}

	private constructor(instance: WebAssembly.Instance) {
		this.instance = instance;
		this.exports = this.instance.exports as SQLiteExports;
		this.utils = new SQLiteUtils(this.exports);
	}

	public initialize(): void {
		const rc = this.exports.sqlite3_initialize();
		const ver = this.exports.sqlite3_libversion_number();
		if (ver !== VERSION_NUMBER) {
			throw new Error(`SQLite version mismatch: expected ${VERSION_NUMBER}, got ${ver}`);
		}
		this.utils.checkError(rc);
	}

	public registerVFS(vfs: VFS, makeDflt: boolean = false): void {
		const pId = this.utils.malloc(4);
		const pName = this.utils.cString(vfs.name);
		const rc = this.exports.sqlite3_wasm_vfs_register(pName, makeDflt ? 1 : 0, pId);
		const id = this.utils.deref32(pId);
		this._vfsMap.set(id, vfs);
		this.utils.free(pName);
		this.utils.free(pId);
		this.utils.checkError(rc);
	}

	public unregisterVFS(vfs: VFS): void {
		const ptr = Array.from(this._vfsMap.entries()).find(([_, v]) => v === vfs)?.[0];
		if (ptr === undefined) {
			throw new Error(`VFS ${vfs.name} not registered`);
		}
		const rc = this.exports.sqlite3_wasm_vfs_unregister(ptr);
		this.utils.checkError(rc);
		this._vfsMap.delete(ptr);
	}

	public get readCounter(): number {
		return this._readCounter;
	}

	public get writeCounter(): number {
		return this._writeCounter;
	}

	public open(filename: string, flags?: number, vfs?: string): Database {
		const filenamePtr = this.utils.cString(filename);
		const ppDb = this.exports.sqlite3_malloc(4);
		let rc = 0;
		if (flags === undefined) {
			rc = this.exports.sqlite3_open(filenamePtr, ppDb);
		} else {
			const vfsCStr = vfs === undefined ? 0 : this.utils.cString(vfs);
			rc = this.exports.sqlite3_open_v2(filenamePtr, ppDb, flags, vfsCStr);
			if (vfsCStr !== 0) {
				this.utils.free(vfsCStr);
			}
		}
		this.utils.free(filenamePtr);
		if (rc !== ResultCode.OK) {
			throw new SQLiteError(rc);
		}
		const pDb = this.utils.deref32(ppDb);
		this.utils.free(ppDb);
		return new Database(this, pDb);
	}

	public load(data: ArrayBuffer, schema: string = "main"): Database {
		const db = this.open(":memory:");
		const backupDb = this.open(":memory:");
		const zSchema = this.utils.cString(schema);
		const zMain = this.utils.cString("main");
		backupDb.deserialize(data);
		const pBackup = this.exports.sqlite3_backup_init(db.pDb, this.utils.cString(schema), backupDb.pDb, zMain);
		if (pBackup != 0) {
			this.exports.sqlite3_backup_step(pBackup, -1);
			this.exports.sqlite3_backup_finish(pBackup);
		}
		const rc = this.exports.sqlite3_errcode(db.pDb);
		this.utils.free(zSchema);
		this.utils.free(zMain);
		backupDb.close();
		this.utils.checkError(rc, db.pDb);
		return db;
	}

	public shutdown(): void {
		const rc = this.exports.sqlite3_shutdown();
		this.utils.checkError(rc);
	}
}

export interface ExecValue {
	name: string;
	value: string | null;
}

const dbFR = new FinalizationRegistry((w: {
	sqlite: SQLite;
	pDb: number;
}) => {
	if (w.pDb !== 0) {
		w.sqlite.exports.sqlite3_close(w.pDb);
	}
});

type ExecCallback = (i: number, cols: (string | null)[], colNames: (string | null)[]) => void;
export class Database {
	public readonly utils: SQLiteUtils;
	public readonly exports: SQLiteExports;

	constructor(public readonly sqlite: SQLite, public pDb: CPointer) {
		this.utils = sqlite.utils;
		this.exports = sqlite.exports;
		dbFR.register(this, { sqlite, pDb }, this);
	}

	public createFunction(name: string, func: ((...args: Scalar[]) => ExtendedScalar) | Function, deterministic?: boolean): void {
		const f: Function = typeof func === "function" ? { func } : func;
		let flag = constants.UTF8;
		if ((f.deterministic ?? false) || (deterministic ?? false)) {
			flag |= constants.DETERMINISTIC;
		}
		const mode = f.func !== undefined ? constants.WASM_FUNC_MODE_SCALAR
			: f.value !== undefined ? constants.WASM_FUNC_MODE_WINDOW
			: constants.WASM_FUNC_MODE_AGGREGATE;
		const zName = this.utils.cString(name);
		const funcId = this.sqlite._funcId++;
		this.sqlite._funcMap.set(funcId, f);
		const rc = this.sqlite.exports.sqlite3_wasm_create_function(this.pDb, zName, f.nArg ?? -1, flag, funcId, mode);
		this.utils.free(zName);
		this.utils.checkError(rc);
		return;
	}

	public prepare(sql: string): Statement | null {
		const zSql = this.utils.cString(sql);
		const ppStmt = this.exports.sqlite3_malloc(4);
		const pzTail = this.exports.sqlite3_malloc(4);
		const rc = this.exports.sqlite3_prepare_v2(this.pDb, zSql, -1, ppStmt, pzTail);
		if (rc !== ResultCode.OK) {
			this.utils.free(zSql);
			this.utils.free(ppStmt);
			this.utils.free(pzTail);
			throw this.utils.lastError(this.pDb);
		}
		const pStmt = this.utils.deref32(ppStmt);
		const zTail = this.utils.deref32(pzTail);
		let tail: string | undefined;
		if (zTail !== 0) {
			tail = this.utils.decodeString(zTail);
		}
		const consumedSql = this.utils.textDecoder.decode(this.utils.u8.slice(zSql, zTail));
		this.utils.free(zSql);
		this.utils.free(ppStmt);
		this.utils.free(pzTail);
		if (pStmt === 0) {
			return null;
		}
		return new Statement(this, pStmt, consumedSql, tail);
	}

	public exec(sql: string, callback?: ExecCallback) {
		const pSql = this.utils.cString(sql);
		const pzErr = this.utils.malloc(4);
		let error: any;

		this.sqlite._execCallback = (i, nCols, azCols, azColNames) => {
			if (callback === undefined) {
				return ResultCode.OK;
			}
			const cols: (string | null)[] = [];
			const colNames: (string | null)[] = [];
			for (let j = 0; j < nCols; j++) {
				const zCol = this.utils.deref32(azCols + j * 4);
				const zColName = this.utils.deref32(azColNames + j * 4);
				const colName = this.utils.decodeString(zColName);
				const col = zCol === 0 ? null : this.utils.decodeString(zCol);
				cols.push(col);
				colNames.push(colName);
			}
			try {
				callback(i, cols, colNames);
			} catch (e) {
				error = e;
				if (e instanceof SQLiteError) {
					return e.code;
				}
				return ResultCode.ERROR;
			}
			return ResultCode.OK;
		};

		const rc = this.exports.sqlite3_wasm_exec(this.pDb, pSql, 0, pzErr);
		this.utils.free(pSql);
		this.utils.free(pzErr);

		if (error !== undefined) {
			throw error;
		}

		this.utils.checkError(rc, this.pDb);
	}

	public serialize(schema: string = "main", mFlags: number = 0): ArrayBuffer | null {
		const zSchema = this.utils.cString(schema);
		const piSize = this.exports.sqlite3_malloc(8);
		const pOut = this.exports.sqlite3_serialize(this.pDb, zSchema, piSize, mFlags);
		const size = this.utils.deref32(piSize);
		this.utils.free(zSchema);
		this.utils.free(piSize);
		let out: Uint8Array | null = null;
		if (pOut !== 0) {
			out = new Uint8Array(size);
			out.set(this.utils.u8.slice(pOut, pOut + size));
			this.exports.sqlite3_free(pOut);
		}
		return out === null ? null : out.buffer as ArrayBuffer;
	}

	public deserialize(data: ArrayBuffer, schema: string = "main", mFlags: number = 0): void {
		const zSchema = this.utils.cString(schema);
		const pData = this.utils.malloc(data.byteLength);
		this.utils.u8.set(new Uint8Array(data), pData);
		const rc = this.exports.sqlite3_deserialize(
			this.pDb,
			zSchema,
			pData,
			BigInt(data.byteLength),
			BigInt(data.byteLength),
			mFlags | constants.DESERIALIZE_FREEONCLOSE | constants.DESERIALIZE_RESIZEABLE,
		);
		this.utils.free(zSchema);
		this.utils.checkError(rc, this.pDb);
	}

	public close(): void {
		const rc = this.exports.sqlite3_close(this.pDb);
		this.utils.checkError(rc);
		this.pDb = 0;
		dbFR.unregister(this);
	}
}

const stmtFinalizationRegistry = new FinalizationRegistry((w: {
	db: Database;
	pStmt: number;
}) => {
	if (w.pStmt !== 0) {
		w.db.exports.sqlite3_finalize(w.pStmt);
	}
});

export class Statement {
	public readonly utils: SQLiteUtils;
	public readonly exports: SQLiteExports;

	constructor(
		public readonly db: Database,
		private pStmt: CPointer,
		public readonly sql?: string,
		public readonly tail?: string
	) {
		this.utils = db.utils;
		this.exports = db.exports;
		stmtFinalizationRegistry.register(this, { db, pStmt }, this);
	}

	public columnCount(): number {
		return this.exports.sqlite3_column_count(this.pStmt);
	}

	public bindText(i: number, text: string): void {
		const textPtr = this.utils.cString(text);
		const rc = this.exports.sqlite3_bind_text(this.pStmt, i, textPtr, -1, -1);
		this.utils.free(textPtr);
		this.utils.checkError(rc, this.pStmt);
	}

	public bindBlob(i: number, buf: ArrayBuffer): void {
		const view = new Uint8Array(buf);
		const ptr = this.utils.malloc(view.length);
		this.utils.u8.set(view, ptr);
		const rc = this.exports.sqlite3_bind_blob(this.pStmt, i, ptr, view.length, -1);
		this.utils.free(ptr);
		this.utils.checkError(rc, this.db.pDb);
	}

	public bindDouble(i: number, d: number): void {
		const rc = this.exports.sqlite3_bind_double(this.pStmt, i, d);
		this.utils.checkError(rc, this.db.pDb);
	}

	public bindInt(i: number, i32: number): void {
		const rc = this.exports.sqlite3_bind_int(this.pStmt, i, i32);
		this.utils.checkError(rc, this.db.pDb);
	}

	public bindInt64(i: number, i64: bigint): void {
		const rc = this.exports.sqlite3_bind_int64(this.pStmt, i, i64);
		this.utils.checkError(rc, this.db.pDb);
	}

	public bindNull(i: number): void {
		const rc = this.exports.sqlite3_bind_null(this.pStmt, i);
		this.utils.checkError(rc, this.db.pDb);
	}

	public bindValue(i: number, value: ExtendedScalar): void {
		const scalar = toScalar(value);
		if (scalar === null) {
			return this.bindNull(i);
		}
		if (typeof scalar === "string") {
			return this.bindText(i, scalar);
		}
		if (typeof scalar === "number") {
			return this.bindDouble(i, scalar);
		}
		if (typeof scalar === "bigint") {
			return this.bindInt64(i, scalar);
		}
		if (scalar instanceof ArrayBuffer) {
			return this.bindBlob(i, scalar);
		}
		throw new Error(`Unsupported type ${typeof value}: ${value}`);
	}

	public bindValues(...values: ExtendedScalar[]): void {
		for (let i = 0; i < values.length; i++) {
			this.bindValue(i + 1, values[i]);
		}
	}

	public step(): boolean {
		const rc = this.exports.sqlite3_step(this.pStmt);
		if (rc === ResultCode.ROW) {
			return true;
		} else if (rc === ResultCode.OK || rc === ResultCode.DONE) {
			return false;
		} else {
			throw this.utils.lastError(this.db.pDb);
		}
	}

	public reset(): void {
		const rc = this.exports.sqlite3_reset(this.pStmt);
		this.utils.checkError(rc, this.db.pDb);
	}

	public columnType(i: number): Datatype {
		return this.exports.sqlite3_column_type(this.pStmt, i) as Datatype;
	}

	public columnName(i: number): string {
		const namePtr = this.exports.sqlite3_column_name(this.pStmt, i);
		const name = this.utils.decodeString(namePtr);
		return name;
	}

	public columnText(i: number): string {
		const ptr = this.exports.sqlite3_column_text(this.pStmt, i);
		const text = this.utils.decodeString(ptr);
		return text;
	}

	public columnBlob(i: number): ArrayBuffer {
		const ptr = this.exports.sqlite3_column_blob(this.pStmt, i);
		const len = this.exports.sqlite3_column_bytes(this.pStmt, i);
		const buf = new Uint8Array(len);
		const window = this.utils.u8.subarray(ptr, ptr + len);
		buf.set(window);
		return buf.buffer as ArrayBuffer;
	}

	public columnDouble(i: number): number {
		return this.exports.sqlite3_column_double(this.pStmt, i);
	}

	public columnInt(i: number): number {
		return this.exports.sqlite3_column_int(this.pStmt, i);
	}

	public columnInt64(i: number): bigint {
		return this.exports.sqlite3_column_int64(this.pStmt, i);
	}

	public columnDecltype(i: number): string | null {
		const zDecltype = this.exports.sqlite3_column_decltype(this.pStmt, i);
		if (zDecltype === 0) {
			return null;
		}
		return this.utils.decodeString(zDecltype);
	}

	public columnValue(i: number): Scalar;
	public columnValue(i: number, noBigInt: true): string | number | ArrayBuffer | null;
	public columnValue(i: number, noBigInt: false): Scalar;
	public columnValue(i: number, noBigInt: boolean): Scalar;
	public columnValue(i: number, noBigInt?: boolean): Scalar {
		const type = this.columnType(i);
		switch (type) {
			case Datatype.NULL:
				return null;
			case Datatype.TEXT:
				return this.columnText(i);
			case Datatype.BLOB:
				return this.columnBlob(i);
			case Datatype.INTEGER:
				if (noBigInt || globalThis.BigInt === undefined) {
					return this.columnInt(i);
				}
				return this.columnInt64(i);
			case Datatype.FLOAT:
				return this.columnDouble(i);
			default:
				/* istanbul ignore next - should not happen, all types covered */
				throw new Error(`Unknown column type: ${type}`);
		}
	}

	public columns(): Scalar[];
	public columns(noBigInt: true): (string | number | ArrayBuffer | null)[];
	public columns(noBigInt: false): Scalar[];
	public columns(noBigInt: boolean): Scalar[];
	public columns(noBigInt?: boolean): Scalar[] {
		const columns = [];
		const count = this.columnCount();
		for (let i = 0; i < count; i++) {
			columns.push(this.columnValue(i, noBigInt ?? false));
		}
		return columns;
	}

	public finalize(): void {
		const rc = this.exports.sqlite3_finalize(this.pStmt);
		this.utils.checkError(rc, this.db.pDb);
		this.pStmt = 0;
		stmtFinalizationRegistry.unregister(this);
	}

	public next(): IteratorResult<Scalar[]> {
		if (!this.step()) {
			return { done: true, value: [] };
		}
		return { done: false, value: this.columns() };
	}

	public [Symbol.iterator](): IterableIterator<Scalar[]> {
		return this;
	}

	public *exec(...values: ExtendedScalar[]): Iterable<Scalar[]> {
		this.reset();
		this.bindValues(...values);
		return this;
	}
}
