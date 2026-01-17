package com.example.navire.repository;

import com.example.navire.model.Client;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ClientRepository extends JpaRepository<Client, Long> {
    boolean existsByNumero(String numero);

    Page<Client> findByNomContainingIgnoreCaseOrNumeroContainingIgnoreCase(String nom, String numero, Pageable pageable);

        @Query(
                        value = """
                                        SELECT c
                                        FROM Client c
                                        WHERE
                                                ( :search IS NULL OR :search = '' OR
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
                                        SELECT count(c.id)
                                        FROM Client c
                                        WHERE
                                                ( :search IS NULL OR :search = '' OR
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
        Page<Client> search(
                        @Param("search") String search,
                        @Param("numero") String numero,
                        @Param("nom") String nom,
                        @Param("mf") String mf,
                        @Param("adresse") String adresse,
                        Pageable pageable
        );
}
