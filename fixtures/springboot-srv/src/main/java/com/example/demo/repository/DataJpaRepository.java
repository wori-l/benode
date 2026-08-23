package com.example.demo.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.example.demo.models.entities.DataEntity;

@Repository
public interface DataJpaRepository extends JpaRepository<DataEntity, Integer> {

  DataEntity findByName(String name);
}
