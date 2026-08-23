import type {
  HttpMethod,
  InvocationResolution as CoreInvocationResolution,
  SymbolContext as CoreSymbolContext,
  SymbolIndex as CoreSymbolIndex,
  TypeContext as CoreTypeContext,
} from "@benode/core";

import type { SpringJavaNodeRole } from "./node-filters.js";

export type SymbolContext = CoreSymbolContext;
export type TypeContext = CoreTypeContext<SpringJavaNodeRole>;
export type SymbolIndex = CoreSymbolIndex<SpringJavaNodeRole>;

export interface RequestMapping {
  readonly methods: readonly HttpMethod[];
  readonly paths: readonly string[];
}

export type InvocationResolution = CoreInvocationResolution;
