import type { SQLiteExports, CString } from "./api";
import { ExtendedResultCode, ResultCode } from "./constants";
import * as constants from "./constants";
import type { Function } from "./func";
import { ExtendedScalar, Scalar, SQLiteError, toScalar } from "./types";

export function mustGet<T, K>(map: Map<T, K>, key: T): K {
	const value = map.get(key);
	if (value === undefined) {
		throw new Error(`No value for ${key}`);
	}
	return value;
}

const sqliteOK = new SQLiteError(ResultCode.OK);

export class SQLiteUtils {
	public readonly textEncoder: TextEncoder;
	public readonly textDecoder: TextDecoder;
	public readonly ok = sqliteOK;
	private readonly pApi: number;
	private readonly xFree: number;

	constructor(private exports: SQLiteExports) {
		this.textEncoder = new TextEncoder();
		this.textDecoder = new TextDecoder();
		this.pApi = this.exports.sqlite3_get_api_routines();
		this.xFree = this.deref32(this.pApi + 4 * 58);
	}

	public wrapError(fn: (...args: any[]) => void, all?: true): SQLiteError {
		try {
			fn();
			return sqliteOK;
		} catch (e) {
			if (e instanceof SQLiteError) {
				return e;
			}
			if (all === true && e instanceof Error) {
				return new SQLiteError(ResultCode.ERROR, e.message);
			}
			throw e;
		}
	}

	public get dataView() {
		return new DataView(this.exports.memory.buffer);
	}

	public get u8() {
		return new Uint8Array(this.exports.memory.buffer);
	}

	public get u32() {
		return new Uint32Array(this.exports.memory.buffer);
	}

	public malloc(size: number): number {
		return this.exports.sqlite3_malloc(size);
	}

	public free(ptr: number): void {
		this.exports.sqlite3_free(ptr);
	}

	public cString(s: string): CString {
		const buf = this.textEncoder.encode(s);
		const ptr = this.malloc(buf.length + 1);
		if (ptr === 0) {
			throw new SQLiteError(ResultCode.NOMEM);
		}
		const view = this.u8;
		view.set(buf, ptr);
		view[ptr + buf.length] = 0;
		return ptr;
	}

	public setString(ptr: number, nBytes: number, s: string): void {
		const view = this.u8;
		const buf = this.textEncoder.encode(s);
		view.set(buf, ptr);
		view[ptr + buf.length] = 0;
	}

	public decodeString(ptr: number): string {
		const view = this.u8;
		let end = ptr;
		while (view[end] !== 0) {
			end++;
		}
		const buf = view.slice(ptr, end);
		return this.textDecoder.decode(buf);
	}

	public deref32(ptr: number): number {
		const view = this.u32;
		return view[(ptr / 4) | 0];
	}

	public decodeValue(pValue: number): Scalar {
		const type = this.exports.sqlite3_value_type(pValue);
		switch (type) {
			case constants.INTEGER:
				return this.exports.sqlite3_value_int64(pValue);
			case constants.FLOAT:
				return this.exports.sqlite3_value_double(pValue);
			case constants.TEXT:
				return this.decodeString(this.exports.sqlite3_value_text(pValue));
			case constants.BLOB: {
				const size = this.exports.sqlite3_value_bytes(pValue);
				const ptr = this.exports.sqlite3_value_blob(pValue);
				const view = this.u8;
				return view.slice(ptr, ptr + size).buffer as ArrayBuffer;
			}
			case constants.NULL:
				return null;
			default:
				throw new SQLiteError(ResultCode.ERROR, `Unknown value type: ${type}`);
		}
	}

	public functionShim(func: (...args: Scalar[]) => ExtendedScalar, pCtx: number, iArgc?: number, ppArgv?: number) {
		const values: Scalar[] = [];
		if (iArgc !== undefined && ppArgv !== undefined) {
			for (let i = 0; i < iArgc; i++) {
				const pValue = this.deref32(ppArgv + i * 4);
				values.push(this.decodeValue(pValue));
			}
		}
		const err = this.wrapError(() => {
			const ret = toScalar(func(...values));
			if (ret === undefined) {
				this.exports.sqlite3_result_null(pCtx);
			} else {
				switch (typeof ret) {
					case "bigint":
						this.exports.sqlite3_result_int64(pCtx, ret);
						break;
					case "number":
						this.exports.sqlite3_result_double(pCtx, ret);
						break;
					case "string": {
						this.exports.sqlite3_result_text(pCtx, this.cString(ret), -1, this.xFree);
						break;
					}
					case "object": {
						if (ret === null) {
							this.exports.sqlite3_result_null(pCtx);
							break;
						}
						if (ret instanceof ArrayBuffer) {
							const ptr = this.malloc(ret.byteLength);
							if (ptr === 0) {
								throw new SQLiteError(ResultCode.NOMEM);
							}
							const view = this.u8;
							view.set(new Uint8Array(ret), ptr);
							this.exports.sqlite3_result_blob(pCtx, ptr, ret.byteLength, this.xFree);
							break;
						}
						throw new SQLiteError(ResultCode.ERROR, `Unknown return type: ${typeof ret}`);
					}
					default:
						throw new SQLiteError(ResultCode.ERROR, `Unknown return type: ${typeof ret}`);
				}
			}
		}, true);
		if (err !== sqliteOK) {
			if (err.rawMessage === undefined || err.code !== ResultCode.ERROR) {
				this.exports.sqlite3_result_error_code(pCtx, err.code);
			} else {
				const zErrMsg = this.cString(err.rawMessage);
				this.exports.sqlite3_result_error(pCtx, zErrMsg, -1);
				this.free(zErrMsg);
			}
		}
	}

	public lastError(dbPtr: number): SQLiteError | undefined {
		const code = this.exports.sqlite3_errcode(dbPtr);
		if (code === ResultCode.OK) {
			return undefined;
		}
		const extendedCode = this.exports.sqlite3_extended_errcode(dbPtr);
		const message = this.decodeString(this.exports.sqlite3_errmsg(dbPtr));
		return new SQLiteError(extendedCode || code, message);
	}

	public checkError(rc?: number, dbPtr?: number): void {
		if (rc === undefined && dbPtr === undefined) {
			return;
		}
		if (rc === ResultCode.OK || rc === ResultCode.ROW || rc === ResultCode.DONE) {
			return;
		}
		if (dbPtr === undefined) {
			throw new SQLiteError(rc!);
		}
		const error = this.lastError(dbPtr);
		if (error !== undefined) {
			throw error;
		}
	}
}
