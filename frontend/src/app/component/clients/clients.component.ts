import { Component } from '@angular/core';
import { ClientControllerService } from '../../api/api/clientController.service';
import { ClientDTO } from '../../api/model/clientDTO';

@Component({
  selector: 'app-clients',
  templateUrl: './clients.component.html',
  styleUrls: ['./clients.component.css']
})
export class ClientsComponent {
  clients: ClientDTO[] = [];
  selectedClient: ClientDTO | null = null;
  newClient: ClientDTO = { nom: '', numero: '', adresse: '', mf: '' };
  editMode: boolean = false;
  error: string = '';
  isSidebarOpen: boolean = true;
  showAddClient: boolean = false;
  clientFilter: string = '';
  dialogClient: ClientDTO = { nom: '', numero: '', adresse: '', mf: '' };

  // Backend Pagination
  currentPage: number = 1;
  pageSize: number = 5;
  totalPages: number = 1;
  pageSizes: number[] = [5, 10, 20, 50];
  totalElements: number = 0;
  paginatedClients: ClientDTO[] = [];

  Math = Math;

  constructor(private clientService: ClientControllerService) {
    this.loadClients();
  }

  loadClients() {
    // Backend pages are 0-based, UI is 1-based
    (this.clientService as any).getPagedClients(
      this.currentPage - 1,
      this.pageSize,
      this.clientFilter
    ).subscribe({
      next: (data: any) => {
        this.paginatedClients = data.content || [];
        this.totalElements = data.totalElements || 0;
        this.totalPages = data.totalPages || 1;
      },
      error: (err: any) => {
        this.error = 'Erreur lors du chargement des clients';
        console.error(err);
        this.paginatedClients = [];
        this.totalElements = 0;
        this.totalPages = 1;
      }
    });
  }

  filterClients() {
    this.currentPage = 1;
    this.loadClients();
  }

  // Sorting is not implemented in backend yet. If needed, add sort params to API and here.

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadClients();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.loadClients();
  }

  selectClient(client: ClientDTO) {
    this.selectedClient = client;
    this.editMode = false;
  }

  addClient() {
    this.dialogClient = { nom: '', numero: '', adresse: '', mf: '' };
    this.showAddClient = true;
    this.editMode = false;
  }

  saveClient() {
    if (this.dialogClient.nom && this.dialogClient.numero) {
      this.clientService.createClient(this.dialogClient).subscribe({
        next: () => {
          this.loadClients();
          this.showAddClient = false;
          this.dialogClient = { nom: '', numero: '', adresse: '', mf: '' };
        },
        error: (err) => {
          this.error = 'Erreur lors de la création du client';
          console.error(err);
        }
      });
    }
  }

  editClient(client: ClientDTO) {
    this.dialogClient = {
      id: client.id,
      nom: client.nom,
      numero: client.numero,
      adresse: client.adresse,
      mf: client.mf,
      quantitesAutoriseesParProjet: client.quantitesAutoriseesParProjet
    };
    this.editMode = true;
    this.showAddClient = true;
  }

  updateClient() {
    if (this.dialogClient.id) {
      this.clientService.updateClient(this.dialogClient.id, this.dialogClient).subscribe({
        next: () => {
          this.loadClients();
          this.showAddClient = false;
          this.editMode = false;
        },
        error: (err) => {
          this.error = 'Erreur lors de la mise à jour du client';
          console.error(err);
        }
      });
    }
  }

  deleteClient(client: ClientDTO) {
    if (client.id && confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) {
      this.clientService.deleteClient(client.id).subscribe({
        next: () => {
          this.loadClients();
        },
        error: (err) => {
          this.error = 'Erreur lors de la suppression du client';
          console.error(err);
        }
      });
    }
  }

  cancel() {
    this.showAddClient = false;
    this.editMode = false;
  }
}