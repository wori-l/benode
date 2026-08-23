package com.example.demo.models.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "data_entity")
public class DataEntity {

  @Id
  @GeneratedValue
  private int id;

  @Column
  private String name;

  @Column
  private int value;

  protected DataEntity() {
  }

  public DataEntity(int id, String name, int value) {
    this.id = id;
    this.name = name;
    this.value = value;
  }

  public int getId() {
    return id;
  }

  public void setId(int id) {
    this.id = id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public int getValue() {
    return value;
  }

  public void setValue(int value) {
    this.value = value;
  }

  public String toString() {
    return "DataEntity{id=" + id + ", name='" + name + "', value=" + value + "}";
  }
}