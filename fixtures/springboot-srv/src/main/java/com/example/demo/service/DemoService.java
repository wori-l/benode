package com.example.demo.service;

import org.springframework.stereotype.Service;

import com.example.demo.client.DemoClient;
import com.example.demo.mapper.DataMapper;
import com.example.demo.models.entities.DataEntity;
import com.example.demo.models.payloads.DemoData;
import com.example.demo.repository.DataJpaRepository;
import com.example.demo.repository.DemoRepository;

@Service
public class DemoService implements DemoOperations {

  private final DemoClient demoClient;
  private final DemoRepository demoRepository;
  private final DataJpaRepository dataJpaRepository;
  private final DataMapper dataMapper;
  private final AuditService auditService;

  public DemoService(
      DemoClient demoClient,
      DemoRepository demoRepository,
      DataJpaRepository dataJpaRepository,
      DataMapper dataMapper,
      AuditService auditService) {
    this.demoClient = demoClient;
    this.demoRepository = demoRepository;
    this.dataJpaRepository = dataJpaRepository;
    this.dataMapper = dataMapper;
    this.auditService = auditService;
  }

  @Override
  public String hello(String name) {
    return this.demoClient.hello() + " " + name;
  }

  @Override
  public DemoData getDataById(int id) {
    DataEntity entity = this.demoRepository.findById(id);
    return this.dataMapper.toPayload(entity);
  }

  @Override
  public DemoData getDataByName(String name) {
    DataEntity entity = this.dataJpaRepository.findByName(name);
    return this.dataMapper.toPayload(entity);
  }

  @Override
  public DemoData addData(DemoData data) {
    DemoData remoteData = this.demoClient.postData(data);
    DataEntity entity = this.dataMapper.toEntity(remoteData);
    this.demoRepository.save(entity);
    this.auditService.recordCreated(entity);
    return this.dataMapper.toPayload(entity);
  }

  @Override
  public DemoData updateData(int id, DemoData data) {
    data.setId(id);
    DataEntity entity = this.dataMapper.toEntity(data);
    this.demoRepository.update(entity);
    this.auditService.recordUpdated(entity);
    return this.dataMapper.toPayload(entity);
  }

  @Override
  public void deleteData(int id) {
    this.demoRepository.deleteById(id);
    this.auditService.recordDeleted(id);
  }

  @Override
  public boolean doBackup() {
    this.demoClient.getData().forEach(data -> {
      DataEntity entity = this.dataMapper.toEntity(data);
      this.demoRepository.save(entity);
      this.auditService.recordCreated(entity);
    });
    return true;
  }
}
