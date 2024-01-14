import { ExtendedResultCode, ResultCode } from "./constants";

type JSONScalar = string | number | boolean | null;

export type Scalar = string | number | bigint | ArrayBuffer | null;
export type ExtendedScalar = Scalar | boolean | undefined | { toJSON(): JSONScalar } | { toString(): string };

export function toScalar(value: ExtendedScalar): Scalar {
	switch (typeof value) {
		case "bigint":
		case "number":
		case "string":
			return value;
		case "object":
			if (value === null) {
				return null;
			} else if (value instanceof ArrayBuffer) {
				return value;
			} else if ("toJSON" in value) {
				const val = value.toJSON();
				if (typeof val === "boolean") {
					return val ? 1 : 0;
				}
				return val;
			} else if ("toString" in value) {
				return value.toString();
			}
			throw new SQLiteError(ResultCode.MISUSE, `Unknown return object type`);
		case "boolean":
			return value ? 1 : 0;
		case "undefined":
			return null;
		default:
			throw new SQLiteError(ResultCode.MISUSE, `Unknown return type: ${typeof value}`);
	}
}

export class SQLiteError extends Error {
	public readonly parsedCode?: string;
	public readonly rawMessage?: string;

	constructor(public readonly code: number, message?: string) {
		const parsedCode = ResultCode[code as ResultCode] ?? ExtendedResultCode[code as ExtendedResultCode] ?? undefined;
		super(message ?? parsedCode);
		this.parsedCode = parsedCode;
		this.rawMessage = message;
	}
}
