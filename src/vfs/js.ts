import { ResultCode } from "../constants.js";
import { SQLiteError } from "../utils.js";
import type { VFS } from "./index.js";

let prevError: SQLiteError = new SQLiteError(ResultCode.OK);

function ioerr(): never {
	prevError = new SQLiteError(ResultCode.IOERR);
	throw prevError;
}

export const JSVFS: VFS = {
	name: "js",
	open: ioerr,
	delete: ioerr,
	access: ioerr,
	fullPathname: ioerr,
	randomness(buffer) {
		for (let i = 0; i < buffer.length; i++) {
			buffer[i] = Math.random() * 256;
		}
	},
	sleep() {
		return;
	},
	currentTime() {
		return Date.now() / 86400000 + 2440587.5;
	},
}
