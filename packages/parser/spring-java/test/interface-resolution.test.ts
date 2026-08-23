import {
  type ApplicationDescriptor,
  type FrameworkIndex,
} from "@benode/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  SpringBootFrameworkAdapter,
  type TreeSitterJavaAdapter,
} from "../src/index.js";
import {
  createJavaTestAdapter,
  indexJavaSnippet,
} from "./support/java-adapter.js";

let languageAdapter: TreeSitterJavaAdapter;

beforeAll(async () => {
  languageAdapter = await createJavaTestAdapter();
});

afterAll(() => {
  languageAdapter.dispose();
});

async function buildIndex(content: string): Promise<FrameworkIndex> {
  const fileFacts = await indexJavaSnippet(languageAdapter, content);
  const entryPoint = fileFacts.symbols.find(
    (symbol) => symbol.kind === "type",
  );
  if (entryPoint === undefined) {
    throw new Error("The Java snippet has no type.");
  }

  const application: ApplicationDescriptor = {
    id: fileFacts.applicationId,
    name: "InterfaceResolutionApplication",
    rootUri: "fixture:///",
    sourceRoots: ["fixture:///src/main/java"],
    entryPoint: entryPoint.symbol,
    sourceLocation: entryPoint.sourceLocation,
  };
  return new SpringBootFrameworkAdapter().buildIndex({
    applications: [application],
    fileFacts: [fileFacts],
  });
}

function targetNames(
  index: FrameworkIndex,
  sourceQualifiedName: string,
): readonly string[] {
  const source = index.nodes.find(
    (node) => node.symbol.qualifiedName === sourceQualifiedName,
  );
  if (source === undefined) {
    throw new Error("Source node was not built: " + sourceQualifiedName);
  }

  const nodesById = new Map(
    index.nodes.map((node) => [node.id, node]),
  );
  return index.edges
    .filter((edge) => edge.sourceNodeId === source.id)
    .map((edge) => nodesById.get(edge.targetNodeId)?.symbol.qualifiedName)
    .filter((name): name is string => name !== undefined)
    .sort();
}

describe("interface implementation resolution", () => {
  it("resolves a nested HTTP client from its immediate owner", async () => {
    const index = await buildIndex(`
      package com.example;

      import org.springframework.cloud.openfeign.FeignClient;
      import org.springframework.stereotype.Service;
      import org.springframework.web.bind.annotation.GetMapping;

      @Service
      class ParentService {
        private NestedClient client;

        String call() {
          return client.fetch();
        }

        @FeignClient(name = "nested", url = "http://localhost:3002")
        interface NestedClient {
          @GetMapping("/nested")
          String fetch();
        }
      }

      class Unrelated {
        interface NestedClient {
          String fetch();
        }
      }
    `);
    const nestedMethod = index.nodes.find(
      (node) =>
        node.symbol.qualifiedName ===
        "com.example.ParentService.NestedClient#fetch",
    );

    expect(
      targetNames(index, "com.example.ParentService#call"),
    ).toEqual(["com.example.ParentService.NestedClient#fetch"]);
    expect(nestedMethod).toMatchObject({
      role: "httpClient",
      metadata: {
        namespaceName: "com.example",
        httpClientUrls: ["http://localhost:3002"],
        httpClientHttpMethods: ["GET"],
        httpClientPaths: ["/nested"],
      },
    });
    expect(
      index.edges.find((edge) => edge.targetNodeId === nestedMethod?.id),
    ).toMatchObject({ confidence: "inferred" });
  });

  it("uses @Qualifier to select an implementation", async () => {
    const index = await buildIndex(`
      package com.example;

      import org.springframework.beans.factory.annotation.Qualifier;
      import org.springframework.stereotype.Service;
      import org.springframework.web.bind.annotation.GetMapping;
      import org.springframework.web.bind.annotation.RestController;

      interface Gateway {
        void send();
      }

      @Service
      class DeliveryWorker {
        public void deliver() {}
      }

      @Service
      @Qualifier("preferred")
      class PreferredGateway implements Gateway {
        private DeliveryWorker worker;

        public void send() {
          worker.deliver();
        }
      }

      @Service
      class OtherGateway implements Gateway {
        public void send() {}
      }

      @RestController
      class GatewayController {
        @Qualifier("preferred")
        private Gateway gateway;

        @GetMapping("/send")
        public void send() {
          gateway.send();
        }
      }
    `);

    expect(
      targetNames(index, "com.example.GatewayController#send"),
    ).toEqual(["com.example.PreferredGateway#send"]);
    expect(
      targetNames(index, "com.example.PreferredGateway#send"),
    ).toEqual(["com.example.DeliveryWorker#deliver"]);
  });

  it("uses the only concrete implementation transitively", async () => {
    const index = await buildIndex(`
      package com.example;

      import org.springframework.stereotype.Service;
      import org.springframework.web.bind.annotation.GetMapping;
      import org.springframework.web.bind.annotation.RestController;

      interface Port {
        void execute();
      }

      interface SpecializedPort extends Port {}

      @Service
      class OnlyPort implements SpecializedPort {
        public void execute() {}
      }

      @RestController
      class PortController {
        private Port port;

        @GetMapping("/execute")
        public void execute() {
          port.execute();
        }
      }
    `);

    expect(
      targetNames(index, "com.example.PortController#execute"),
    ).toEqual(["com.example.OnlyPort#execute"]);
  });

  it("falls back to the interface when inference is not unique", async () => {
    const index = await buildIndex(`
      package com.example;

      import org.springframework.stereotype.Service;
      import org.springframework.web.bind.annotation.GetMapping;
      import org.springframework.web.bind.annotation.RestController;

      interface Renderer {
        void render();
      }

      @Service
      class HtmlRenderer implements Renderer {
        public void render() {}
      }

      @Service
      class PdfRenderer implements Renderer {
        public void render() {}
      }

      @RestController
      class RenderController {
        private Renderer renderer;

        @GetMapping("/render")
        public void render() {
          renderer.render();
        }
      }
    `);

    expect(
      targetNames(index, "com.example.RenderController#render"),
    ).toEqual(["com.example.Renderer#render"]);
  });

  it("falls back when @Qualifier cannot identify an implementation", async () => {
    const index = await buildIndex(`
      package com.example;

      import org.springframework.beans.factory.annotation.Qualifier;
      import org.springframework.stereotype.Service;
      import org.springframework.web.bind.annotation.GetMapping;
      import org.springframework.web.bind.annotation.RestController;

      interface Notifier {
        void notifyUser();
      }

      @Service
      class EmailNotifier implements Notifier {
        public void notifyUser() {}
      }

      @RestController
      class NotificationController {
        @Qualifier("missing")
        private Notifier notifier;

        @GetMapping("/notify")
        public void notifyUser() {
          notifier.notifyUser();
        }
      }
    `);

    expect(
      targetNames(
        index,
        "com.example.NotificationController#notifyUser",
      ),
    ).toEqual(["com.example.Notifier#notifyUser"]);
  });
});
