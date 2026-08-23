package com.example.demo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.service.DemoRoutingCaller;
import com.example.demo.service.AnotherDemoService;

@RestController
@RequestMapping("/demo-routing")
public class DemoRoutingController {

  private final AnotherDemoService routingService;
  private final DemoRoutingCaller routingCaller;

  public DemoRoutingController(
      AnotherDemoService routingService,
      DemoRoutingCaller routingCaller) {
    this.routingService = routingService;
    this.routingCaller = routingCaller;
  }

  @GetMapping
  public String inspectRoutes() {
    return this.routingService.methodA() + ":" + this.routingCaller.methodC();
  }

  @GetMapping("/data")
  public String getDataInfo() {
    return this.routingService.getDataInfo();
  }

  @GetMapping("/equals")
  public boolean getEqualsInfo() {
    return this.routingService.equals();
  }

  @GetMapping("/test")
  public void testAbstract() {
    this.routingService.test();
  }
}
