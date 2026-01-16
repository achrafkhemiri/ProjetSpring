package com.example.navire.repository;

import com.example.navire.model.ProjetClient;
import com.example.navire.model.Client;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ProjetClientRepository extends JpaRepository<ProjetClient, Long> {
    @Query("SELECT pc.client FROM ProjetClient pc WHERE pc.projet.id = :projetId")
    List<Client> findClientsByProjetId(@Param("projetId") Long projetId);

    @Query(
        value = "SELECT pc FROM ProjetClient pc JOIN pc.client c " +
                "WHERE pc.projet.id = :projetId " +
                "AND ( :search = '' " +
                "   OR LOWER(c.nom) LIKE LOWER(CONCAT('%', :search, '%')) " +
                "   OR LOWER(c.numero) LIKE LOWER(CONCAT('%', :search, '%')) " +
                "   OR LOWER(COALESCE(c.mf, '')) LIKE LOWER(CONCAT('%', :search, '%')) " +
                ")",
        countQuery = "SELECT COUNT(pc) FROM ProjetClient pc JOIN pc.client c " +
                "WHERE pc.projet.id = :projetId " +
                "AND ( :search = '' " +
                "   OR LOWER(c.nom) LIKE LOWER(CONCAT('%', :search, '%')) " +
                "   OR LOWER(c.numero) LIKE LOWER(CONCAT('%', :search, '%')) " +
                "   OR LOWER(COALESCE(c.mf, '')) LIKE LOWER(CONCAT('%', :search, '%')) " +
                ")"
    )
    Page<ProjetClient> findProjetClientsByProjetIdAndSearch(
        @Param("projetId") Long projetId,
        @Param("search") String search,
        Pageable pageable
    );

    List<ProjetClient> findByProjetId(Long projetId);
    
    List<ProjetClient> findByClientId(Long clientId);
}
