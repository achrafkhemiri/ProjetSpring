package com.example.navire.services;

import com.example.navire.dto.DepotProjetDTO;
import com.example.navire.dto.DepotDTO;
import com.example.navire.exception.DepotNotFoundException;
import com.example.navire.exception.ProjetNotFoundException;
import com.example.navire.mapper.DepotMapper;
import com.example.navire.model.Depot;
import com.example.navire.model.ProjetDepot;
import com.example.navire.repository.DepotRepository;
import com.example.navire.repository.ProjetDepotRepository;
import com.example.navire.repository.ProjetRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class DepotService {
    @Autowired
    private DepotRepository depotRepository;
    @Autowired
    private DepotMapper depotMapper;
    @Autowired
    private ProjetDepotRepository projetDepotRepository;
    @Autowired
    private ProjetRepository projetRepository;

    public List<DepotDTO> getAllDepots() {
        return depotRepository.findAll().stream()
                .map(depotMapper::toDTO)
                .collect(Collectors.toList());
    }

    public Page<DepotDTO> searchDepots(String search, String nom, String adresse, String mf, Pageable pageable) {
        return depotRepository.search(search, nom, adresse, mf, pageable)
                .map(depotMapper::toDTO);
    }

    public Page<DepotProjetDTO> getDepotsByProjetPaged(Long projetId, String search, String nom, String adresse, String mf, Pageable pageable) {
        if (projetId == null || !projetRepository.existsById(projetId)) {
            throw new ProjetNotFoundException(projetId);
        }

        return projetDepotRepository.searchByProjetId(projetId, search, nom, adresse, mf, pageable)
                .map(pd -> {
                    Depot d = pd.getDepot();
                    return DepotProjetDTO.builder()
                            .id(d != null ? d.getId() : null)
                            .nom(d != null ? d.getNom() : null)
                            .adresse(d != null ? d.getAdresse() : null)
                            .mf(d != null ? d.getMf() : null)
                            .projetId(pd.getProjet() != null ? pd.getProjet().getId() : null)
                            .projetDepotId(pd.getId())
                            .quantiteAutorisee(pd.getQuantiteAutorisee())
                            .build();
                });
    }

    public DepotDTO getDepotById(Long id) {
        Depot depot = depotRepository.findById(id)
                .orElseThrow(() -> new DepotNotFoundException(id));
        return depotMapper.toDTO(depot);
    }

    @Transactional
    public DepotDTO createDepot(DepotDTO dto) {
        System.out.println("=== CREATE DEPOT ===");
        System.out.println("DTO reçu - nom: " + dto.getNom());
        System.out.println("DTO reçu - adresse: " + dto.getAdresse());
        System.out.println("DTO reçu - mf: " + dto.getMf());
        
        if (depotRepository.existsByNom(dto.getNom())) {
            throw new IllegalArgumentException("Nom already exists");
        }
        Depot depot = depotMapper.toEntity(dto);
        
        System.out.println("Entity mappé - nom: " + depot.getNom());
        System.out.println("Entity mappé - adresse: " + depot.getAdresse());
        System.out.println("Entity mappé - mf: " + depot.getMf());
        
        Depot saved = depotRepository.save(depot);
        
        System.out.println("Entity sauvegardé - id: " + saved.getId());
        System.out.println("Entity sauvegardé - adresse: " + saved.getAdresse());
        System.out.println("Entity sauvegardé - mf: " + saved.getMf());
        
        return depotMapper.toDTO(saved);
    }

    @Transactional
    public DepotDTO updateDepot(Long id, DepotDTO dto) {
        Depot depot = depotRepository.findById(id)
                .orElseThrow(() -> new DepotNotFoundException(id));
        depot.setNom(dto.getNom());
        depot.setAdresse(dto.getAdresse());
        depot.setMf(dto.getMf());
        return depotMapper.toDTO(depotRepository.save(depot));
    }

    @Transactional
    public void deleteDepot(Long id) {
        Depot depot = depotRepository.findById(id)
                .orElseThrow(() -> new DepotNotFoundException(id));
        
        // Les ProjetDepot seront supprimés automatiquement grâce à cascade = CascadeType.ALL, orphanRemoval = true
        depotRepository.deleteById(id);
    }
}
