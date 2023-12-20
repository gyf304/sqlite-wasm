/// <reference lib="dom" />

import { AccessFlag, ExtendedResultCode, LockLevel, OpenFlag, ResultCode } from "../constants.js";
import { SQLiteError } from "../utils.js";
import type { VFS, VFSFile } from "./index.js";
import { JSVFS } from "./js.js";

class XHRVFSFile implements VFSFile {
	private cachedSize: number | undefined;
	constructor(readonly url: string, readonly openFlags: number) {}

	read(buffer: Uint8Array, offset: bigint): void {
		buffer.fill(0);
		const xhr = new XMLHttpRequest();
		xhr.responseType = "arraybuffer";
		xhr.setRequestHeader("Range", `bytes=${offset}-${offset + BigInt(buffer.byteLength) - 1n}`);
		xhr.open("GET", this.url, false);
		xhr.send();
		if (xhr.status !== 206) {
			throw new SQLiteError(ExtendedResultCode.IOERR_READ);
		}
		const data = xhr.response as ArrayBuffer;
		buffer.set(new Uint8Array(data));
		if (data.byteLength < buffer.byteLength) {
			throw new SQLiteError(ExtendedResultCode.IOERR_SHORT_READ);
		}
	}

	write(buffer: Uint8Array, offset: bigint): void {
		throw new SQLiteError(ResultCode.IOERR);
	}

	close(): void {
		return;
	}

	lock(lock: LockLevel): void {
		return;
	}

	unlock(lock: LockLevel): void {
		return;
	}

	sync(flags: number): void {
		return;
	}

	truncate(length: number): void {
		throw new SQLiteError(ResultCode.IOERR);
	}

	fileSize(): number {
		if (this.cachedSize !== undefined) {
			return this.cachedSize;
		}
		const xhr = new XMLHttpRequest();
		xhr.open("HEAD", this.url, false);
		xhr.send();
		if (xhr.status !== 200) {
			throw new SQLiteError(ResultCode.IOERR);
		}
		const contentLength = xhr.getResponseHeader("Content-Length");
		if (contentLength === null) {
			throw new SQLiteError(ResultCode.IOERR);
		}
		this.cachedSize = parseInt(contentLength, 10);
		return this.cachedSize;
	}

	checkReservedLock(): boolean {
		return false;
	}

	sectorSize(): number {
		return 0;
	}

	deviceCharacteristics(): number {
		return 0;
	}

	fileControl(op: number, arg: ArrayBuffer): void {
		throw new SQLiteError(ResultCode.NOTFOUND);
	}
}

export const XHRVFS: VFS = {
	...JSVFS,
	name: "xhr",
	open(path, flags) {
		const url = new URL(path, location.href);
		return new XHRVFSFile(url.href, OpenFlag.READONLY);
	},
	fullPathname(p) {
		return p;
	},
	randomness(buffer) {
		crypto.getRandomValues(buffer);
	},
	access(path, flags) {
		switch (flags) {
			case AccessFlag.READ:
			case AccessFlag.EXISTS:
				const xhr = new XMLHttpRequest();
				xhr.open("HEAD", path, false);
				xhr.send();
				if (xhr.status !== 200) {
					return false;
				}
				return xhr.getResponseHeader("Accept-Ranges") === "bytes";
			case AccessFlag.READWRITE:
				return false;
			default:
				return false;
		}
	},
	delete(path, syncDir) {
		throw new SQLiteError(ResultCode.IOERR);
	}
}
