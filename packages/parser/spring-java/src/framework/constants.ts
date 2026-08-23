import {
  HTTP_METHODS,
  type HttpMethod,
} from "@benode/core";

import type { SpringJavaNodeRole } from "./node-filters.js";

export const FEIGN_CLIENT =
  "org.springframework.cloud.openfeign.FeignClient";

export const ENTITY_TABLES = new Set([
  "jakarta.persistence.Table",
  "javax.persistence.Table",
]);

export const ROLE_ANNOTATIONS = new Map<string, SpringJavaNodeRole>([
  ["org.springframework.web.bind.annotation.RestController", "controller"],
  ["org.springframework.stereotype.Controller", "controller"],
  ["org.springframework.stereotype.Service", "service"],
  ["org.springframework.stereotype.Component", "component"],
  ["org.springframework.stereotype.Repository", "repository"],
  ["jakarta.persistence.Entity", "entity"],
  ["javax.persistence.Entity", "entity"],
  [FEIGN_CLIENT, "httpClient"],
]);

export const FIXED_MAPPING_METHODS = new Map<string, HttpMethod>([
  ["org.springframework.web.bind.annotation.DeleteMapping", "DELETE"],
  ["org.springframework.web.bind.annotation.GetMapping", "GET"],
  ["org.springframework.web.bind.annotation.PatchMapping", "PATCH"],
  ["org.springframework.web.bind.annotation.PostMapping", "POST"],
  ["org.springframework.web.bind.annotation.PutMapping", "PUT"],
]);

export const REQUEST_MAPPING =
  "org.springframework.web.bind.annotation.RequestMapping";

export const RESPONSE_BODY =
  "org.springframework.web.bind.annotation.ResponseBody";

export const CONTROLLER =
  "org.springframework.stereotype.Controller";

export const QUALIFIER =
  "org.springframework.beans.factory.annotation.Qualifier";

export const REST_CONTROLLER =
  "org.springframework.web.bind.annotation.RestController";

export const KNOWN_REQUEST_METHODS = new Set<HttpMethod>(
  HTTP_METHODS.filter((method) => method !== "ANY"),
);
