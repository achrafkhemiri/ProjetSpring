
package com.example.navire.controller;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import com.example.navire.dto.ClientDTO;
import com.example.navire.dto.ClientProjetDTO;
import com.example.navire.services.ClientServiceInterface;
import com.example.navire.exception.ClientNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import java.util.List;

@RestController
@RequestMapping("/api/clients")
public class ClientController {
    private static final Logger log = LoggerFactory.getLogger(ClientController.class);

    @Autowired
    private ClientServiceInterface clientService;

    @GetMapping
    public List<ClientDTO> getAllClients() {
        return clientService.getAllClients();
    }

    @GetMapping("/paged")
    public Page<ClientDTO> getClientsPaged(
        @RequestParam(value = "search", required = false, defaultValue = "") String search,
        Pageable pageable
    ) {
        String safeSearch = (search == null) ? "" : search;
        log.info("[ClientController] GET /api/clients/paged search='{}' pageable={} ", safeSearch, pageable);
        Page<ClientDTO> page = clientService.searchClients(safeSearch, pageable);
        log.info("[ClientController] /api/clients/paged -> totalElements={}, totalPages={}, contentSize={}",
                page.getTotalElements(), page.getTotalPages(), page.getNumberOfElements());
        return page;
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<ClientDTO> getClientById(@PathVariable Long id) {
        return ResponseEntity.ok(clientService.getClientById(id));
    }

    @GetMapping("/projet/{projetId}")
    public List<ClientDTO> getClientsByProjet(@PathVariable Long projetId) {
        return clientService.getClientsByProjetId(projetId);
    }

    @GetMapping("/projet/{projetId}/paged")
    public Page<ClientProjetDTO> getClientsByProjetPaged(
        @PathVariable Long projetId,
        @RequestParam(value = "search", required = false, defaultValue = "") String search,
        Pageable pageable
    ) {
        String safeSearch = (search == null) ? "" : search;
        log.info("[ClientController] GET /api/clients/projet/{}/paged search='{}' pageable={}", projetId, safeSearch, pageable);
        Page<ClientProjetDTO> page = clientService.searchClientsByProjet(projetId, safeSearch, pageable);
        log.info("[ClientController] /api/clients/projet/{}/paged -> totalElements={}, totalPages={}, contentSize={}",
                projetId, page.getTotalElements(), page.getTotalPages(), page.getNumberOfElements());
        return page;
    }

    @PostMapping
    public ResponseEntity<ClientDTO> createClient(@RequestBody ClientDTO dto) {
        ClientDTO created = clientService.createClient(dto);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ClientDTO> updateClient(@PathVariable Long id, @RequestBody ClientDTO dto) {
        ClientDTO updated = clientService.updateClient(id, dto);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteClient(@PathVariable Long id) {
        clientService.deleteClient(id);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler({ClientNotFoundException.class, IllegalArgumentException.class})
    public ResponseEntity<String> handleException(Exception ex) {
        if (ex instanceof ClientNotFoundException) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ex.getMessage());
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ex.getMessage());
    }
}
