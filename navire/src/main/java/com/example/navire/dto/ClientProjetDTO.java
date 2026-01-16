package com.example.navire.dto;

import lombok.*;

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

    // Projet association fields
    private Long projetId;
    private Long projetClientId;
    private java.util.Set<AutorisationDTO> autorisation;
    private Double quantiteAutorisee;

    // Compatibility with existing front usage
    private java.util.Map<Long, Double> quantitesAutoriseesParProjet;
}
