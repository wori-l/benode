package com.example.demo.models.payloads;

public class ModelB extends ModelC {

    public ModelB(String name) {
        super(name);
    }

    @Override
    public String getName() {
        return this.name + " from ModelB";
    }
}
