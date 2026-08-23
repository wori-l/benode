import type { AnnotationFact } from "@benode/core";

export function stringLiteralValues(
  expression: string,
): readonly string[] {
  const values: string[] = [];
  for (const match of expression.matchAll(/"(?:\\.|[^"\\])*"/gu)) {
    try {
      const parsed: unknown = JSON.parse(match[0]);
      if (typeof parsed === "string") {
        values.push(parsed);
      }
    } catch {
      // Non-literal Java expressions cannot be resolved statically.
    }
  }
  return values;
}

export function annotationStringValues(
  annotation: AnnotationFact,
  name: string,
): readonly string[] {
  return annotation.arguments
    .filter((argument) => argument.name === name)
    .flatMap((argument) => stringLiteralValues(argument.expression));
}
