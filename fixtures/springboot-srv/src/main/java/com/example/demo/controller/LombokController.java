package com.example.demo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.service.DemoOperations;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@AllArgsConstructor
@RestController
@RequestMapping("/lombok")
public class LombokController {

  private final DemoOperations demoOperations;

  @GetMapping
  public LombokExample getExample(@RequestParam String name) {
    log.info("Creating Lombok example for {}", name);

    LombokExample example = LombokExample.builder()
        .id(1)
        .name(demoOperations.hello(name))
        .build();
    example.setName(example.getName().toUpperCase());

    LombokExample example1 = new LombokExample();
    LombokExample example2 = new LombokExample(2, "Example 2");

    return example;
  }

  @Getter
  @Setter
  @Builder
  @AllArgsConstructor
  @NoArgsConstructor
  public static class LombokExample {

    private int id;
    private String name;
  }
}
