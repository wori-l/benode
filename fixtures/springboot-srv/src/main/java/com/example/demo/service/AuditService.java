package com.example.demo.service;

import org.springframework.stereotype.Service;

import com.example.demo.models.entities.DataEntity;
import com.example.demo.repository.AuditRepository;

@Service
public class AuditService {

  private final AuditRepository auditRepository;

  public AuditService(AuditRepository auditRepository) {
    this.auditRepository = auditRepository;
  }

  public void recordCreated(DataEntity entity) {
    this.auditRepository.record("created", entity.getId());
  }

  public void recordUpdated(DataEntity entity) {
    this.auditRepository.record("updated", entity.getId());
  }

  public void recordDeleted(int id) {
    this.auditRepository.record("deleted", id);
  }
}
