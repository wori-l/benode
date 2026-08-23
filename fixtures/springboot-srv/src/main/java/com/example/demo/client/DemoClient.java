package com.example.demo.client;

import java.util.List;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import com.example.demo.models.payloads.DemoData;

@FeignClient(name = "demo-client", url = "http://localhost:3000")
public interface DemoClient {

  @GetMapping("/hello")
  public String hello();

  @GetMapping("/data")
  public List<DemoData> getData();

  @PostMapping("/data")
  public DemoData postData(DemoData data);
}
