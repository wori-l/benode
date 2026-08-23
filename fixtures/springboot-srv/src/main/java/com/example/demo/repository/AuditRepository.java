package com.example.demo.repository;

import java.util.Map;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuditRepository {

  private final NamedParameterJdbcTemplate jdbcTemplate;

  public AuditRepository(NamedParameterJdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public void record(String action, int entityId) {
    String sql = """
            INSERT INTO data_audit (action, entity_id)
            VALUES (:action, :entityId)
        """;

    Map<String, Object> params = Map.of(
        "action", action,
        "entityId", entityId);

    jdbcTemplate.update(sql, params);
  }
}
