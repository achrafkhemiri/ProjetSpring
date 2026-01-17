package com.example.navire.dto;

import lombok.*;

import java.util.Map;
import java.util.Set;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class ClientProjetDTO {
    // Client fields
    private Long id;
    private String numero;
    private String nom;
    private String adresse;
    private String mf;

    // ProjetClient (association) fields
    private Long projetClientId;
    private Long projetId;
    private Set<AutorisationDTO> autorisation;
    private Double quantiteAutorisee;

    // Convenience for existing frontend helpers
    private Map<Long, Double> quantitesAutoriseesParProjet;
}
