import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as constants from "node:constants";

import { ExtendedResultCode, LockLevel, OpenFlag, ResultCode } from "../constants.js";
import { SQLiteError } from "../types.js";
import type { VFS, VFSFile } from "./index.js";
import { JSVFS } from "./js.js";

class NodeVFSFile implements VFSFile {
	constructor(readonly fd: number, readonly openFlags: number) {
	}

	read(buffer: Uint8Array, offset: bigint): void {
		if (offset > Number.MAX_SAFE_INTEGER) {
			throw new SQLiteError(ExtendedResultCode.IOERR_READ);
		}
		buffer.fill(0);
		const read = fs.readSync(this.fd, buffer, 0, buffer.byteLength, Number(offset));
		if (read < buffer.byteLength) {
			throw new SQLiteError(ExtendedResultCode.IOERR_SHORT_READ);
		}
	}

	write(buffer: Uint8Array, offset: bigint): void {
		if (offset > Number.MAX_SAFE_INTEGER) {
			throw new SQLiteError(ExtendedResultCode.IOERR_WRITE);
		}
		const written = fs.writeSync(this.fd, buffer, 0, buffer.byteLength, Number(offset));
		if (written < buffer.byteLength) {
			throw new SQLiteError(ExtendedResultCode.IOERR_WRITE);
		}
	}

	close(): void {
		fs.fsyncSync(this.fd);
		fs.closeSync(this.fd);
	}

	lock(lock: LockLevel): void {
		return;
	}

	unlock(lock: LockLevel): void {
		return;
	}

	sync(flags: number): void {
		fs.fsyncSync(this.fd);
	}

	truncate(length: number): void {
		fs.ftruncateSync(this.fd, length);
	}

	fileSize(): number {
		fs.fsyncSync(this.fd);
		const fSize = fs.fstatSync(this.fd).size;
		return fSize;
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

export class NodeVFS extends JSVFS implements VFS {
	constructor(name: string = "node") {
		super(name);
	}

	public randomness(buffer: Uint8Array): void {
		crypto.randomFillSync(buffer);
	}

	public open(path: string, flags: number): VFSFile {
		let ff = 0;
		if (flags & OpenFlag.READONLY) {
			ff |= constants.O_RDONLY;
		} else if (flags & OpenFlag.READWRITE) {
			ff |= constants.O_RDWR;
		}
		if (flags & OpenFlag.CREATE) {
			ff |= constants.O_CREAT;
		}
		const f = fs.openSync(path, ff);
		return new NodeVFSFile(f, flags);
	}

	public fullPathname(p: string): string {
		return path.resolve(p);
	}

	public access(path: string, flags: number): boolean {
		const exists = fs.existsSync(path);
		return exists;
	}

	public delete(path: string, syncDir: boolean): void {
		fs.unlinkSync(path);
	}
}
