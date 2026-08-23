package com.example.demo.service;

import com.example.demo.models.payloads.DemoData;

public interface DemoOperations {

  String hello(String name);

  DemoData getDataById(int id);

  DemoData getDataByName(String name);

  DemoData addData(DemoData data);

  DemoData updateData(int id, DemoData data);

  void deleteData(int id);

  boolean doBackup();
}
