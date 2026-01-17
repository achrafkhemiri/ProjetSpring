package com.example.navire.repository;

import com.example.navire.model.ProjetDepot;
import com.example.navire.model.Depot;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProjetDepotRepository extends JpaRepository<ProjetDepot, Long> {
    @Query("SELECT pd.depot FROM ProjetDepot pd WHERE pd.projet.id = :projetId")
    List<Depot> findDepotsByProjetId(@Param("projetId") Long projetId);

    List<ProjetDepot> findByProjetId(Long projetId);
    
    List<ProjetDepot> findByDepotId(Long depotId);
    
    Optional<ProjetDepot> findByProjetIdAndDepotId(Long projetId, Long depotId);

        @EntityGraph(attributePaths = {"depot"})
        @Query(
                        value = """
                                        SELECT pd FROM ProjetDepot pd
                                        JOIN pd.depot d
                                        WHERE pd.projet.id = :projetId
                                            AND (
                                                :search IS NULL OR :search = ''
                                                OR LOWER(d.nom) LIKE LOWER(CONCAT('%', :search, '%'))
                                                OR LOWER(COALESCE(d.adresse, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                                                OR LOWER(COALESCE(d.mf, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                                            )
                                            AND (:nom IS NULL OR :nom = '' OR LOWER(d.nom) LIKE LOWER(CONCAT('%', :nom, '%')))
                                            AND (:adresse IS NULL OR :adresse = '' OR LOWER(COALESCE(d.adresse, '')) LIKE LOWER(CONCAT('%', :adresse, '%')))
                                            AND (:mf IS NULL OR :mf = '' OR LOWER(COALESCE(d.mf, '')) LIKE LOWER(CONCAT('%', :mf, '%')))
                                        """,
                        countQuery = """
                                        SELECT COUNT(pd) FROM ProjetDepot pd
                                        JOIN pd.depot d
                                        WHERE pd.projet.id = :projetId
                                            AND (
                                                :search IS NULL OR :search = ''
                                                OR LOWER(d.nom) LIKE LOWER(CONCAT('%', :search, '%'))
                                                OR LOWER(COALESCE(d.adresse, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                                                OR LOWER(COALESCE(d.mf, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                                            )
                                            AND (:nom IS NULL OR :nom = '' OR LOWER(d.nom) LIKE LOWER(CONCAT('%', :nom, '%')))
                                            AND (:adresse IS NULL OR :adresse = '' OR LOWER(COALESCE(d.adresse, '')) LIKE LOWER(CONCAT('%', :adresse, '%')))
                                            AND (:mf IS NULL OR :mf = '' OR LOWER(COALESCE(d.mf, '')) LIKE LOWER(CONCAT('%', :mf, '%')))
                                        """
        )
        Page<ProjetDepot> searchByProjetId(
                        @Param("projetId") Long projetId,
                        @Param("search") String search,
                        @Param("nom") String nom,
                        @Param("adresse") String adresse,
                        @Param("mf") String mf,
                        Pageable pageable
        );
}
