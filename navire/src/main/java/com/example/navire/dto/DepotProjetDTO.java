package com.example.navire.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DepotProjetDTO {
    private Long id;
    private String nom;
    private String adresse;
    private String mf;

    private Long projetId;
    private Long projetDepotId;
    private Double quantiteAutorisee;
}
