package com.example.billing;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BillingController {
  @GetMapping("/billing")
  public String billing() {
    return "billing";
  }
}
