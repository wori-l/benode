package com.example.demo.service;

import org.springframework.stereotype.Service;

@Service
public class DemoRoutingCaller {

  private final AnotherDemoService routingService;

  public DemoRoutingCaller(AnotherDemoService routingService) {
    this.routingService = routingService;
  }

  public String methodC() {
    return this.routingService.methodB();
  }
}
