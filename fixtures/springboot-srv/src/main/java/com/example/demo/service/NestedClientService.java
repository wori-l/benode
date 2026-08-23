package com.example.demo.service;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.GetMapping;

@Service
public class NestedClientService {

  private final NestedFeignClient nestedFeignClient;

  public NestedClientService(NestedFeignClient nestedFeignClient) {
    this.nestedFeignClient = nestedFeignClient;
  }

  public String loadMessage() {
    return this.nestedFeignClient.fetchMessage();
  }

  @FeignClient(name = "nested-client", url = "http://localhost:3001")
  public interface NestedFeignClient {

    @GetMapping("/message")
    String fetchMessage();
  }
}
