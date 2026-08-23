package com.example.demo.repository;

import java.util.Map;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import com.example.demo.models.entities.DataEntity;

@Repository
public class DemoRepository {

  private final NamedParameterJdbcTemplate jdbcTemplate;

  public DemoRepository(NamedParameterJdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public DataEntity findById(int id) {
    String sql = """
            SELECT id, name, value
            FROM data_entity
            WHERE id = :id
        """;

    Map<String, Object> params = Map.of("id", id);

    return jdbcTemplate.queryForObject(
        sql,
        params,
        (rs, rowNum) -> new DataEntity(
            rs.getInt("id"),
            rs.getString("name"),
            rs.getInt("value")));
  }

  public DataEntity findByName(String name) {
    String sql = """
            SELECT id, name, value
            FROM data_entity
            WHERE name = :name
        """;

    Map<String, Object> params = Map.of("name", name);

    return jdbcTemplate.queryForObject(
        sql,
        params,
        (rs, rowNum) -> new DataEntity(
            rs.getInt("id"),
            rs.getString("name"),
            rs.getInt("value")));
  }

  public void save(DataEntity entity) {
    String sql = """
            INSERT INTO data_entity (name, value)
            VALUES (:name, :value)
        """;

    Map<String, Object> params = Map.of(
        "name", entity.getName(),
        "value", entity.getValue());

    jdbcTemplate.update(sql, params);
  }

  public void update(DataEntity entity) {
    String sql = """
            UPDATE data_entity
            SET name = :name, value = :value
            WHERE id = :id
        """;

    Map<String, Object> params = Map.of(
        "id", entity.getId(),
        "name", entity.getName(),
        "value", entity.getValue());

    jdbcTemplate.update(sql, params);
  }

  public void deleteById(int id) {
    String sql = "DELETE FROM data_entity WHERE id = :id";
    jdbcTemplate.update(sql, Map.of("id", id));
  }
}
