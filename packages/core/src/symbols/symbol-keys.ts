export function memberKey(
  ownerId: string,
  name: string,
  arity: number,
): string {
  return ownerId + "\u0000" + name + "\u0000" + arity.toString();
}

export function constructorKey(ownerId: string, arity: number): string {
  return ownerId + "\u0000" + arity.toString();
}

export function variableKey(scopeId: string, name: string): string {
  return scopeId + "\u0000" + name;
}
