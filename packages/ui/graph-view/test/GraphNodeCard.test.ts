import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import GraphNodeCard from "../src/components/GraphNodeCard.vue";
import { sampleGraphMessage } from "../src/debug/sample-graph.js";

describe("GraphNodeCard", () => {
  it("shows route, input and output without role or signature", () => {
    const node = sampleGraphMessage.graph.nodes[0];
    if (node === undefined) {
      throw new Error("Missing sample root node.");
    }
    const wrapper = mount(GraphNodeCard, {
      props: {
        node,
        showRole: false,
        selected: false,
        httpMethods: ["GET"],
        paths: ["/{id}"],
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.text()).toContain("GET");
    expect(wrapper.text()).toContain("/{id}");
    expect(wrapper.text()).toContain("id: String");
    expect(wrapper.text()).toContain("Output");
    expect(wrapper.text()).toContain("DemoData");
    expect(wrapper.text()).not.toContain(node.symbol.signature);
    expect(wrapper.text()).toContain("DemoController.java:17");
    expect(wrapper.find(".node-role").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("endpoint");
  });

  it("shows an explicit empty input contract", () => {
    const node = sampleGraphMessage.graph.nodes[1];
    if (node === undefined) {
      throw new Error("Missing sample method node.");
    }
    const wrapper = mount(GraphNodeCard, {
      props: {
        node: { ...node, metadata: { declaredType: "void" } },
        showRole: false,
        selected: false,
        httpMethods: [],
        paths: [],
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.text()).toContain(node.symbol.name);
    expect(wrapper.text()).toContain("None");
    expect(wrapper.text()).toContain("void");
  });

  it("focuses on click and navigates only with Ctrl, Cmd or keyboard modifier", async () => {
    const node = sampleGraphMessage.graph.nodes[0];
    if (node === undefined) {
      throw new Error("Missing sample root node.");
    }
    const wrapper = mount(GraphNodeCard, {
      props: {
        node,
        showRole: false,
        selected: false,
        httpMethods: [],
        paths: [],
      },
      global: { stubs: { Handle: true } },
    });
    const button = wrapper.get("button");

    await button.trigger("click");
    await button.trigger("click", { ctrlKey: true });
    await button.trigger("click", { metaKey: true });
    await button.trigger("keydown", { key: "Enter", ctrlKey: true });

    expect(wrapper.emitted("focus")).toEqual([[node.id]]);
    expect(wrapper.emitted("navigate")).toEqual([
      [node.id],
      [node.id],
      [node.id],
    ]);
  });
});
