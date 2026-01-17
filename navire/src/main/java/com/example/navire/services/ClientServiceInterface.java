package com.example.navire.services;

import com.example.navire.dto.ClientDTO;
import com.example.navire.dto.ClientProjetDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface ClientServiceInterface {
    List<ClientDTO> getAllClients();
    ClientDTO getClientById(Long id);
    List<ClientDTO> getClientsByProjetId(Long projetId);
    Page<ClientProjetDTO> getClientsByProjetPaged(Long projetId, String search, String filter, String numero, String nom, String mf, String adresse, Pageable pageable);
    ClientDTO createClient(ClientDTO dto);
    ClientDTO updateClient(Long id, ClientDTO dto);
    void deleteClient(Long id);
    Page<ClientDTO> searchClients(String search, Pageable pageable);
    Page<ClientDTO> searchClients(String search, String filter, String numero, String nom, String mf, String adresse, Pageable pageable);
}
