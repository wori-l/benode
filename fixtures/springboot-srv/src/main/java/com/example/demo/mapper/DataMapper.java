package com.example.demo.mapper;

import org.springframework.stereotype.Component;

import com.example.demo.models.entities.DataEntity;
import com.example.demo.models.payloads.DemoData;

@Component
public class DataMapper {

  public DataEntity toEntity(DemoData data) {
    return new DataEntity(
        data.getId(),
        data.getName(),
        data.getValue());
  }

  public DemoData toPayload(DataEntity entity) {
    return new DemoData(
        entity.getId(),
        entity.getName(),
        entity.getValue());
  }
}
