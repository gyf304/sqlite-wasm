import * as fs from "fs/promises";
import { describe, expect, it, beforeAll } from "bun:test";
import { SQLite } from "./sqlite.js";
import { ResultCode } from "./constants.js";
import { NodeVFS } from "./vfs/node.js";
import * as constants from "./constants.js";

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

	it("should support parameterized query", async function() {
		const db = await initDb();
		const stmt = db.prepare("SELECT ?, ?, ?, ?, ?, ?, ?")!;
		stmt.bindValues(1, 1.2, BigInt(1), "TEST", true, new ArrayBuffer(1), null);
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
		const symbol = Symbol();
		expect(() => stmt.bindValues(symbol as any)).toThrow();
		stmt.finalize();
		db.close();
	});

	it("should support exec", async function() {
		const db = await initDb();
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		let count = 0;
		db.exec("SELECT SQLITE_VERSION(); SELECT * FROM test;", () => count++);
		expect(count).toBe(4);
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
		const stmt = db.prepare("SELECT * FROM test")!;
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
		stmt.finalize();
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

	it("should support bigint", async function () {
		const db = await initDb();
		const stmt = db.prepare("SELECT RANDOM()")!;
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
		stmt.finalize();
		db.close();
	});

	it("should support bindInt", async function () {
		const db = await initDb();
		const stmt = db.prepare("SELECT ?")!;
		stmt.bindInt(1, 1);
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(1);
		while (stmt.step()) {
			for (let i = 0; i < columnCount; i++) {
				const col = stmt.columnInt(i);
				expect(col).toBe(1);
			}
		}
		stmt.finalize();
		db.close();
	});

	it("should support arraybuffer", async function () {
		const db = await initDb();
		const stmt = db.prepare("SELECT ?")!;
		const blob = new ArrayBuffer(1);
		stmt.bindValues(blob);
		const columnCount = stmt.columnCount();
		expect(columnCount).toBe(1);
		while (stmt.step()) {
			for (let i = 0; i < columnCount; i++) {
				const col = stmt.columnBlob(i);
				expect(col).toBeInstanceOf(ArrayBuffer);
				expect(col.byteLength).toBe(1);
				const col2 = stmt.columnValue(i);
				expect(col2).toBeInstanceOf(ArrayBuffer);
				const col3 = stmt.columnValue(i, true);
				expect(col3).toBeInstanceOf(ArrayBuffer);
			}
		}
		stmt.finalize();
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
		const stmt = db.prepare("SELECT COUNT(*) FROM test")!;
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
		stmt.finalize();

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
		const stmt = db.prepare("SELECT COUNT(*) FROM test")!;
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
		stmt.finalize();

		db.close();
	});

	it("should sleep", async function() {
		const db = await initDb();
		db.exports.sqlite3_sleep(0);
		db.close();
	});

	it("should support uri", async function() {
		const sqlite = await initSQLite();
		const db = sqlite.open("file::memory:?cache=shared", constants.OPEN_READWRITE | constants.OPEN_URI);
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.close();
	});

	it("should support open with flags", async function() {
		const sqlite = await initSQLite();
		const db = sqlite.open(":memory:", constants.OPEN_READWRITE);
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.close();
	});

	it("should be able to register and unregister vfs", async function() {
		const sqlite = await initSQLite();
		sqlite.registerVFS(NodeVFS);
		sqlite.unregisterVFS(NodeVFS);
	});

	it("should support iterator", async () => {
		const db = await initDb();
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.exec("INSERT INTO test (value) VALUES ('hello')");
		db.exec("INSERT INTO test (value) VALUES ('hello')");

		const stmt = db.prepare("SELECT * FROM test")!;
		let count = 0;
		for (const row of stmt.exec()) {
			expect(row).toBeArrayOfSize(2);
			count++;
		}
		expect(count).toBe(3);
		stmt.finalize();

		db.close();
	});

	describe("Application Defined SQL Functions", () => {
		it("should support scalar function", async function() {
			const db = await initDb();
			db.createFunction("hello", (name) => `hello ${name}`);
			db.exec("SELECT hello('test')", (_, cols) => {
				expect(cols[0]).toBe("hello test");
			});
			db.close();
		});

		it("should support aggregate function", async function() {
			const db = await initDb();
			let count = 0;
			db.createFunction("testcount", {
				step: () => count++,
				final: () => BigInt(count),
			});
			db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
			db.exec("INSERT INTO test (value) VALUES ('hello')");
			db.exec("INSERT INTO test (value) VALUES ('hello')");
			db.exec("SELECT testcount(*) FROM test", (_, cols) => {
				expect(cols[0]).toBe("2");
			});
			db.close();
		});
	}),

	describe("NodeVFS", async function() {
		const sqlite = await initSQLite();
		sqlite.registerVFS(NodeVFS, true);
		// delete file if exists
		await fs.rm("test.db", { force: true });
		const db = sqlite.open("test.db");
		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
		it("should create file", async function() {
			expect(await fs.stat("test.db")).toBeTruthy();
		});
		it("should handle insertions", function() {
			db.exec("INSERT INTO test (value) VALUES ('hello')");
			db.exec("INSERT INTO test (value) VALUES ('hello')");
			db.exec("INSERT INTO test (value) VALUES ('hello')");
			let count = 0;
			db.exec("SELECT * FROM test;", () => count++);
			expect(count).toBe(3);
		});
		it("should handle a lot of insertions", function() {
			for (let i = 0; i < 1000; i++) {
				db.exec("INSERT INTO test (value) VALUES ('hello')");
			}
			let count = 0;
			db.exec("SELECT * FROM test;", () => count++);
			expect(count).toBe(1003);
		});
		it("should handle vacuum", function() {
			db.exec("DELETE FROM test;")
			db.exec("VACUUM");
		});
	});

	// describe("FTS5", () => {
	// 	it("should create fts5 table", async function() {
	// 		const db = await initDb();
	// 		db.exec("CREATE VIRTUAL TABLE test USING fts5(value, tokenize = 'html unicode61 remove_diacritics 1')");
	// 		db.exec("INSERT INTO test (value) VALUES ('hello')");
	// 		db.exec("INSERT INTO test (value) VALUES ('hello')");
	// 		db.exec("INSERT INTO test (value) VALUES ('hello')");
	// 		const rows = db.exec("SELECT * FROM test;");
	// 		expect(rows.length).toBe(3);
	// 		db.close();
	// 	});
	// });

	describe("Utilities", () => {
		it("should handle noop checkError", async function() {
			const sqlite = await initSQLite();
			sqlite.utils.checkError();
		});
		it("should handle checkError with no db", async function() {
			const sqlite = await initSQLite();
			expect(() => sqlite.utils.checkError(ResultCode.ERROR)).toThrow();
		});
	});
});

