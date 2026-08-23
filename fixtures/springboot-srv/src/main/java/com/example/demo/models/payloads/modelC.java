package com.example.demo.models.payloads;

public abstract class ModelC {

    private String name;

    public ModelC(String name) {
        this.name = name;
    }

    public abstract String getName();
}
