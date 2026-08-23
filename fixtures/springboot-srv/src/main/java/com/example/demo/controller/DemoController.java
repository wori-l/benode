package com.example.demo.controller;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.models.payloads.DemoData;
import com.example.demo.service.DemoOperations;
import com.example.demo.service.NestedClientService;

@RestController
@RequestMapping("/api/v1")
public class DemoController {

  private final DemoOperations demoOperations;
  private final NestedClientService nestedClientService;

  public DemoController(
      DemoOperations demoOperations,
      NestedClientService nestedClientService) {
    this.demoOperations = demoOperations;
    this.nestedClientService = nestedClientService;
  }

  @GetMapping("/hello")
  public String hello(@RequestParam(value = "name", defaultValue = "world") String name) {
    return this.demoOperations.hello(name);
  }

  @GetMapping("/data/{id}")
  public DemoData getDataById(@PathVariable int id) {
    return this.demoOperations.getDataById(id);
  }

  @RequestMapping(path = "/data", method = { RequestMethod.GET, RequestMethod.HEAD })
  public DemoData getDataByName(@RequestParam String name) {
    return this.demoOperations.getDataByName(name);
  }

  @PostMapping("/data")
  public DemoData addData(@RequestBody DemoData data) {
    return this.demoOperations.addData(data);
  }

  @PutMapping("/data/{id}")
  public DemoData updateData(@PathVariable int id, @RequestBody DemoData data) {
    return this.demoOperations.updateData(id, data);
  }

  @DeleteMapping("/data/{id}")
  public void deleteData(@PathVariable int id) {
    this.demoOperations.deleteData(id);
  }

  @PostMapping("/backup")
  public boolean doBackup() {
    return this.demoOperations.doBackup();
  }

  @GetMapping("/inner-client")
  public String getInnerClientMessage() {
    return this.nestedClientService.loadMessage();
  }
}
