export interface StableApplicationIdInput {
  readonly moduleRelativeUri: string;
  readonly entryPointQualifiedName: string;
}

export interface StableSymbolIdInput {
  readonly applicationId: string;
  readonly relativeUri: string;
  readonly qualifiedSignature: string;
}

export function normalizeRelativeUri(relativeUri: string): string {
  const normalizedSegments: string[] = [];

  for (const segment of relativeUri.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (
        normalizedSegments.length > 0 &&
        normalizedSegments.at(-1) !== ".."
      ) {
        normalizedSegments.pop();
      } else {
        normalizedSegments.push(segment);
      }
      continue;
    }

    normalizedSegments.push(segment);
  }

  return normalizedSegments.join("/");
}

export function createStableSymbolId(input: StableSymbolIdInput): string {
  const parts = [
    input.applicationId.normalize("NFC"),
    normalizeRelativeUri(input.relativeUri).normalize("NFC"),
    input.qualifiedSignature.normalize("NFC"),
  ];

  return "benode:symbol:" + parts.map(encodeURIComponent).join(":");
}

export function createStableApplicationId(
  input: StableApplicationIdInput,
): string {
  const normalizedModuleUri = normalizeRelativeUri(
    input.moduleRelativeUri,
  );
  const parts = [
    normalizedModuleUri === "" ? "." : normalizedModuleUri,
    input.entryPointQualifiedName,
  ];

  return (
    "benode:application:" +
    parts
      .map((part) => encodeURIComponent(part.normalize("NFC")))
      .join(":")
  );
}
