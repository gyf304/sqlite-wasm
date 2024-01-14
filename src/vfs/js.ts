import { ResultCode } from "../constants.js";
import { SQLiteError } from "../types.js";
import type { VFS, VFSFile } from "./index.js";

let prevError: SQLiteError = new SQLiteError(ResultCode.OK);

function ioerr(): never {
	prevError = new SQLiteError(ResultCode.IOERR);
	throw prevError;
}

export class JSVFS implements VFS {
	constructor(public readonly name: string = "js") {}

	public randomness(buffer: Uint8Array): void {
		for (let i = 0; i < buffer.length; i++) {
			buffer[i] = Math.random() * 256;
		}
	}

	public sleep(ms: number): void {
		return;
	}

	public currentTime(): number {
		return Date.now() / 86400000 + 2440587.5;
	}

	public open(path: string, flags: number): VFSFile {
		ioerr();
	}

	public delete(path: string, syncDir: boolean): void {
		ioerr();
	}

	public access(path: string, flags: number): boolean {
		ioerr();
	}

	public fullPathname(path: string): string {
		ioerr();
	}
}
