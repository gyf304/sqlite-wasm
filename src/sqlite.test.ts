import * as fs from "fs/promises";
import { describe, expect, it, beforeAll } from "bun:test";
import { SQLite, SQLiteResultCodes } from "./index.js";

async function initModule() {
	const wasm = await fs.readFile("./sqlite/sqlite3.wasm");
	const module = await WebAssembly.compile(wasm);
	return module;
}

const modulePromise = initModule();

async function initSQLite() {
	const module = await modulePromise;
	return await SQLite.instantiate(module);
}

async function initDb() {
	const sqlite = await initSQLite();
	return sqlite.open(":memory:");
}

beforeAll(async () => {
	// remove crypto to test fallback
	globalThis.crypto = {} as any;
});

describe("SQLite", function () {
	it("should support synchronous init", async function() {
		const module = await modulePromise;
		const sqlite = SQLite.instantiate(module, false);
		const db = sqlite.open(":memory:");
		const stmt = db.prepare("SELECT SQLITE_VERSION()")!;
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(1);
		const values: string[] = [];
		while (stmt.step()) {
			for (let i = 0; i < columnCount; i++) {
				values.push(stmt.columnText(i));
			}
		}
		expect(values.length).toBe(1);
		expect(values[0]).toStartWith("3.");
		stmt.finalize();
		db.close();
		sqlite.shutdown();
	});

	it("should crash on file open", async function() {
		const module = await modulePromise;
		const sqlite = await SQLite.instantiate(module);
		expect(() => sqlite.open("nosuchfile")).toThrow();
	});

	it("should return version", async function() {
		const db = await initDb();
		const stmt = db.prepare("SELECT SQLITE_VERSION()")!;
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(1);
		const values: string[] = [];
		while (stmt.step()) {
			for (let i = 0; i < columnCount; i++) {
				values.push(stmt.columnText(i));
				expect(stmt.columnName(i)).toBe("SQLITE_VERSION()");
			}
		}
		expect(values.length).toBe(1);
		expect(values[0]).toStartWith("3.");
		stmt.finalize();
		db.close();
	});

	it("should return current time", async function() {
		const db = await initDb();
		const stmt = db.prepare("SELECT DATETIME()")!;
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(1);
		const values: string[] = [];
		while (stmt.step()) {
			for (let i = 0; i < columnCount; i++) {
				values.push(stmt.columnText(i));
			}
		}
		expect(values.length).toBe(1);
		expect(values[0]).toStartWith("20");
		stmt.finalize();
		db.close();
	});

	it("should support consts", async function() {
		const db = await initDb();
		const stmt = db.prepare(`SELECT 1, 1.2, TRUE, 'TEST'`)!;
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(4);
		const values: string[] = [];
		while (stmt.step()) {
			for (let i = 0; i < columnCount; i++) {
				values.push(stmt.columnText(i));
			}
		}
		expect(values.length).toBe(4);
		stmt.finalize();
		db.close();
	});

	it("should support randomness", async function() {
		const db = await initDb();
		const stmt = db.prepare("SELECT RANDOM(), RANDOM()")!;
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(2);
		const values: string[] = [];
		while (stmt.step()) {
			for (let i = 0; i < columnCount; i++) {
				values.push(stmt.columnText(i));``
			}
		}
		expect(values.length).toBe(2);
		expect(values[0]).not.toEqual(values[1]);
		stmt.finalize();
		db.close();
	});

	it("should support randomness with crypto", async function() {
		const module = await modulePromise;
		globalThis.crypto = {
			getRandomValues: (x: ArrayBuffer) => require("crypto").randomFillSync(x)
		} as any;
		const sqlite = SQLite.instantiate(module, false);
		const db = sqlite.open(":memory:");
		const stmt = db.prepare("SELECT RANDOM(), RANDOM()")!;
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(2);
		const values: string[] = [];
		while (stmt.step()) {
			for (let i = 0; i < columnCount; i++) {
				values.push(stmt.columnText(i));
			}
		}
		expect(values.length).toBe(2);
		expect(values[0]).not.toEqual(values[1]);
		stmt.finalize();
		db.close();
	});

	it("should support parameterized query", async function() {
		const db = await initDb();
		const stmt = db.prepare("SELECT ?, ?, ?, ?, ?, ?, ?")!;
		stmt.bindValues([1, 1.2, BigInt(1), "TEST", true, new ArrayBuffer(1), null]);
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(7);
		const values: any[] = [];
		while (stmt.step()) {
			values.push(...stmt.columns());
		}
		stmt.reset();
		expect(values.length).toBe(7);
		expect(values[0]).toBe(1);
		expect(values[3]).toBe("TEST");
		stmt.finalize();

		db.close();
	});

	it("should throw if binding unsupported type", async function() {
		const db = await initDb();
		const stmt = db.prepare("SELECT ?")!;
		expect(() => stmt.bindValues([{} as any])).toThrow();
		stmt.finalize();
		db.close();
	});

	it("should support exec", async function() {
		const db = await initDb();
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		const rows = db.exec("SELECT SQLITE_VERSION(); SELECT * FROM test;");
		expect(rows.length).toBe(4);
		db.close();
	});

	it("should catch error in exec", async function() {
		const db = await initDb();
		expect(() => db.exec("SELECT * FROM nope")).toThrow();
		db.close();
	});

	it("should catch error in prepare", async function() {
		const db = await initDb();
		expect(() => db.prepare("SELECT * FROM nope")).toThrow();
		db.close();
	});

	it("should support decltype", async function() {
		const db = await initDb();
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT, nodecl)");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.prepare("SELECT * FROM test", (stmt) => {
			const columnCount = stmt.columnCount();
			expect(columnCount).toBe(3);
			while (stmt.step()) {
				for (let i = 0; i < columnCount; i++) {
					const decltype = stmt.columnDecltype(i);
					switch (i) {
						case 0:
							expect(decltype).toBe("INTEGER");
							break;
						case 1:
							expect(decltype).toBe("TEXT");
							break;
						case 2:
							expect(decltype).toBe(null)
							break;
					}
				}
			}
		});
		db.close();
	});

	it("should support prepare with multiple statements", async function() {
		const db = await initDb();
		const stmt = db.prepare("SELECT DATETIME(); SELECT DATETIME(); SELECT DATETIME()")!;
		expect(stmt.sql).toBe("SELECT DATETIME();");
		expect(stmt.tail).toBe(" SELECT DATETIME(); SELECT DATETIME()");
		stmt.finalize();
		db.close();
	});

	it("should crash on improper use of step", async function() {
		const db = await initDb();
		const stmt = db.prepare("SELECT DATETIME();")!;
		stmt.finalize();
		expect(() => stmt.step()).toThrow();
		db.close();
	});

	it("should support prepare with callback", async function() {
		const db = await initDb();
		let count = 0;
		db.prepare("SELECT DATETIME(); SELECT DATETIME(); SELECT DATETIME()", (stmt) => {
			const columnCount = stmt.columnCount();
			expect(columnCount).toBe(1);
			const values: string[] = [];
			while (stmt.step()) {
				for (let i = 0; i < columnCount; i++) {
					values.push(stmt.columnText(i));
				}
			}
			expect(values.length).toBe(1);
			expect(values[0]).toStartWith("20");
			count += 1;
		});
		expect(count).toBe(3);
		db.close();
	});

	it("should support bigint", async function () {
		const db = await initDb();
		db.prepare("SELECT RANDOM()", (stmt) => {
			const columnCount = stmt.columnCount();
			expect(columnCount).toBe(1);
			while (stmt.step()) {
				for (let i = 0; i < columnCount; i++) {
					const col = stmt.columnInt64(i);
					expect(col).toBeTypeOf("bigint");
					const col2 = stmt.columnValue(i);
					expect(col2).toBeTypeOf("bigint");
					const col3 = stmt.columnValue(i, true);
					expect(col3).toBeTypeOf("number");
				}
			}
		});
		db.close();
	});

	it("should support prepare with a noop query", async function() {
		const db = await initDb();
		let count = 0;
		db.prepare(";;;;;", () => {
			count += 1;
		});
		expect(count).toBe(0);
		db.close();
	});

	it("should serialize and deserialize", async function() {
		const db = await initDb();
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		const buf = db.serialize();
		const textDecoder = new TextDecoder();
		if (buf === null) {
			throw new Error("serialize failed");
		}
		const text = textDecoder.decode(buf.slice(0, 16));
		expect(text).toBe("SQLite format 3\x00");

		db.exec("INSERT INTO test (value) VALUES ('hello2')");

		db.deserialize(buf);
		db.prepare("SELECT COUNT(*) FROM test", (stmt) => {
			const columnCount = stmt.columnCount();
			expect(columnCount).toBe(1);
			const values: number[] = [];
			while (stmt.step()) {
				for (let i = 0; i < columnCount; i++) {
					values.push(stmt.columnInt(i));
				}
			}
			expect(values.length).toBe(1);
			expect(values[0]).toBe(1);
		});

		db.close();
	});

	it("should serialize and load", async function() {
		const sqlite = await initSQLite();
		let db = sqlite.open(":memory:");
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		const buf = db.serialize();
		const textDecoder = new TextDecoder();
		if (buf === null) {
			throw new Error("serialize failed");
		}
		const text = textDecoder.decode(buf.slice(0, 16));
		expect(text).toBe("SQLite format 3\x00");

		db.exec("INSERT INTO test (value) VALUES ('hello2')");
		db.close();

		db = sqlite.load(buf);
		db.prepare("SELECT COUNT(*) FROM test", (stmt) => {
			const columnCount = stmt.columnCount();
			expect(columnCount).toBe(1);
			const values: number[] = [];
			while (stmt.step()) {
				for (let i = 0; i < columnCount; i++) {
					values.push(stmt.columnInt(i));
				}
			}
			expect(values.length).toBe(1);
			expect(values[0]).toBe(1);
		});

		db.close();
	});

	it("should handle error in statement callback", async function() {
		const db = await initDb();
		expect(() => {
			db.prepare("SELECT 1", () => {
				throw new Error("test");
			})
		}).toThrow();
		db.close();
	});

	describe("Utilities", () => {
		it("should handle noop checkError", async function() {
			const sqlite = await initSQLite();
			sqlite.utils.checkError();
		});
		it("should handle checkError with no db", async function() {
			const sqlite = await initSQLite();
			expect(() => sqlite.utils.checkError(SQLiteResultCodes.SQLITE_ERROR)).toThrow();
		});
	});
});

