package com.example.navire.repository;

import com.example.navire.model.Depot;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DepotRepository extends JpaRepository<Depot, Long> {
    boolean existsByNom(String nom);

        @Query("""
                        SELECT d FROM Depot d
                        WHERE
                            (:search IS NULL OR :search = ''
                                OR LOWER(d.nom) LIKE LOWER(CONCAT('%', :search, '%'))
                                OR LOWER(COALESCE(d.adresse, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                                OR LOWER(COALESCE(d.mf, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                            )
                            AND (:nom IS NULL OR :nom = '' OR LOWER(d.nom) LIKE LOWER(CONCAT('%', :nom, '%')))
                            AND (:adresse IS NULL OR :adresse = '' OR LOWER(COALESCE(d.adresse, '')) LIKE LOWER(CONCAT('%', :adresse, '%')))
                            AND (:mf IS NULL OR :mf = '' OR LOWER(COALESCE(d.mf, '')) LIKE LOWER(CONCAT('%', :mf, '%')))
                        """)
        Page<Depot> search(
                        @Param("search") String search,
                        @Param("nom") String nom,
                        @Param("adresse") String adresse,
                        @Param("mf") String mf,
                        Pageable pageable
        );
}
