import { mount } from "@vue/test-utils";
import type { ShowEndpointGraphMessage, WebviewToHostMessage } from "@benode/core";
import { describe, expect, it, vi } from "vitest";

import App from "../src/App.vue";
import type { WebviewBridge } from "../src/platform/bridge.js";
import { sampleGraphMessage } from "../src/debug/sample-graph.js";

function fixtureBridge(sent: WebviewToHostMessage[]): WebviewBridge {
  return {
    mode: "standalone",
    postMessage(message): void {
      sent.push(message);
    },
    subscribe(): () => void {
      return () => undefined;
    },
  };
}

function controllableBridge(): {
  readonly bridge: WebviewBridge;
  readonly send: (message: unknown) => void;
} {
  let listener: ((message: unknown) => void) | undefined;
  return {
    bridge: {
      mode: "standalone",
      postMessage(): void {},
      subscribe(nextListener): () => void {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      },
    },
    send(message): void {
      listener?.(message);
    },
  };
}

function messageWithPropertyDetails(): ShowEndpointGraphMessage {
  const templateNode = sampleGraphMessage.graph.nodes[1];
  const templateEdge = sampleGraphMessage.graph.edges[0];
  if (templateNode === undefined || templateEdge === undefined) {
    throw new Error("Incomplete sample graph.");
  }

  const propertyNode = {
    ...templateNode,
    id: "sample:property",
    symbol: {
      ...templateNode.symbol,
      name: "update",
      qualifiedName: "com.example.demo.Profile#update",
      signature: "com.example.demo.Profile#update(String):void",
    },
    filterIds: [...templateNode.filterIds, "trivial"],
    groupNode: false,
    requiresSourceLocation: true,
    unresolved: false,
    metadata: { graphSignal: "low", simplificationReason: "trivialSetter" },
  };
  const orphanNode = {
    ...templateNode,
    id: "sample:orphan",
    symbol: {
      ...templateNode.symbol,
      name: "orphan",
      qualifiedName: "com.example.demo.Profile#orphan",
      signature: "com.example.demo.Profile#orphan()",
    },
  };

  return {
    ...sampleGraphMessage,
    graph: {
      ...sampleGraphMessage.graph,
      nodes: [
        ...sampleGraphMessage.graph.nodes,
        propertyNode,
        orphanNode,
      ],
      edges: [
        ...sampleGraphMessage.graph.edges,
        {
          ...templateEdge,
          id: "sample:root-property",
          sourceNodeId: sampleGraphMessage.endpoint.handlerSymbolId,
          targetNodeId: propertyNode.id,
        },
        {
          ...templateEdge,
          id: "sample:property-orphan",
          sourceNodeId: propertyNode.id,
          targetNodeId: orphanNode.id,
        },
      ],
    },
  };
}

function differentEndpointGraphMessage(): ShowEndpointGraphMessage {
  const nodeId = (id: string): string => "different:" + id;
  return {
    ...sampleGraphMessage,
    endpoint: {
      ...sampleGraphMessage.endpoint,
      id: "sample:another-endpoint",
      controllerSymbolId: nodeId(sampleGraphMessage.endpoint.controllerSymbolId),
      handlerSymbolId: nodeId(sampleGraphMessage.endpoint.handlerSymbolId),
    },
    graph: {
      ...sampleGraphMessage.graph,
      endpointId: "sample:another-endpoint",
      nodes: sampleGraphMessage.graph.nodes.map((node) => ({
        ...node,
        id: nodeId(node.id),
      })),
      edges: sampleGraphMessage.graph.edges.map((edge) => ({
        ...edge,
        id: "different:" + edge.id,
        sourceNodeId: nodeId(edge.sourceNodeId),
        targetNodeId: nodeId(edge.targetNodeId),
      })),
    },
  };
}

describe("App", () => {
  it("renders the stable expanded class layout", async () => {
    const sent: WebviewToHostMessage[] = [];
    const wrapper = mount(App, {
      props: {
        bridge: fixtureBridge(sent),
        initialMessage: sampleGraphMessage,
      },
      global: {
        stubs: {
          VueFlow: {
            props: ["nodes", "edges"],
            emits: ["paneClick"],
            template: `<div>
              <span class="flow-stub">{{ nodes.length }}:{{ edges.length }}</span>
              <button class="pane" type="button" @click="$emit('paneClick')">pane</button>
            </div>`,
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.find(".flow-stub").exists()).toBe(true);
    });
    expect(wrapper.find(".flow-stub").text()).toBe("8:3");
    expect(wrapper.find("header").exists()).toBe(false);
    expect(wrapper.find("aside").exists()).toBe(false);
    expect(wrapper.find(".node-type-filter").exists()).toBe(true);
    expect(wrapper.find(".property-details-toggle").exists()).toBe(false);
    expect(sent).toContainEqual({ type: "ready" });
  });

  it("searches methods and classes and centers each result at a fixed zoom", async () => {
    const findNode = vi.fn((id: string) => ({
      id,
      computedPosition: { x: 100, y: 50, z: 0 },
      dimensions: { width: 340, height: 168 },
    }));
    const setCenter = vi.fn(async () => true);
    const wrapper = mount(App, {
      attachTo: document.body,
      props: {
        bridge: fixtureBridge([]),
        initialMessage: sampleGraphMessage,
      },
      global: {
        stubs: {
          VueFlow: {
            props: ["nodes", "edges"],
            emits: ["init", "paneClick"],
            data: () => ({
              flow: { findNode, setCenter },
            }),
            template: "<button class='initialize-flow' type='button' @click='$emit(\"init\", flow)'>Initialize</button>",
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.find(".graph-search-input").exists()).toBe(true);
    });
    await wrapper.get(".initialize-flow").trigger("click");
    const input = wrapper.get<HTMLInputElement>(".graph-search-input");
    const shortcut = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(shortcut);
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(input.element);
    });
    expect(shortcut.defaultPrevented).toBe(true);

    await input.setValue("DATA");
    await vi.waitFor(() => {
      expect(wrapper.get(".graph-search-count").text()).toBe("1 / 3");
      expect(findNode).toHaveBeenLastCalledWith("sample:getData");
      expect(setCenter).toHaveBeenLastCalledWith(270, 134, {
        zoom: 1,
        duration: 200,
      });
    });

    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.get(".graph-search-count").text()).toBe("2 / 3");
    expect(findNode).toHaveBeenLastCalledWith("sample:loadData");

    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.get(".graph-search-count").text()).toBe("3 / 3");
    expect(findNode).toHaveBeenLastCalledWith("sample:client");

    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.get(".graph-search-count").text()).toBe("1 / 3");
    expect(findNode).toHaveBeenLastCalledWith("sample:getData");

    await input.trigger("keydown", { key: "Enter", shiftKey: true });
    expect(wrapper.get(".graph-search-count").text()).toBe("3 / 3");
    expect(findNode).toHaveBeenLastCalledWith("sample:client");

    await input.setValue("service");
    await vi.waitFor(() => {
      expect(wrapper.get(".graph-search-count").text()).toBe("1 / 1");
      expect(findNode.mock.calls.at(-1)?.[0]).toContain("DemoService");
    });

    await input.trigger("keydown", { key: "Escape" });
    expect(input.element.value).toBe("");
    expect(wrapper.get(".graph-search-count").text()).toBe("0 / 0");
    wrapper.unmount();
  });

  it("keeps the viewport when the graph changes and fits only on request", async () => {
    const controlled = controllableBridge();
    const findNode = vi.fn((id: string) => ({
      id,
      computedPosition: { x: 100, y: 50, z: 0 },
      dimensions: { width: 340, height: 168 },
    }));
    const setCenter = vi.fn(async () => true);
    const fitBounds = vi.fn(async (
      _bounds: { x: number; y: number; width: number; height: number },
      _options: { padding: number; duration: number },
    ) => {
      void _bounds;
      void _options;
      return true;
    });
    const wrapper = mount(App, {
      props: {
        bridge: controlled.bridge,
        initialMessage: sampleGraphMessage,
      },
      global: {
        stubs: {
          VueFlow: {
            props: ["nodes", "edges"],
            emits: ["init"],
            data: () => ({
              flow: {
                findNode,
                fitBounds,
                getNodes: {
                  value: [{
                    parentNode: undefined,
                    computedPosition: { x: 10, y: 20, z: 0 },
                    dimensions: { width: 300, height: 150 },
                  }],
                },
                setCenter,
              },
            }),
            template: `<div>
              <span class="flow-stub">{{ nodes.length }}:{{ edges.length }}</span>
              <span class="flow-node-ids">{{ nodes.map((node) => node.id).join('|') }}</span>
              <button class="initialize-flow" type="button" @click="$emit('init', flow)">Initialize</button>
            </div>`,
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.get(".flow-stub").text()).toBe("8:3");
    });
    await wrapper.get(".initialize-flow").trigger("click");
    expect(setCenter).not.toHaveBeenCalled();

    const nextGraph = differentEndpointGraphMessage();
    controlled.send(nextGraph);
    await vi.waitFor(() => {
      expect(wrapper.get(".flow-node-ids").text()).toContain("different:");
    });
    expect(setCenter).not.toHaveBeenCalled();
    expect(findNode).not.toHaveBeenCalled();
    expect(fitBounds).not.toHaveBeenCalled();

    await wrapper.get(".fit-graph-action").trigger("click");
    expect(fitBounds).toHaveBeenCalledTimes(1);
    const [bounds, fitOptions] = fitBounds.mock.calls[0] ?? [];
    expect(bounds).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(bounds?.width).toBeGreaterThan(0);
    expect(bounds?.height).toBeGreaterThan(0);
    expect(fitOptions).toEqual({ padding: 0.1, duration: 200 });

    controlled.send({
      ...nextGraph,
      graph: {
        ...nextGraph.graph,
        diagnostics: [],
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.get(".flow-stub").text()).toBe("8:3");
    });
    expect(setCenter).not.toHaveBeenCalled();
    expect(fitBounds).toHaveBeenCalledTimes(1);
  });

  it("selects the primary node types by default and filters each type independently", async () => {
    const wrapper = mount(App, {
      props: {
        bridge: fixtureBridge([]),
        initialMessage: messageWithPropertyDetails(),
      },
      global: {
        stubs: {
          VueFlow: {
            props: ["nodes", "edges"],
            template: `<div class="flow-stub" @pointerdown.stop>
              {{ nodes.length }}:{{ edges.length }}
              <button class="flow-node-stub" type="button" aria-label="node" @pointerdown.stop></button>
            </div>`,
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.find(".flow-stub").text()).toBe("10:3");
    });
    expect(wrapper.find(".node-type-filter summary").text()).toContain("4/10");
    expect(wrapper.findAll('.node-type-option input[type="checkbox"]')).toHaveLength(11);
    expect(wrapper.findAll(".filter-section-title").map((item) => item.text()))
      .toEqual(["Classes", "Methods", "Others"]);
    expect(
      wrapper
        .findAll<HTMLInputElement>('.node-type-option input[type="checkbox"]')
        .filter((input) => input.element.checked)
        .map((input) => input.element.value),
    ).toEqual(["controller", "service", "repository", "httpClient"]);
    expect(
      wrapper.find<HTMLInputElement>('input[value="ambiguous"]')
        .element.checked,
    ).toBe(false);

    const filter = wrapper.get<HTMLDetailsElement>(".node-type-filter");
    filter.element.open = true;
    await wrapper.get(".filter-section-title").trigger("pointerdown");
    expect(filter.element.open).toBe(true);
    await wrapper.get(".flow-node-stub").trigger("pointerdown");
    expect(filter.element.open).toBe(false);
    filter.element.open = true;
    await wrapper.get(".flow-stub").trigger("pointerdown");
    expect(filter.element.open).toBe(false);

    await wrapper.find<HTMLInputElement>('input[value="entity"]').setValue(true);
    await vi.waitFor(() => {
      expect(wrapper.find(".flow-stub").text()).toBe("12:4");
    });

    await wrapper.find<HTMLInputElement>('input[value="trivial"]').setValue(true);
    await vi.waitFor(() => {
      expect(wrapper.find(".flow-stub").text()).toBe("13:6");
    });

    await wrapper.find<HTMLInputElement>('input[value="service"]').setValue(false);
    await vi.waitFor(() => {
      expect(wrapper.find(".flow-stub").text()).toBe("8:0");
    });
  });

  it("focuses from graph cards, clears focus and delegates modified navigation", async () => {
    const sent: WebviewToHostMessage[] = [];
    const wrapper = mount(App, {
      props: {
        bridge: fixtureBridge(sent),
        initialMessage: messageWithPropertyDetails(),
      },
      global: {
        stubs: {
          Handle: true,
          VueFlow: {
            props: ["nodes", "edges"],
            emits: ["paneClick"],
            template: `<div>
              <span v-for="node in nodes" :key="node.id" class="node-class">{{ node.class }}</span>
              <span v-for="edge in edges" :key="edge.id" class="edge-class">{{ edge.class }}</span>
              <template v-for="node in nodes" :key="'slot-' + node.id">
                <slot v-if="node.data.kind === 'group'" name="node-benode-group"
                  :id="node.id" :data="node.data"></slot>
                <slot v-else-if="node.data.kind === 'method'" name="node-benode-method"
                  :id="node.id" :data="node.data"></slot>
              </template>
              <button class="pane" type="button" @click="$emit('paneClick')">pane</button>
            </div>`,
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.find(".group-focus-target").exists()).toBe(true);
    });
    const httpClientGroup = wrapper.find(
      '.graph-group-card[title^="httpClient:"]',
    );
    const httpClientMethod = wrapper.findAll(".graph-node-card").find(
      (card) => card.find("strong").text() === "fetchMetadata",
    );
    expect(httpClientGroup.text()).toContain("http://localhost:3000");
    expect(httpClientMethod?.text()).toContain("GET");
    expect(httpClientMethod?.text()).toContain("/metadata/{id}");

    await wrapper.find<HTMLInputElement>('input[value="entity"]').setValue(true);
    await vi.waitFor(() => {
      expect(
        wrapper.find('.graph-group-card[title^="entity:"]').text(),
      ).toContain("data_entity");
    });

    await wrapper.find(".group-focus-target").trigger("click");
    await vi.waitFor(() => {
      expect(wrapper.findAll(".node-class").some((node) =>
        node.text().includes("focus-dimmed"))).toBe(true);
    });

    await wrapper.get("main").trigger("keydown", { key: "Escape" });
    expect(wrapper.findAll(".node-class").every((node) =>
      !node.text().includes("focus-dimmed"))).toBe(true);

    const focusedMethod = wrapper.findAll(".graph-node-card").find(
      (card) => card.find("strong").text() === "findById",
    );
    expect(focusedMethod).toBeDefined();
    await focusedMethod?.trigger("click");
    await vi.waitFor(() => {
      const edgeClasses = wrapper.findAll(".edge-class");
      expect(edgeClasses.some((edge) =>
        edge.text().includes("focus-active"))).toBe(true);
      expect(edgeClasses.some((edge) =>
        edge.text().includes("focus-dimmed"))).toBe(true);
    });

    expect(wrapper.find(".graph-node-card").exists()).toBe(true);
    await wrapper.find(".graph-node-card").trigger("click", { ctrlKey: true });
    expect(sent.some((item) => item.type === "navigateToSource")).toBe(true);

    await wrapper.find(".group-focus-target").trigger("click");
    await wrapper.find(".pane").trigger("click");
    expect(wrapper.findAll(".node-class").every((node) =>
      !node.text().includes("focus-dimmed"))).toBe(true);
  });

  it("preserves focus across compatible payload updates", async () => {
    const controlled = controllableBridge();
    const wrapper = mount(App, {
      props: {
        bridge: controlled.bridge,
        initialMessage: sampleGraphMessage,
      },
      global: {
        stubs: {
          Handle: true,
          VueFlow: {
            props: ["nodes", "edges"],
            template: `<div>
              <template v-for="node in nodes" :key="node.id">
                <slot v-if="node.data.kind === 'group'" name="node-benode-group"
                  :id="node.id" :data="node.data"></slot>
                <slot v-else-if="node.data.kind === 'method'" name="node-benode-method"
                  :id="node.id" :data="node.data"></slot>
              </template>
            </div>`,
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.findAll(".graph-group-card")).toHaveLength(4);
    });
    const controller = wrapper.findAll(".graph-group-card").find(
      (card) => card.attributes("title")?.startsWith("controller:"),
    );
    if (controller === undefined) {
      throw new Error("Missing controller group card.");
    }
    await controller.get(".group-focus-target").trigger("click");
    expect(controller.classes()).toContain("selected");

    controlled.send({
      ...sampleGraphMessage,
      graph: {
        ...sampleGraphMessage.graph,
        diagnostics: [],
      },
    });
    await vi.waitFor(() => {
      const updated = wrapper.find('.graph-group-card[title^="controller:"]');
      expect(updated.classes()).toContain("selected");
      expect(updated.find(".group-toggle").exists()).toBe(false);
    });
  });

  it("renders distinct waiting and initial error states", async () => {
    const controlled = controllableBridge();
    const wrapper = mount(App, {
      props: { bridge: controlled.bridge },
    });

    expect(wrapper.get(".center-state").text()).toContain(
      "Waiting for endpoint graph…",
    );

    controlled.send({
      type: "endpointGraphLoading",
      message: "Reindexing endpoint graph…",
    });
    await vi.waitFor(() => {
      expect(wrapper.get(".center-state").text()).toContain(
        "Reindexing endpoint graph…",
      );
    });

    controlled.send({
      type: "endpointGraphError",
      code: "analysisFailed",
      message: "The first analysis failed.",
    });
    await vi.waitFor(() => {
      expect(wrapper.get(".error-state").text()).toContain(
        "The first analysis failed.",
      );
    });
  });

  it("keeps the last graph visible during refresh and protocol errors", async () => {
    const controlled = controllableBridge();
    const wrapper = mount(App, {
      props: {
        bridge: controlled.bridge,
        initialMessage: sampleGraphMessage,
      },
      global: {
        stubs: {
          VueFlow: {
            props: ["nodes", "edges"],
            template: '<div class="flow-stub">{{ nodes.length }}:{{ edges.length }}</div>',
          },
        },
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.get(".flow-stub").text()).toBe("8:3");
    });

    controlled.send({
      type: "endpointGraphLoading",
      message: "Reindexing endpoint graph…",
    });
    await vi.waitFor(() => {
      expect(wrapper.get(".layout-progress").text()).toContain("Reindexing");
    });
    expect(wrapper.get(".flow-stub").text()).toBe("8:3");

    controlled.send({
      type: "endpointGraphError",
      code: "endpointUnavailable",
      message: "The selected endpoint disappeared.",
    });
    await vi.waitFor(() => {
      expect(wrapper.get(".graph-error-banner").text()).toContain(
        "endpoint disappeared",
      );
    });
    expect(wrapper.get(".flow-stub").text()).toBe("8:3");

    controlled.send({ ...sampleGraphMessage, unexpected: true });
    await vi.waitFor(() => {
      expect(wrapper.get(".graph-error-banner").text()).toContain(
        "incompatible graph payload",
      );
    });
    expect(wrapper.get(".flow-stub").text()).toBe("8:3");
  });
});
