package com.example.demo.models.payloads;

public class ModelA extends ModelC {

    public ModelA(String name) {
        super(name);
    }

    @Override
    public String getName() {
        return this.name + " from ModelA";
    }

    @Override
    public void doSomething() {
        System.out.println("Doing something in ModelA");
    }
}
