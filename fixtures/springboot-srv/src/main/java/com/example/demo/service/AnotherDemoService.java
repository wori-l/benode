package com.example.demo.service;

import org.springframework.stereotype.Service;

import com.example.demo.models.entities.DataEntity;
import com.example.demo.models.payloads.DemoData;
import com.example.demo.models.payloads.ModelA;
import com.example.demo.models.payloads.ModelB;
import com.example.demo.models.payloads.ModelC;

@Service
public class AnotherDemoService {

  public String methodA() {
    return this.methodB();
  }

  public String methodB() {
    return "routed";
  }

  public String getDataInfo() {
    return getDataObject().toString();
  }

  public DemoData getDataObject() {
    DemoData data = new DemoData(1L, "Sample Name", "Sample Value");
    return data;
  }

  public boolean equals() {
    DataMapper mapper = new DataMapper();
    return mapper.toEntity(this.getDataObject()).name.toUpperCase().equals(this.getDataObject().name.toUpperCase());
  }

  public void test() {
    ModelA modelA = new ModelA("TestName");
    ModelB modelB = new ModelB("TestName");
    testAbstract(modelA);
    testAbstract(modelB);
  }

  private void testAbstract(ModelC model) {
    System.out.println(model.getName());
  }
}
