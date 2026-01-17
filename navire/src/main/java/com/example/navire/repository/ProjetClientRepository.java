package com.example.navire.repository;

import com.example.navire.model.ProjetClient;
import com.example.navire.model.Client;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ProjetClientRepository extends JpaRepository<ProjetClient, Long> {
    @Query("SELECT pc.client FROM ProjetClient pc WHERE pc.projet.id = :projetId")
    List<Client> findClientsByProjetId(@Param("projetId") Long projetId);

    @Query("SELECT DISTINCT pc FROM ProjetClient pc JOIN FETCH pc.client LEFT JOIN FETCH pc.autorisation WHERE pc.projet.id = :projetId")
    List<ProjetClient> findByProjetIdWithClientAndAutorisation(@Param("projetId") Long projetId);

        @EntityGraph(attributePaths = {"client", "autorisation", "projet"})
        @Query(
                        value = """
                                        SELECT DISTINCT pc
                                        FROM ProjetClient pc
                                        JOIN pc.client c
                                        WHERE pc.projet.id = :projetId
                                            AND ( :search IS NULL OR :search = '' OR
                                                        lower(c.nom) LIKE lower(concat('%', :search, '%')) OR
                                                        lower(c.numero) LIKE lower(concat('%', :search, '%')) OR
                                                        lower(coalesce(c.mf, '')) LIKE lower(concat('%', :search, '%')) OR
                                                        lower(coalesce(c.adresse, '')) LIKE lower(concat('%', :search, '%'))
                                                    )
                                            AND ( :numero IS NULL OR :numero = '' OR lower(c.numero) LIKE lower(concat('%', :numero, '%')) )
                                            AND ( :nom IS NULL OR :nom = '' OR lower(c.nom) LIKE lower(concat('%', :nom, '%')) )
                                            AND ( :mf IS NULL OR :mf = '' OR lower(coalesce(c.mf, '')) LIKE lower(concat('%', :mf, '%')) )
                                            AND ( :adresse IS NULL OR :adresse = '' OR lower(coalesce(c.adresse, '')) LIKE lower(concat('%', :adresse, '%')) )
                                        """,
                        countQuery = """
                                        SELECT count(DISTINCT pc.id)
                                        FROM ProjetClient pc
                                        JOIN pc.client c
                                        WHERE pc.projet.id = :projetId
                                            AND ( :search IS NULL OR :search = '' OR
                                                        lower(c.nom) LIKE lower(concat('%', :search, '%')) OR
                                                        lower(c.numero) LIKE lower(concat('%', :search, '%')) OR
                                                        lower(coalesce(c.mf, '')) LIKE lower(concat('%', :search, '%')) OR
                                                        lower(coalesce(c.adresse, '')) LIKE lower(concat('%', :search, '%'))
                                                    )
                                            AND ( :numero IS NULL OR :numero = '' OR lower(c.numero) LIKE lower(concat('%', :numero, '%')) )
                                            AND ( :nom IS NULL OR :nom = '' OR lower(c.nom) LIKE lower(concat('%', :nom, '%')) )
                                            AND ( :mf IS NULL OR :mf = '' OR lower(coalesce(c.mf, '')) LIKE lower(concat('%', :mf, '%')) )
                                            AND ( :adresse IS NULL OR :adresse = '' OR lower(coalesce(c.adresse, '')) LIKE lower(concat('%', :adresse, '%')) )
                                        """
        )
        Page<ProjetClient> searchByProjetId(
                        @Param("projetId") Long projetId,
                        @Param("search") String search,
                        @Param("numero") String numero,
                        @Param("nom") String nom,
                        @Param("mf") String mf,
                        @Param("adresse") String adresse,
                        Pageable pageable
        );

    List<ProjetClient> findByProjetId(Long projetId);
    
    List<ProjetClient> findByClientId(Long clientId);
}
