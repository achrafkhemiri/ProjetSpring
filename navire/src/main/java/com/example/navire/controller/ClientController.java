
package com.example.navire.controller;
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
    @Autowired
    private ClientServiceInterface clientService;

    @GetMapping
    public List<ClientDTO> getAllClients() {
        return clientService.getAllClients();
    }

    @GetMapping("/paged")
    public Page<ClientDTO> getClientsPaged(
        @RequestParam(value = "search", required = false, defaultValue = "") String search,
        @RequestParam(value = "filter", required = false) String filter,
        @RequestParam(value = "numero", required = false) String numero,
        @RequestParam(value = "nom", required = false) String nom,
        @RequestParam(value = "mf", required = false) String mf,
        @RequestParam(value = "adresse", required = false) String adresse,
        Pageable pageable
    ) {
        return clientService.searchClients(search != null ? search : "", filter, numero, nom, mf, adresse, pageable);
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
        @RequestParam(value = "filter", required = false) String filter,
        @RequestParam(value = "numero", required = false) String numero,
        @RequestParam(value = "nom", required = false) String nom,
        @RequestParam(value = "mf", required = false) String mf,
        @RequestParam(value = "adresse", required = false) String adresse,
        Pageable pageable
    ) {
        return clientService.getClientsByProjetPaged(projetId, search, filter, numero, nom, mf, adresse, pageable);
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
