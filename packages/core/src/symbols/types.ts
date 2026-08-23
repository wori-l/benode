import type {
  FileFacts,
  IndexedSymbol,
  InvocationFact,
} from "../contracts/contracts.js";
import type { ResolutionConfidence } from "../contracts/model.js";

export interface SymbolContext {
  readonly facts: FileFacts;
  readonly symbol: IndexedSymbol;
}

export interface TypeContext<Role extends string = string>
  extends SymbolContext {
  readonly role: Role;
}

export interface SymbolIndex<Role extends string = string> {
  readonly fileFacts: readonly FileFacts[];
  readonly invocations: readonly InvocationFact[];
  readonly invocationsByOwner: ReadonlyMap<string, readonly InvocationFact[]>;
  readonly symbols: readonly SymbolContext[];
  readonly methods: readonly SymbolContext[];
  readonly symbolsById: ReadonlyMap<string, SymbolContext>;
  readonly types: readonly TypeContext<Role>[];
  readonly typesById: ReadonlyMap<string, TypeContext<Role>>;
  readonly typesByQualifiedName: ReadonlyMap<
    string,
    readonly TypeContext<Role>[]
  >;
  readonly typesBySimpleName: ReadonlyMap<
    string,
    readonly TypeContext<Role>[]
  >;
  readonly parametersByOwner: ReadonlyMap<
    string,
    readonly SymbolContext[]
  >;
  readonly methodsByOwnerNameArity: ReadonlyMap<
    string,
    readonly SymbolContext[]
  >;
  readonly constructorsByOwnerArity: ReadonlyMap<
    string,
    readonly SymbolContext[]
  >;
  readonly variablesByScopeName: ReadonlyMap<string, SymbolContext>;
  readonly implementationsByTypeId: ReadonlyMap<
    string,
    readonly TypeContext<Role>[]
  >;
}

export interface InvocationResolution {
  readonly candidates: readonly SymbolContext[];
  readonly confidence: ResolutionConfidence;
  readonly reason: string;
  readonly fallbackOwnerQualifiedName: string | null;
}

export interface ImplementationSelection<Role extends string = string> {
  readonly types: readonly TypeContext<Role>[];
  readonly reason: string | null;
}
