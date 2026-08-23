import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import GraphGroupCard from "../src/components/GraphGroupCard.vue";
import { groupEndpointGraph } from "../src/graph/graph-grouping.js";
import { sampleGraphMessage } from "../src/debug/sample-graph.js";

function controllerGroup() {
  const grouped = groupEndpointGraph(
    sampleGraphMessage.graph,
    sampleGraphMessage.endpoint.handlerSymbolId,
  );
  const group = grouped.groups.find((candidate) => candidate.role === "controller");
  if (group === undefined) {
    throw new Error("Missing controller group.");
  }
  return group;
}

describe("GraphGroupCard", () => {
  it("shows class role, namespace and endpoint base path", () => {
    const group = controllerGroup();
    const wrapper = mount(GraphGroupCard, {
      props: {
        group,
        selected: false,
        httpMethods: ["GET"],
        basePaths: ["/api/demo"],
        urls: [],
        tables: [],
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.find(".group-role").text()).toBe("controller");
    expect(wrapper.find(".group-title").text()).toBe("DemoController");
    expect(wrapper.find(".group-namespace").text()).toBe("com.example.demo.controller");
    expect(wrapper.find(".graph-group-card").classes()).toContain("detailed");
    expect(wrapper.text()).toContain("/api/demo");
    expect(wrapper.text()).not.toContain("endpoint");
    expect(wrapper.find(".group-toggle").exists()).toBe(false);
  });

  it("focuses the group from its header", async () => {
    const group = controllerGroup();
    const wrapper = mount(GraphGroupCard, {
      props: {
        group,
        selected: false,
        httpMethods: [],
        basePaths: [],
        urls: [],
        tables: [],
      },
      global: { stubs: { Handle: true } },
    });

    await wrapper.get(".group-focus-target").trigger("click");

    expect(wrapper.emitted("focus")).toEqual([[group.id]]);
  });

  it("shows the HTTP client URL", () => {
    const group = controllerGroup();
    const wrapper = mount(GraphGroupCard, {
      props: {
        group: { ...group, role: "httpClient" },
        selected: false,
        httpMethods: [],
        basePaths: [],
        urls: ["http://localhost:3000/api"],
        tables: [],
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.text()).toContain("URL");
    expect(wrapper.text()).toContain("http://localhost:3000/api");
  });

  it("shows the entity table", () => {
    const group = controllerGroup();
    const wrapper = mount(GraphGroupCard, {
      props: {
        group: { ...group, role: "entity" },
        selected: false,
        httpMethods: [],
        basePaths: [],
        urls: [],
        tables: ["inventory.data_entity"],
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.text()).toContain("Table");
    expect(wrapper.text()).toContain("inventory.data_entity");
  });
});
