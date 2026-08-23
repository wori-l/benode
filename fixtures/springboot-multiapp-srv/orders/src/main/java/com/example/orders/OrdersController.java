package com.example.orders;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrdersController {
  @GetMapping("/orders")
  public String orders() {
    return "orders";
  }
}
