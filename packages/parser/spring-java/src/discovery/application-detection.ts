import {
  uniqueSorted,
  type AnnotationFact,
  type FileFacts,
  type IndexedSymbol,
} from "@benode/core";

import { stringLiteralValues } from "../parser/annotation-values.js";
import {
  COMPONENT_SCAN,
  COMPONENT_SCAN_PACKAGE,
  SPRING_BOOT_APPLICATION,
  SPRING_BOOT_APPLICATION_PACKAGE,
} from "./constants.js";

function hasOfficialImport(
  facts: FileFacts,
  qualifiedName: string,
  packageName: string,
): boolean {
  return facts.imports.some(
    (item) =>
      !item.isStatic &&
      ((item.qualifiedName === qualifiedName && !item.isWildcard) ||
        (item.qualifiedName === packageName && item.isWildcard)),
  );
}

function isOfficialAnnotation(
  annotation: AnnotationFact,
  facts: FileFacts,
  qualifiedName: string,
  packageName: string,
): boolean {
  const simpleName = qualifiedName.slice(qualifiedName.lastIndexOf(".") + 1);
  return annotation.name === qualifiedName ||
    (annotation.name === simpleName &&
      hasOfficialImport(facts, qualifiedName, packageName));
}

export function isSpringBootApplicationType(
  symbol: IndexedSymbol,
  facts: FileFacts,
): boolean {
  if (symbol.kind !== "type" || symbol.ownerSymbolId !== null) {
    return false;
  }

  return symbol.annotations.some((annotation) =>
    isOfficialAnnotation(
      annotation,
      facts,
      SPRING_BOOT_APPLICATION,
      SPRING_BOOT_APPLICATION_PACKAGE,
    )
  );
}

export function applicationSourceNamespaces(
  symbol: IndexedSymbol,
  facts: FileFacts,
): readonly string[] {
  const configured = uniqueSorted(
    symbol.annotations.flatMap((annotation) => {
      const componentScan = isOfficialAnnotation(
        annotation,
        facts,
        COMPONENT_SCAN,
        COMPONENT_SCAN_PACKAGE,
      );
      const springBootApplication = isOfficialAnnotation(
        annotation,
        facts,
        SPRING_BOOT_APPLICATION,
        SPRING_BOOT_APPLICATION_PACKAGE,
      );
      return annotation.arguments
        .filter((argument) =>
          (componentScan && (
            argument.name === null ||
            argument.name === "value" ||
            argument.name === "basePackages"
          )) ||
          (springBootApplication && argument.name === "scanBasePackages")
        )
        .flatMap((argument) => stringLiteralValues(argument.expression));
    }).map((namespace) => namespace.trim()).filter(Boolean),
  );
  if (configured.length > 0) {
    return configured;
  }
  const separator = symbol.symbol.qualifiedName.lastIndexOf(".");
  return [separator < 0 ? "" : symbol.symbol.qualifiedName.slice(0, separator)];
}
