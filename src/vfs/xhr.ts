/// <reference lib="dom" />

import { AccessFlag, ExtendedResultCode, LockLevel, OpenFlag, ResultCode } from "../constants.js";
import { SQLiteError } from "../types.js";
import type { VFS, VFSFile } from "./index.js";
import { JSVFS } from "./js.js";
import * as constants from "../constants.js";

const xhrExistCache = new Map<string, boolean>();

class XHRVFSFile implements VFSFile {
	private cachedSize: number | undefined;
	constructor(readonly url: string, readonly openFlags: number) {}

	read(buffer: Uint8Array, offset: bigint): void {
		buffer.fill(0);
		const xhr = new XMLHttpRequest();
		xhr.open("GET", this.url, false);
		xhr.responseType = "arraybuffer";
		xhr.setRequestHeader("Range", `bytes=${offset}-${offset + BigInt(buffer.byteLength) - 1n}`);
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
		const supportedFlags = 0
			| constants.OPEN_READONLY
			| constants.OPEN_MAIN_DB
			| constants.OPEN_URI
			;
		if ((flags & supportedFlags) !== flags) {
			throw new SQLiteError(ResultCode.IOERR);
		}
		const url = new URL(path, location.href);
		url.search = "";
		return new XHRVFSFile(url.href, flags);
	},
	fullPathname(p) {
		return p;
	},
	randomness(buffer) {
		crypto.getRandomValues(buffer);
	},
	access(path, flags) {
		const url = new URL(path, location.href);
		const mode = url.searchParams.get("mode");
		if (mode !== null && mode !== "ro") {
			return false;
		}
		url.search = "";
		path = url.href;

		let result = false;
		switch (flags) {
			case AccessFlag.READ:
			case AccessFlag.EXISTS:
				if (xhrExistCache.has(path)) {
					result = xhrExistCache.get(path)!;
				} else {
					const xhr = new XMLHttpRequest();
					xhr.open("HEAD", path, false);
					xhr.send();
					result = xhr.status === 200;
					xhrExistCache.set(path, result);
				}
		}
		return result;
	},
	delete() {
		throw new SQLiteError(ResultCode.IOERR);
	}
}
