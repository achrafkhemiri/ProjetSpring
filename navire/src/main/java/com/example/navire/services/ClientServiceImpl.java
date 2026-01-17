package com.example.navire.services;

import com.example.navire.dto.ClientDTO;
import com.example.navire.dto.ClientProjetDTO;
import com.example.navire.dto.AutorisationDTO;
import com.example.navire.mapper.ClientMapper;
import com.example.navire.model.Client;
import com.example.navire.model.ProjetClient;
import com.example.navire.repository.ProjetClientRepository;
import com.example.navire.repository.ProjetRepository;
import com.example.navire.repository.ClientRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ClientServiceImpl implements ClientServiceInterface {
    @Autowired
    private ClientRepository clientRepository;

    @Autowired
    private ProjetClientRepository projetClientRepository;

    @Autowired
    private ProjetRepository projetRepository;
    @Autowired
    private ClientMapper clientMapper;

    @Override
    public Page<ClientDTO> searchClients(String search, Pageable pageable) {
        return searchClients(search, null, null, null, null, null, pageable);
    }

    @Override
    public Page<ClientDTO> searchClients(String search, String filter, String numero, String nom, String mf, String adresse, Pageable pageable) {
        String effectiveSearch = (search != null && !search.isBlank()) ? search : filter;
        if (effectiveSearch == null) {
            effectiveSearch = "";
        }
        Page<Client> page = clientRepository.search(effectiveSearch, numero, nom, mf, adresse, pageable);
        return page.map(clientMapper::toDTO);
    }

    @Override
    public java.util.List<ClientDTO> getAllClients() {
        return clientRepository.findAll().stream()
                .map(clientMapper::toDTO)
                .collect(java.util.stream.Collectors.toList());
    }

    @Override
    public ClientDTO getClientById(Long id) {
        Client client = clientRepository.findById(id)
                .orElseThrow(() -> new com.example.navire.exception.ClientNotFoundException(id));
        return clientMapper.toDTO(client);
    }

    @Override
    public java.util.List<ClientDTO> getClientsByProjetId(Long projetId) {
        if (projetId == null) {
            throw new IllegalArgumentException("projetId is required");
        }

        if (!projetRepository.existsById(projetId)) {
            throw new com.example.navire.exception.ProjetNotFoundException(projetId);
        }

        List<ProjetClient> projetClients = projetClientRepository.findByProjetIdWithClientAndAutorisation(projetId);

        Map<Long, ClientDTO> dedupByClientId = new LinkedHashMap<>();
        for (ProjetClient projetClient : projetClients) {
            if (projetClient == null || projetClient.getClient() == null) {
                continue;
            }

            Client client = projetClient.getClient();
            ClientDTO dto = dedupByClientId.computeIfAbsent(client.getId(), ignored -> {
                ClientDTO created = new ClientDTO();
                created.setId(client.getId());
                created.setNumero(client.getNumero());
                created.setNom(client.getNom());
                created.setAdresse(client.getAdresse());
                created.setMf(client.getMf());
                created.setQuantitesAutoriseesParProjet(new HashMap<>());
                return created;
            });

            Double total = null;
            if (projetClient.getAutorisation() != null && !projetClient.getAutorisation().isEmpty()) {
                total = projetClient.getAutorisation().stream()
                        .filter(a -> a != null && a.getQuantite() != null)
                        .mapToDouble(a -> a.getQuantite())
                        .sum();
            } else if (projetClient.getQuantiteAutorisee() != null) {
                total = projetClient.getQuantiteAutorisee();
            }

            if (total != null) {
                Map<Long, Double> map = dto.getQuantitesAutoriseesParProjet();
                if (map == null) {
                    map = new HashMap<>();
                    dto.setQuantitesAutoriseesParProjet(map);
                }
                map.merge(projetId, total, Double::sum);
            }
        }

        return new ArrayList<>(dedupByClientId.values());
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ClientProjetDTO> getClientsByProjetPaged(Long projetId, String search, String filter, String numero, String nom, String mf, String adresse, Pageable pageable) {
        if (projetId == null) {
            throw new IllegalArgumentException("projetId is required");
        }

        if (!projetRepository.existsById(projetId)) {
            throw new com.example.navire.exception.ProjetNotFoundException(projetId);
        }

        String effectiveSearch = (search != null && !search.isBlank()) ? search : filter;
        if (effectiveSearch == null) {
            effectiveSearch = "";
        }

        Page<ProjetClient> page = projetClientRepository.searchByProjetId(projetId, effectiveSearch, numero, nom, mf, adresse, pageable);
        List<ClientProjetDTO> content = page.getContent().stream()
                .filter(pc -> pc != null && pc.getClient() != null)
                .map(pc -> {
                    Client c = pc.getClient();

                    Double total = null;
                    if (pc.getAutorisation() != null && !pc.getAutorisation().isEmpty()) {
                        total = pc.getAutorisation().stream()
                                .filter(a -> a != null && a.getQuantite() != null)
                                .mapToDouble(a -> a.getQuantite())
                                .sum();
                    } else if (pc.getQuantiteAutorisee() != null) {
                        total = pc.getQuantiteAutorisee();
                    }

                    java.util.Set<AutorisationDTO> authDtos = null;
                    if (pc.getAutorisation() != null && !pc.getAutorisation().isEmpty()) {
                        authDtos = pc.getAutorisation().stream()
                                .filter(a -> a != null)
                                .map(a -> new AutorisationDTO(a.getCode(), a.getQuantite()))
                                .collect(java.util.stream.Collectors.toSet());
                    }

                    Map<Long, Double> qMap = new HashMap<>();
                    if (total != null) {
                        qMap.put(projetId, total);
                    }

                    ClientProjetDTO dto = new ClientProjetDTO();
                    dto.setId(c.getId());
                    dto.setNumero(c.getNumero());
                    dto.setNom(c.getNom());
                    dto.setAdresse(c.getAdresse());
                    dto.setMf(c.getMf());
                    dto.setProjetClientId(pc.getId());
                    dto.setProjetId(projetId);
                    dto.setAutorisation(authDtos);
                    dto.setQuantiteAutorisee(total != null ? total : 0.0);
                    dto.setQuantitesAutoriseesParProjet(qMap);
                    return dto;
                })
                .collect(java.util.stream.Collectors.toList());

        return new PageImpl<>(content, pageable, page.getTotalElements());
    }

    @Override
    public ClientDTO createClient(ClientDTO dto) {
        if (clientRepository.existsByNumero(dto.getNumero())) {
            throw new IllegalArgumentException("Numero already exists");
        }
        Client client = clientMapper.toEntity(dto);
        return clientMapper.toDTO(clientRepository.save(client));
    }

    @Override
    public ClientDTO updateClient(Long id, ClientDTO dto) {
        Client client = clientRepository.findById(id)
                .orElseThrow(() -> new com.example.navire.exception.ClientNotFoundException(id));
        client.setNumero(dto.getNumero());
        client.setNom(dto.getNom());
        client.setAdresse(dto.getAdresse());
        client.setMf(dto.getMf());
        return clientMapper.toDTO(clientRepository.save(client));
    }

    @Override
    public void deleteClient(Long id) {
        if (!clientRepository.existsById(id)) {
            throw new com.example.navire.exception.ClientNotFoundException(id);
        }
        clientRepository.deleteById(id);
    }
}
