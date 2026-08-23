import {
  createEndpointId,
  joinHttpPath,
  uniqueSorted,
  type AnnotationFact,
  type EndpointDescriptor,
  type HttpMethod,
} from "@benode/core";

import {
  hasAnnotation,
  annotationQualifiedName,
} from "./annotations.js";
import { stringLiteralValues } from "../parser/annotation-values.js";
import {
  CONTROLLER,
  FIXED_MAPPING_METHODS,
  KNOWN_REQUEST_METHODS,
  REQUEST_MAPPING,
  RESPONSE_BODY,
  REST_CONTROLLER,
} from "./constants.js";
import { ownerType } from "./symbol-lookup.js";
import type {
  RequestMapping,
  SymbolContext,
  SymbolIndex,
} from "./types.js";

function mappingFromAnnotation(
  annotation: AnnotationFact,
  context: SymbolContext,
): RequestMapping | null {
  const qualifiedName = annotationQualifiedName(annotation, context);
  const fixedMethod = FIXED_MAPPING_METHODS.get(qualifiedName);
  if (fixedMethod === undefined && qualifiedName !== REQUEST_MAPPING) {
    return null;
  }

  const paths = uniqueSorted(
    annotation.arguments
      .filter(
        (argument) =>
          argument.name === null ||
          argument.name === "path" ||
          argument.name === "value",
      )
      .flatMap((argument) => stringLiteralValues(argument.expression)),
  );
  const methodExpression = annotation.arguments.find(
    (argument) => argument.name === "method",
  )?.expression;
  const requestedMethods =
    methodExpression === undefined
      ? []
      : [...methodExpression.matchAll(/RequestMethod\.(\w+)/gu)]
          .map((match) => match[1])
          .filter(
            (value): value is HttpMethod =>
              value !== undefined &&
              KNOWN_REQUEST_METHODS.has(value as HttpMethod),
          );

  return {
    methods:
      fixedMethod === undefined
        ? uniqueSorted(
            requestedMethods.length === 0 ? ["ANY"] : requestedMethods,
          )
        : [fixedMethod],
    paths: paths.length === 0 ? [""] : paths,
  };
}

function mappingsFor(
  context: SymbolContext,
): readonly RequestMapping[] {
  return context.symbol.annotations
    .map((annotation) => mappingFromAnnotation(annotation, context))
    .filter((mapping): mapping is RequestMapping => mapping !== null);
}

export function requestMappingMetadata(
  context: SymbolContext,
): Pick<EndpointDescriptor, "httpMethods" | "paths"> {
  const mappings = mappingsFor(context);
  return {
    httpMethods: uniqueSorted(
      mappings.flatMap((mapping) => mapping.methods),
    ),
    paths: mappingPaths(mappings),
  };
}

function isEndpointController(
  controller: SymbolContext,
  method: SymbolContext,
): boolean {
  return (
    hasAnnotation(controller, REST_CONTROLLER) ||
    hasAnnotation(controller, CONTROLLER) ||
    hasAnnotation(controller, RESPONSE_BODY) ||
    hasAnnotation(method, RESPONSE_BODY)
  );
}

function combineMappings(
  prefixes: readonly RequestMapping[],
  methodMappings: readonly RequestMapping[],
): Pick<EndpointDescriptor, "httpMethods" | "paths"> {
  const paths: string[] = [];
  const methods: HttpMethod[] = [];

  // Spring combines every class-level path with every method-level path. A
  // method without an HTTP constraint inherits a constrained class mapping.
  for (const prefix of prefixes) {
    for (const mapping of methodMappings) {
      for (const prefixPath of prefix.paths) {
        for (const methodPath of mapping.paths) {
          paths.push(joinHttpPath(prefixPath, methodPath));
        }
      }
      const constrainedPrefix = prefix.methods.filter(
        (method) => method !== "ANY",
      );
      methods.push(
        ...(mapping.methods.includes("ANY") &&
        constrainedPrefix.length > 0
          ? constrainedPrefix
          : mapping.methods),
      );
    }
  }

  return {
    httpMethods: uniqueSorted(methods),
    paths: uniqueSorted(paths),
  };
}

function mappingPaths(mappings: readonly RequestMapping[]): readonly string[] {
  return uniqueSorted(mappings.flatMap((mapping) => mapping.paths));
}

export interface EndpointBuildResult {
  readonly endpoints: readonly EndpointDescriptor[];
  readonly handlerRoutes: ReadonlyMap<string, {
    readonly basePaths: readonly string[];
    readonly methodPaths: readonly string[];
  }>;
}

export function buildEndpoints(
  index: SymbolIndex,
): EndpointBuildResult {
  const endpoints: EndpointDescriptor[] = [];
  const handlerRoutes = new Map<string, {
    readonly basePaths: readonly string[];
    readonly methodPaths: readonly string[];
  }>();

  for (const method of index.methods) {
    const owner = ownerType(method, index.symbolsById);
    const controller =
      owner === null ? undefined : index.typesById.get(owner.symbol.id);
    const methodMappings = mappingsFor(method);
    if (
      controller?.role !== "controller" ||
      !isEndpointController(controller, method) ||
      methodMappings.length === 0
    ) {
      continue;
    }

    const classMappings = mappingsFor(controller);
    const effectiveClassMappings = classMappings.length === 0
      ? [{ methods: ["ANY" as const], paths: [""] }]
      : classMappings;
    const combined = combineMappings(
      effectiveClassMappings,
      methodMappings,
    );
    endpoints.push({
      id: createEndpointId(method.symbol.id),
      applicationId: method.facts.applicationId,
      controllerSymbolId: controller.symbol.id,
      handlerSymbolId: method.symbol.id,
      ...combined,
      sourceLocation: method.symbol.sourceLocation,
    });
    handlerRoutes.set(method.symbol.id, {
      basePaths: mappingPaths(effectiveClassMappings),
      methodPaths: mappingPaths(methodMappings),
    });
  }

  return {
    endpoints: endpoints.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    handlerRoutes,
  };
}
