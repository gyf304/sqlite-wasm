import { AccessFlag, LockLevel, SyncFlag } from "../constants";
import type { SQLiteError } from "../types";

export interface VFS {
	/**
	 * The name of the VFS
	 */
	readonly name: string;

	/**
	 * Opens a file
	 * @param path The path to open
	 * @param flags The flags to open with
	 * @returns The opened file
	 * @throws {SQLiteError} If the file could not be opened
	 */
	open: (path: string, flags: number) => VFSFile;

	/**
	 * Deletes a file
	 * @param path The path to delete
	 * @param syncDir Whether to sync the directory
	 * @throws {SQLiteError} If the file could not be deleted
	 */
	delete: (path: string, syncDir: boolean) => void;

	/**
	 * Checks if a file exists
	 * @param path The path to check
	 * @param flags The flags to open with
	 * @returns Whether the file exists
	 * @throws {SQLiteError} If the file could not be checked
	 */
	access: (path: string, flags: AccessFlag) => boolean;

	/**
	 * Gets the full path of a file
	 * @param path The path to get the full path of
	 * @returns The full path of the file
	 * @throws {SQLiteError} If the full path could not be retrieved
	 */
	fullPathname: (path: string) => string;

	/**
	 * Gets random data
	 * @param buffer The buffer to write into
	 * @throws {SQLiteError} If the random data could not be retrieved
	 */
	randomness: (buffer: Uint8Array) => void;

	/**
	 * Sleeps for a certain amount of time
	 * @param microseconds The amount of time to sleep for
	 * @throws {SQLiteError} If the sleep failed
	 */
	sleep: (microseconds: number) => void;

	/**
	 * Gets the current time
	 * @returns The current time
	 * @throws {SQLiteError} If the current time could not be retrieved
	 */
	currentTime: () => number;
}

export interface VFSFile {
	readonly openFlags: number;

	/**
	 * Closes the file
	 * @throws {SQLiteError} If the file could not be closed
	 */
	close: () => void;

	/**
	 * Reads data from the file
	 * @param buffer The buffer to read into
	 * @param offset The offset to read at
	 * @throws {SQLiteError} If the file could not be read from
	 */
	read: (buffer: Uint8Array, offset: bigint) => void;

	/**
	 * Writes data to the file
	 * @param buffer The buffer to write from
	 * @param offset The offset to write at
	 * @throws {SQLiteError} If the file could not be written to
	 */
	write: (buffer: Uint8Array, offset: bigint) => void;

	/**
	 * Truncates the file
	 * @param length The length to truncate to
	 * @throws {SQLiteError} If the file could not be truncated
	 */
	truncate: (length: number) => void;

	/**
	 * Syncs the file
	 * @param flags The flags to sync with
	 * @throws {SQLiteError} If the file could not be synced
	 */
	sync: (flags: SyncFlag) => void;

	/**
	 * Gets the file size
	 * @returns The file size
	 * @throws {SQLiteError} If the file size could not be retrieved
	 */
	fileSize: () => number;

	/**
	 * Locks the file
	 * @param lock The lock to use
	 * @throws {SQLiteError} If the file could not be locked
	 */
	lock: (lock: LockLevel) => void;

	/**
	 * Unlocks the file
	 * @param lock The lock to unlock
	 * @throws {SQLiteError} If the file could not be unlocked
	 */
	unlock: (lock: LockLevel) => void;

	/**
	 * Checks if the file is locked
	 * @returns Whether the file is locked
	 * @throws {SQLiteError} If the file could not be checked
	 */
	checkReservedLock: () => boolean;

	/**
	 * Controls the file
	 * @param op The operation to perform
	 * @param arg The argument to pass
	 * @returns The result of the operation
	 * @throws {SQLiteError} If the file could not be controlled
	 */
	fileControl: (op: number, arg: ArrayBuffer) => void;

	/**
	 * Gets the sector size
	 * @returns The sector size
	 * @throws {SQLiteError} If the sector size could not be retrieved
	 */
	sectorSize: () => number;

	/**
	 * Gets the device characteristics
	 * @returns The device characteristics
	 * @throws {SQLiteError} If the device characteristics could not be retrieved
	 */
	deviceCharacteristics: () => number;
}
