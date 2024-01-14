import type { Scalar, ExtendedScalar } from "./types";

interface Base {
	nArg?: number;
	deterministic?: boolean;

	func?: (...args: Scalar[]) => ExtendedScalar;
	step?: (...args: Scalar[]) => ExtendedScalar;
	value?: () => Scalar;
	inverse?: (...args: Scalar[]) => ExtendedScalar;
	final?: () => Scalar;
}

export interface ScalarFunction extends Base {
	func: (...args: Scalar[]) => ExtendedScalar;
}

export interface AggregateFunction extends Base {
	step: (...args: Scalar[]) => ExtendedScalar;
	final: () => Scalar;
}

export interface WindowFunction extends Base {
	step: (...args: Scalar[]) => ExtendedScalar;
	value: () => Scalar;
	inverse: (...args: Scalar[]) => ExtendedScalar;
	final: () => Scalar;
}

export type Function = ScalarFunction | AggregateFunction | WindowFunction;
