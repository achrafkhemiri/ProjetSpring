package com.example.navire.services;

import com.example.navire.dto.ClientDTO;
import com.example.navire.mapper.ClientMapper;
import com.example.navire.model.Client;
import com.example.navire.repository.ClientRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
public class ClientServiceImpl implements ClientServiceInterface {
    @Autowired
    private ClientRepository clientRepository;
    @Autowired
    private ClientMapper clientMapper;

    @Override
    public Page<ClientDTO> searchClients(String search, Pageable pageable) {
        Page<Client> page = clientRepository.findByNomContainingIgnoreCaseOrNumeroContainingIgnoreCase(search, search, pageable);
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
        // This requires ProjetClientRepository, so this is a stub. Adjust as needed.
        throw new UnsupportedOperationException("Not implemented: getClientsByProjetId");
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
