import type { SQLiteExports, CString } from "./api";
import { ExtendedResultCode, ResultCode } from "./constants";

export class SQLiteError extends Error {
	constructor(public readonly code: number, message?: string) {
		const parsedCode = ResultCode[code as ResultCode] ?? ExtendedResultCode[code as ExtendedResultCode] ?? "Unknown error";
		super(`SQLite error ${code}: ${parsedCode}${message !== undefined ? `: ${message}` : ""}`);
	}
}

export class SQLiteUtils {
	public readonly textEncoder: TextEncoder;
	public readonly textDecoder: TextDecoder;

	constructor(private exports: SQLiteExports) {
		this.textEncoder = new TextEncoder();
		this.textDecoder = new TextDecoder();
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
		if (buf.length > nBytes) {
			throw new SQLiteError(ResultCode.TOOBIG);
		}
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
