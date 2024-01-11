import * as fs from "node:fs/promises";
import readline from "node:readline/promises";

import * as sqlite from "../src/index";
import { NodeVFS } from "../src/vfs/node";

const wasmFile = await fs.readFile("dist/wasm/sqlite3.wasm");
const module = await WebAssembly.compile(wasmFile);
const instance = await sqlite.SQLite.instantiate(module);
instance.registerVFS(NodeVFS, true);
let db: sqlite.Database = instance.open(":memory:");

console.log(`SQLite-WASM version ${db.exec("SELECT sqlite_version()")[0][0].value}`);
console.log(`Enter ".help" for usage hints.`);

const prompt = "sqlite> ";
const continuePrompt = "   ...> ";

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: prompt,
});

let sql = "";

async function *rlAiter() {
	const resolves: ((line: string | null) => void)[] = [];
	let resolve = (line: string | null) => {
		if (resolves.length > 0) {
			resolves.shift()!(line);
		}
	};
	rl.on("line", (line) => {
		resolve(line);
	});
	rl.on("close", () => {
		resolve(null);
	});
	while (true) {
		rl.setPrompt(sql === "" ? prompt : continuePrompt);
		rl.prompt();
		const promise = new Promise<string | null>((resolve) => {
			resolves.push(resolve);
		});
		const result = await promise;
		if (result === null) {
			break;
		}
		yield result;
	}
}

interface Command {
	args: string[];
	help: string;
	impl: (...args: string[]) => void | Promise<void>;
}

const commands: Map<string, Command> = new Map(Object.entries({
	help: {
		args: [],
		help: "Shows this help",
		impl: () => {
			for (const [name, command] of commands) {
				const l = `.${name} ${command.args.join(" ")}`;
				console.log(`${l.padEnd(24)} ${command.help}`);
			}
		}
	},
	open: {
		args: ["PATH"],
		help: "Opens a database",
		impl: (path: string) => {
			if (db !== undefined) {
				db.close();
			}
			db = instance.open(path);
		},
	},
	load: {
		args: ["PATH"],
		help: "Loads a WASM extension",
		impl: async (path: string) => {
			const wasmBuffer = await fs.readFile(path);
			const wasmModule = await WebAssembly.compile(wasmBuffer);
			db.loadExtension(wasmModule);
		},
	},
	exit: {
		args: [],
		help: "Exits the REPL",
		impl: () => {
			process.exit(0);
		},
	},
	quit: {
		args: [],
		help: "Exits the REPL",
		impl: () => {
			process.exit(0);
		},
	},
	readcount: {
		args: [],
		help: "Gets the read counter",
		impl: () => {
			console.log(instance.readCounter);
		},
	},
	writecount: {
		args: [],
		help: "Gets the write counter",
		impl: () => {
			console.log(instance.writeCounter);
		},
	},
}));

for await (const line of rlAiter()) {
	if (line.startsWith(".")) {
		const args = line.split(" ");
		const cmd = args[0].slice(1);
		const command = commands.get(cmd);
		if (command === undefined) {
			console.error(`Unknown command ${cmd}`);
			continue;
		}
		const minArgCount = command.args.filter((arg) => arg.endsWith("?")).length;
		const maxArgCount = command.args.length;
		const restArgs = args.slice(1);
		if (restArgs.length < minArgCount) {
			console.error(`Too few arguments to command ${cmd}`);
			continue;
		}
		if (restArgs.length > maxArgCount) {
			console.error(`Too many arguments to command ${cmd}`);
			continue;
		}
		await command.impl(...restArgs);
	} else if (line.trim() === "") {
		continue;
	} else {
		try {
			sql += line;
			if (sql.trim().endsWith(";")) {
				const result = db.exec(sql);
				if (result !== undefined && result.length > 0) {
					for (const row of result) {
						console.log(row.map((col) => col.value ?? "").join("|"));
					}
				}
				sql = "";
			}
		} catch (err) {
			sql = "";
			if (err instanceof sqlite.Error) {
				console.error(err.message);
			} else {
				throw err;
			}
		}
	}
}
