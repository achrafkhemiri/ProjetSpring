package com.example.navire.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.example.navire.dto.ClientDTO;
import com.example.navire.dto.ClientProjetDTO;
import com.example.navire.dto.AutorisationDTO;
import com.example.navire.mapper.ClientMapper;
import com.example.navire.model.Client;
import com.example.navire.model.ProjetClient;
import com.example.navire.model.Autorisation;
import com.example.navire.repository.ClientRepository;
import com.example.navire.repository.ProjetClientRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
public class ClientServiceImpl implements ClientServiceInterface {
    private static final Logger log = LoggerFactory.getLogger(ClientServiceImpl.class);

    @Autowired
    private ClientRepository clientRepository;
    @Autowired
    private ClientMapper clientMapper;
    @Autowired
    private ProjetClientRepository projetClientRepository;

    @Override
    public Page<ClientDTO> searchClients(String search, Pageable pageable) {
        Page<Client> page = clientRepository.findByNomContainingIgnoreCaseOrNumeroContainingIgnoreCase(search, search, pageable);
        return page.map(clientMapper::toDTO);
    }

    @Override
    public Page<ClientProjetDTO> searchClientsByProjet(Long projetId, String search, Pageable pageable) {
        String safeSearch = (search == null) ? "" : search;
        log.info("[ClientService] searchClientsByProjet projetId={} search='{}' pageable={}", projetId, safeSearch, pageable);
        Page<ProjetClient> page = projetClientRepository.findProjetClientsByProjetIdAndSearch(projetId, safeSearch, pageable);
        log.info("[ClientService] searchClientsByProjet -> totalElements={}, totalPages={}, pageNumber={}, size={}, returnedElements={}",
                page.getTotalElements(), page.getTotalPages(), page.getNumber(), page.getSize(), page.getNumberOfElements());
        return page.map(pc -> {
            Client client = pc.getClient();

            java.util.Set<AutorisationDTO> autorisations = null;
            if (pc.getAutorisation() != null) {
                autorisations = pc.getAutorisation().stream()
                        .filter(a -> a != null)
                        .map(a -> new AutorisationDTO(a.getCode(), a.getQuantite()))
                        .collect(java.util.stream.Collectors.toSet());
            }

            Double quantiteAutorisee = pc.getQuantiteAutorisee();
            java.util.Map<Long, Double> quantitesAutoriseesParProjet = new java.util.HashMap<>();
            quantitesAutoriseesParProjet.put(projetId, quantiteAutorisee != null ? quantiteAutorisee : 0d);

            return new ClientProjetDTO(
                    client != null ? client.getId() : null,
                    client != null ? client.getNumero() : null,
                    client != null ? client.getNom() : null,
                    client != null ? client.getAdresse() : null,
                    client != null ? client.getMf() : null,
                    projetId,
                    pc.getId(),
                    autorisations,
                    quantiteAutorisee,
                    quantitesAutoriseesParProjet
            );
        });
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
        java.util.List<Client> clients = projetClientRepository.findClientsByProjetId(projetId);
        return clients.stream()
                .map(clientMapper::toDTO)
                .collect(java.util.stream.Collectors.toList());
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
