import * as fs from "fs/promises";

const PREFIX = "SQLITE_";

const preamble = `/* auto-generated, do not edit */

`;


const sqliteHeaderFilename = "./sqlite/sqlite3.h";
const sqliteWasmHeaderFilename = "./sqlite/sqlite3wasm.h";

const sqliteHeader = await fs.readFile(sqliteHeaderFilename, "utf-8");
const sqliteWasmHeader = await fs.readFile(sqliteWasmHeaderFilename, "utf-8");

const inLines = [
	...sqliteHeader.split("\n"),
	...sqliteWasmHeader.split("\n"),
];

const constants = new Map<string, number>();
const groups = new Map<string, Set<string>>();
let capi3Ref = "";

for (let line of inLines) {
	line = line.trim();
	const capi3RefMatch = /CAPI3REF: (.*)/.exec(line);
	if (capi3RefMatch) {
		capi3Ref = capi3RefMatch[1];
		continue;
	}
	if (line === "") {
		capi3Ref = "";
	}
	const match = /^# *define +(SQLITE_[A-Z0-9_]+) +([0-9]+|0x[0-9A-Fa-f]+)( .*|$)/.exec(line);
	// special case for value (SQLITE_ERROR | (1<<8))
	const specialMatch = /^# *define +(SQLITE_[A-Z0-9_]+) +\((SQLITE_[A-Z0-9_]*) \| \(([0-9]+)<<([0-9]+)\)\)( .*|$)/.exec(line);
	if (match) {
		const name = match[1].slice(PREFIX.length);
		const value = match[2];
		constants.set(name, Number(value));

		if (capi3Ref !== "") {
			let group = groups.get(capi3Ref);
			if (!group) {
				group = new Set();
				groups.set(capi3Ref, group);
			}
			group.add(name);
		}
	} else if (specialMatch) {
		const name = specialMatch[1].slice(PREFIX.length);
		const valueBase = specialMatch[2].slice(PREFIX.length);
		const valueL = specialMatch[3];
		const valueShift = specialMatch[4];
		const value = constants.get(valueBase)! | (Number(valueL) << Number(valueShift));
		constants.set(name, value);

		if (capi3Ref !== "") {
			let group = groups.get(capi3Ref);
			if (!group) {
				group = new Set();
				groups.set(capi3Ref, group);
			}
			group.add(name);
		}
	}
}

const outLines = [...preamble];

for (const [name, value] of constants) {
	outLines.push(`export const ${name} = ${value};\n`);
}

outLines.push("\n");

const groupMappings = {
	"Result Codes": "ResultCode",
	"Extended Result Codes": "ExtendedResultCode",
	"Fundamental Datatypes": "Datatype",
	"Flags For File Open Operations": "OpenFlag",
	"Flags for the xAccess VFS method": "AccessFlag",
	"Device Characteristics": "DeviceCharacteristics",
	"Synchronization Type Flags": "SyncFlag",
	"File Locking Levels": "LockLevel",
};

for (const [group, names] of groups) {
	const mapping = groupMappings[group];
	if (mapping === undefined) {
		continue;
	}
	if (names.size === 0) {
		continue;
	}
	outLines.push(`export const ${mapping} = {\n`);
	let commonPrefix = names.keys().next().value.split("_")[0];
	if (Array.from(names).every((x) => x.startsWith(commonPrefix))) {
		commonPrefix = commonPrefix + "_";
	} else {
		commonPrefix = "";
	}
	console.log(group, commonPrefix);
	for (const name of names) {
		outLines.push(`\t"${name.slice(commonPrefix.length)}": ${name},\n`);
	}
	// inverse
	for (const name of names) {
		outLines.push(`\t[${name}]: "${name.slice(commonPrefix.length)}",\n`);
	}
	outLines.push("} as const;\n");
	outLines.push(`export type ${mapping} = typeof ${mapping}[keyof typeof ${mapping} & string];\n`);
	outLines.push("\n");
}

await fs.writeFile("./src/constants.ts", outLines.join(""));
