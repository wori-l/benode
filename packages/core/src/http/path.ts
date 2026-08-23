export function joinHttpPath(prefix: string, suffix: string): string {
  const left = prefix === "/" ? "" : prefix.replace(/\/$/u, "");
  const right = suffix === "/" ? "" : suffix.replace(/^\//u, "");
  const joined = [left, right].filter((part) => part !== "").join("/");
  return joined === "" ? "/" : joined.startsWith("/") ? joined : "/" + joined;
}

export function createEndpointId(handlerId: string): string {
  return "benode:endpoint:" + encodeURIComponent(handlerId);
}
