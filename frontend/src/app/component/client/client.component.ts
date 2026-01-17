import { Component, ChangeDetectorRef } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { ClientControllerService } from '../../api/api/clientController.service';
import { ProjetClientControllerService } from '../../api/api/projetClientController.service';
import { ProjetActifService } from '../../service/projet-actif.service';
import { ProjetControllerService } from '../../api/api/projetController.service';
import { VoyageControllerService } from '../../api/api/voyageController.service';
import { DechargementControllerService } from '../../api/api/dechargementController.service';
import { ClientDTO } from '../../api/model/clientDTO';
import { VoyageDTO } from '../../api/model/voyageDTO';
import { BreadcrumbItem } from '../breadcrumb/breadcrumb.component';
import { NotificationService } from '../../service/notification.service';
import { QuantiteService } from '../../service/quantite.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Inject } from '@angular/core';
import { BASE_PATH } from '../../api/variables';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmCodeDialogComponent } from '../../shared/confirm-code-dialog.component';
import { ActivatedRoute, Router } from '@angular/router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-client',
  templateUrl: './client.component.html',
  styleUrls: ['./client.component.css'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0 }))
      ])
    ]),
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'scale(0.8)', opacity: 0 }),
        animate('300ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ transform: 'scale(1)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ transform: 'scale(0.8)', opacity: 0 }))
      ])
    ])
  ]
})
export class ClientComponent {
  clients: ClientDTO[] = [];
  filteredClients: ClientDTO[] = [];
  paginatedClients: ClientDTO[] = [];
  // Global active project (could be different from the project currently visited)
  projetActifId: number | null = null;
  projetActif: any = null;
  // Context project (projet consulté via parametre) stored in sessionStorage
  contextProjetId: number | null = null; 
  contextProjet: any = null;
  breadcrumbItems: BreadcrumbItem[] = []; 
  selectedClient: ClientDTO | null = null;
  newClient: ClientDTO = { nom: '', numero: '' };
  editMode: boolean = false;
  error: string = '';
  isSidebarOpen: boolean = true;
  showAddClient: boolean = false;
  clientFilter: string = '';

  // Optional field filters driven by URL query params
  filterNom: string = '';
  filterNumero: string = '';
  filterMf: string = '';
  filterAdresse: string = '';
  dialogClient: ClientDTO = { nom: '', numero: '', adresse: '', mf: '' };
  
  // Pour l'autocomplétion type Select2
  allClients: ClientDTO[] = []; // Tous les clients (toutes les BDD)
  filteredSuggestions: ClientDTO[] = [];
  showSuggestions: boolean = false;
  selectedExistingClient: ClientDTO | null = null;
  
  // Voyages pour calculer le reste
  voyages: VoyageDTO[] = [];
  dechargements: any[] = [];
  
  // Alerte temporaire
  showAlert: boolean = false;
  alertMessage: string = '';
  alertType: 'success' | 'danger' | 'warning' | 'info' = 'info';
  
  // Modal de quantité
  showQuantiteModal: boolean = false;
  quantiteAutorisee: number = 0;
  pendingClientId: number | null = null;
  // Add-mode autorisation state (for the add client -> association modal)
  addAutorisationMode: boolean = false;
  addingAutorisation: Array<{ code?: string; quantite?: number }> = [];
  
  // Modal de modification de quantité
  showEditQuantiteModal: boolean = false;
  editingClient: any = null;
  newQuantiteAutorisee: number = 0;
  // Autorisation editing state
  editAutorisationMode: boolean = false;
  editingAutorisation: Array<{ code?: string; quantite?: number }> = [];
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 5;
  totalPages: number = 1;
  totalElements: number = 0;
  pageSizes: number[] = [5, 10, 20, 50];
  
  // Sorting
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  
  // Date Filter
  dateFilterActive: boolean = false;
  dateDebut: string | null = null;
  dateFin: string | null = null;
  // Date max pour le filtre (aujourd'hui)
  today: string = '';
  
  // Modal de confirmation/erreur
  showConfirmModal: boolean = false;
  showErrorModal: boolean = false;
  modalTitle: string = '';
  modalMessage: string = '';
  modalIcon: string = '';
  modalIconColor: string = '';
  clientToDelete: number | null = null;
  
  // Expose Math to template
  Math = Math;

  private lastClientQueryKey: string = '';
  private lastDateQueryKey: string = '';

  private clampDateFilterToToday() {
    // Clamp future dates for consistent behavior and shareable URLs
    if (this.dateDebut && this.today && this.dateDebut > this.today) {
      this.dateDebut = this.today;
    }
    if (this.dateFin && this.today && this.dateFin > this.today) {
      this.dateFin = this.today;
    }
  }

  private refreshComputedValues() {
    // Date filter only affects computed totals in template; avoid reloading clients.
    this.filteredClients = this.clients;
    this.paginatedClients = this.clients;
    this.cdr.detectChanges();
  }

  private toBackendSort(sortColumn: string, dir: 'asc' | 'desc'): string | null {
    const c = (sortColumn || '').trim();
    if (!c) return null;

    // Project-scoped paging endpoint is based on ProjetClient, so client fields must be prefixed.
    switch (c) {
      case 'nom':
      case 'numero':
      case 'adresse':
      case 'mf':
        return `client.${c},${dir}`;
      case 'id':
        return `client.id,${dir}`;
      default:
        // Derived columns (quantite, reste, quantiteVendue) are not sortable server-side.
        return null;
    }
  }

  constructor(
    private clientService: ClientControllerService,
    private projetClientService: ProjetClientControllerService,
    private projetActifService: ProjetActifService,
    private projetService: ProjetControllerService,
    private voyageService: VoyageControllerService,
    private notificationService: NotificationService,
    private quantiteService: QuantiteService,
  private dechargementService: DechargementControllerService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    @Inject(BASE_PATH) private basePath: string,
    private cdr: ChangeDetectorRef
  ) {
    // 🔥 Écouter les changements du projet actif
    this.projetActifService.projetActif$.subscribe(projet => {
      console.log('📡 Notification reçue du service - Nouveau projet:', projet);
      
      if (projet && projet.id) {
        const previousId = this.projetActifId;
        this.projetActifId = projet.id;
        this.projetActif = projet;
        
        // 🔥 FIX : Recharger si le projet change OU si c'est la première fois
        if (!previousId || previousId !== projet.id) {
          console.log('🔄 Rechargement des clients - previousId:', previousId, 'newId:', projet.id);
          // Attendre un peu pour que la navigation se termine
          setTimeout(() => {
            this.reloadData();
          }, 50);
        }
      }
    });

    // Écouter les rafraîchissements globaux (utilisé par d'autres composants via notificationService.rafraichir())
    this.notificationService.onRefresh().subscribe(() => {
      console.log('🔔 [Client] notificationService rafraîchir reçu - rechargement des données clients et déchargements');
      // Recharger uniquement ce qui est nécessaire pour mettre à jour les quantités par code
      this.loadDechargements();
      this.loadClients();
      this.loadVoyages();
    });
    
    this.initializeProjetContext();
    // Initialiser la date du jour
    this.today = this.getTodayString();

    // URL-driven pagination/search/sort for /client
    this.route.queryParamMap.subscribe(params => {
      const page = Number(params.get('page') || '1') || 1;
      const sizeParam = params.get('size');
      const size = Number(sizeParam || String(this.pageSize)) || this.pageSize;
      const search = (params.get('search') ?? '').toString();
      const filter = (params.get('filter') ?? '').toString();
      const nom = (params.get('nom') ?? '').toString();
      const numero = (params.get('numero') ?? '').toString();
      const mf = (params.get('mf') ?? '').toString();
      const adresse = (params.get('adresse') ?? '').toString();
      const sort = (params.get('sort') ?? '').toString();
      const dirRaw = (params.get('dir') ?? 'asc').toString().toLowerCase();
      const dir: 'asc' | 'desc' = dirRaw === 'desc' ? 'desc' : 'asc';

      // Date filter params (client-side only)
      const dateDebutParam = params.get('dateDebut');
      const dateFinParam = params.get('dateFin');
      const dateActiveRaw = (params.get('dateActive') ?? '').toString().toLowerCase();
      const dateActive = (dateActiveRaw === '1' || dateActiveRaw === 'true' || !!dateDebutParam || !!dateFinParam);

      // Ensure URL always contains size for share/refresh consistency
      if (!sizeParam) {
        this.updateClientUrlQuery({ size, page: Math.max(1, page) });
      }

      const effectiveText = (search && search.trim().length > 0) ? search : filter;
      const clientKey = `${page}|${size}|${effectiveText}|${nom}|${numero}|${mf}|${adresse}|${sort}|${dir}`;
      const dateKey = `${dateActive ? '1' : '0'}|${dateDebutParam ?? ''}|${dateFinParam ?? ''}`;

      if (dateKey !== this.lastDateQueryKey) {
        this.lastDateQueryKey = dateKey;
        this.dateFilterActive = dateActive;
        this.dateDebut = dateDebutParam ? dateDebutParam.toString() : null;
        this.dateFin = dateFinParam ? dateFinParam.toString() : null;
        this.clampDateFilterToToday();
        this.refreshComputedValues();
      }

      if (clientKey === this.lastClientQueryKey) return;
      this.lastClientQueryKey = clientKey;

      this.currentPage = Math.max(1, page);
      this.pageSize = size;
      this.clientFilter = effectiveText;
      this.filterNom = nom;
      this.filterNumero = numero;
      this.filterMf = mf;
      this.filterAdresse = adresse;
      this.sortColumn = sort;
      this.sortDirection = dir;

      this.loadClients();
    });
  }

  private updateClientUrlQuery(partial: { page?: number; size?: number; search?: string | null; filter?: string | null; nom?: string | null; numero?: string | null; mf?: string | null; adresse?: string | null; sort?: string | null; dir?: 'asc' | 'desc' | null; dateActive?: boolean | null; dateDebut?: string | null; dateFin?: string | null }) {
    const queryParams: any = {};
    if (partial.page !== undefined) queryParams.page = partial.page;
    if (partial.size !== undefined) queryParams.size = partial.size;
    if (partial.search !== undefined) {
      const v = (partial.search ?? '').toString().trim();
      queryParams.search = v.length > 0 ? v : null;
    }
    if (partial.filter !== undefined) {
      const v = (partial.filter ?? '').toString().trim();
      queryParams.filter = v.length > 0 ? v : null;
    }
    if (partial.nom !== undefined) {
      const v = (partial.nom ?? '').toString().trim();
      queryParams.nom = v.length > 0 ? v : null;
    }
    if (partial.numero !== undefined) {
      const v = (partial.numero ?? '').toString().trim();
      queryParams.numero = v.length > 0 ? v : null;
    }
    if (partial.mf !== undefined) {
      const v = (partial.mf ?? '').toString().trim();
      queryParams.mf = v.length > 0 ? v : null;
    }
    if (partial.adresse !== undefined) {
      const v = (partial.adresse ?? '').toString().trim();
      queryParams.adresse = v.length > 0 ? v : null;
    }
    if (partial.sort !== undefined) {
      const v = (partial.sort ?? '').toString().trim();
      queryParams.sort = v.length > 0 ? v : null;
    }
    if (partial.dir !== undefined) {
      queryParams.dir = partial.dir ?? null;
    }

    if (partial.dateActive !== undefined) {
      queryParams.dateActive = partial.dateActive ? '1' : null;
    }
    if (partial.dateDebut !== undefined) {
      const v = (partial.dateDebut ?? '').toString().trim();
      queryParams.dateDebut = v.length > 0 ? v : null;
    }
    if (partial.dateFin !== undefined) {
      const v = (partial.dateFin ?? '').toString().trim();
      queryParams.dateFin = v.length > 0 ? v : null;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  initializeProjetContext() {
    // 1. Global active project
    const globalProjet = this.projetActifService.getProjetActif();
    if (globalProjet && globalProjet.id) {
      this.projetActifId = globalProjet.id;
      this.projetActif = globalProjet;
    }

    // 2. Context project (visited project via /projet/:id/parametre then navigation)
    const contextId = window.sessionStorage.getItem('projetActifId');
    if (contextId) {
      this.contextProjetId = Number(contextId);
      // Load context project details (can differ from global active)
      this.loadProjetDetails(this.contextProjetId, true);
    }

    this.loadAllClients(); // Charger tous les clients pour l'autocomplétion
    this.loadClients();
    this.loadVoyages(); // Charger les voyages pour calculer le reste
    this.loadDechargements(); // Charger les déchargements pour les quantités par code
  }

  // 🔥 Méthode pour recharger toutes les données
  reloadData() {
    console.log('🔄 [Client] reloadData() - Projet actif:', this.projetActif?.nom, 'ID:', this.projetActifId);
    
    // 🔥 IMPORTANT : En mode rechargement, on utilise TOUJOURS le projet actif global
    // Le sessionStorage n'est utilisé QUE pour la navigation contextuelle (depuis /projet/:id/parametre)
    const currentUrl = window.location.pathname;
    const isOnParametrePage = currentUrl.includes('/parametre');
    
    if (isOnParametrePage) {
      // On est sur une page de paramètres, utiliser le contexte sessionStorage
      const contextId = window.sessionStorage.getItem('projetActifId');
      if (contextId) {
        const contextIdNumber = Number(contextId);
        console.log('📌 [Client] Page paramètre - Contexte:', contextIdNumber);
        this.contextProjetId = contextIdNumber;
        if (contextIdNumber !== this.projetActifId) {
          this.loadProjetDetails(this.contextProjetId, true);
        } else {
          this.contextProjet = this.projetActif;
        }
      }
    } else {
      // On n'est PAS sur une page de paramètres → Mode "Vue Projet Actif"
      // Ignorer le sessionStorage et utiliser le projet actif global
      console.log('🏠 [Client] Mode Vue Projet Actif - Projet:', this.projetActif?.nom);
      this.contextProjetId = null;
      this.contextProjet = null;
    }
    
  // Recharger toutes les données
  this.loadAllClients();
  this.loadClients();
  this.loadVoyages();
  this.loadDechargements();
  this.updateBreadcrumb();
  }

  loadProjetDetails(projetId: number, isContext: boolean = false) {
    this.projetService.getProjetById(projetId, 'body').subscribe({
      next: async (data: any) => {
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            const parsed = JSON.parse(text);
            if (isContext) {
              this.contextProjet = parsed;
              this.updateBreadcrumb();
            } else {
              this.projetActif = parsed;
            }
          } catch (e) {
            console.error('Erreur parsing projet:', e);
          }
        } else {
          if (isContext) {
            this.contextProjet = data;
            this.updateBreadcrumb();
          } else {
            this.projetActif = data;
          }
        }
      },
      error: (err: any) => {
        console.error('Erreur chargement projet:', err);
      }
    });
  }

  updateBreadcrumb() {
    const projet = this.contextProjet || this.projetActif;
    if (projet) {
      this.breadcrumbItems = [
        { label: 'Projets', url: '/projet' },
        { label: projet.nom || `Projet ${projet.id}`, url: `/projet/${projet.id}/parametre` },
        { label: 'Paramètres', url: `/projet/${projet.id}/parametre` },
        { label: 'Clients' }
      ];
    } else {
      this.breadcrumbItems = [
        { label: 'Clients' }
      ];
    }
  }

  // IMPORTANT: Cette méthode est pour FILTRER les données (garde le comportement actuel)
  isProjetActif(): boolean {
    // Pour filtrage on utilise le contexte si disponible, sinon global
    return !!(this.contextProjetId || this.projetActifId);
  }

  // NOUVELLE: Cette méthode est UNIQUEMENT pour les boutons Ajouter
  canAddData(): boolean {
    // Si on visite un autre projet, on contrôle selon ce projet contextuel
    if (this.contextProjet) {
      return this.contextProjet.active === true;
    }
    return !!(this.projetActif && this.projetActif.active === true);
  }

  openAddDialog() {
    this.dialogClient = { nom: '', numero: '', adresse: '', mf: '' };
    this.selectedExistingClient = null;
    this.showAddClient = true;
    this.editMode = false;
    this.showSuggestions = false;
    this.filteredSuggestions = [];
  }
  
  // Charger tous les clients de la base de données
  loadAllClients() {
    this.clientService.getAllClients('body').subscribe({
      next: async (data) => {
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            const parsed = JSON.parse(text);
            this.allClients = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            this.allClients = [];
          }
        } else {
          this.allClients = Array.isArray(data) ? data : [];
        }
      },
      error: (err) => {
        console.error('Erreur chargement tous les clients:', err);
        this.allClients = [];
      }
    });
  }
  
  // Filtrer les suggestions lors de la saisie
  onClientInputChange(field: 'nom' | 'numero') {
    const searchValue = field === 'nom' ? this.dialogClient.nom : this.dialogClient.numero;
    
    if (!searchValue || searchValue.trim().length < 2) {
      this.showSuggestions = false;
      this.filteredSuggestions = [];
      this.selectedExistingClient = null;
      return;
    }
    
    const searchLower = searchValue.trim().toLowerCase();
    
    // Filtrer les clients qui correspondent et qui ne sont PAS déjà dans le projet actuel
    const targetProjetId = this.contextProjetId || this.projetActifId;
    this.filteredSuggestions = this.allClients.filter(client => {
      // Vérifier si le client correspond à la recherche
      const nomMatch = client.nom?.toLowerCase().includes(searchLower);
      const numeroMatch = client.numero?.toLowerCase().includes(searchLower);
      const matchesSearch = nomMatch || numeroMatch;
      
      // Vérifier si le client n'est pas déjà dans le projet
      const notInProject = !this.clients.some(c => c.id === client.id);
      
      return matchesSearch && notInProject;
    }).slice(0, 10); // Limiter à 10 suggestions
    
    this.showSuggestions = this.filteredSuggestions.length > 0;
    this.selectedExistingClient = null;
  }
  
  // Sélectionner un client existant depuis les suggestions
  selectSuggestion(client: ClientDTO) {
    this.selectedExistingClient = client;
    this.dialogClient.nom = client.nom || '';
    this.dialogClient.numero = client.numero || '';
    this.dialogClient.adresse = client.adresse || '';
    this.dialogClient.mf = client.mf || '';
    this.showSuggestions = false;
    this.filteredSuggestions = [];
  }
  
  // Fermer les suggestions si on clique ailleurs
  closeSuggestions() {
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  

  selectClient(cl: ClientDTO) {
    this.dialogClient = {
      id: cl.id,
      nom: cl.nom,
      numero: cl.numero,
      adresse: cl.adresse,
      mf: cl.mf,
      quantitesAutoriseesParProjet: cl.quantitesAutoriseesParProjet
    };
    this.selectedClient = cl;
    this.editMode = true;
    this.showAddClient = true;
  }

  // Helper: retourne aujourd'hui au format yyyy-MM-dd (heure locale)
  private getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth()+1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  addDialogClient() {
    if (!this.dialogClient.nom || !this.dialogClient.numero) {
      this.error = 'Veuillez remplir tous les champs.';
      return;
    }
    
    const targetProjetId = this.contextProjetId || this.projetActifId;
    console.log('🔵 addDialogClient() - targetProjetId:', targetProjetId, 'contextProjetId:', this.contextProjetId, 'projetActifId:', this.projetActifId);
    
    if (!targetProjetId) {
      this.showTemporaryAlert(
        'Aucun projet actif. Veuillez d\'abord sélectionner un projet.',
        'danger'
      );
      return;
    }
    
    // Si un client existant a été sélectionné, on l'associe au projet
    if (this.selectedExistingClient && this.selectedExistingClient.id) {
      // Vérifier si le client est déjà associé à ce projet
      const isAlreadyInProject = this.clients.some(c => c.id === this.selectedExistingClient!.id);
      
      if (isAlreadyInProject) {
        this.showTemporaryAlert(
          'Ce client est déjà associé à ce projet.',
          'warning'
        );
        this.closeDialog();
        return;
      }
      
      console.log('✅ Association client existant:', this.selectedExistingClient.id, 'au projet:', targetProjetId);
      // Associer le client existant au projet
      this.askQuantiteAndAssociate(this.selectedExistingClient.id);
      this.dialogClient = { nom: '', numero: '', adresse: '', mf: '' };
      this.closeDialog();
      return;
    }
    
    // Sinon, créer un nouveau client (SANS projetId - l'association se fait via ProjetClient)
    console.log('🆕 Création nouveau client:', this.dialogClient.nom, 'pour le projet:', targetProjetId);
   
    this.clientService.createClient(this.dialogClient, 'body').subscribe({
      next: (createdClient) => {
        console.log('✅ Client créé:', createdClient);
    
        let clientId: number | undefined;
        if (createdClient instanceof Blob) {
          createdClient.text().then(text => {
            try {
              const client = JSON.parse(text);
              clientId = client.id;
              console.log('➡️ Association client', clientId, 'au projet', targetProjetId);
              // Fermer le dialogue d'ajout AVANT d'ouvrir la modal quantité
              this.dialogClient = { nom: '', numero: '', adresse: '', mf: '' };
              this.closeDialog();
              // Ouvrir la modal quantité
              this.askQuantiteAndAssociate(clientId);
            } catch (e) { 
              console.error('❌ Erreur parsing client:', e); 
            }
          });
        } else {
          clientId = createdClient.id;
          console.log('➡️ Association client', clientId, 'au projet', targetProjetId);
          // Fermer le dialogue d'ajout AVANT d'ouvrir la modal quantité
          this.dialogClient = { nom: '', numero: '', adresse: '', mf: '' };
          this.closeDialog();
          // Ouvrir la modal quantité
          this.askQuantiteAndAssociate(clientId);
        }
      },
      error: (err) => {
        console.error('❌ Erreur création client:', err);
        this.error = 'Erreur ajout: ' + (err.error?.message || err.message);
      }
    });
  }

  // Ask user for quantiteAutorisee and then associate using ProjetController endpoint
  askQuantiteAndAssociate(clientId?: number) {
    const targetProjetId = this.contextProjetId || this.projetActifId;
 
    if (!clientId || !targetProjetId) return;
    
    // Ouvrir la modal personnalisée au lieu du prompt système
    this.pendingClientId = clientId;
    this.quantiteAutorisee = 0;
    // Default to autorisation mode for new associations (per new data model)
    this.addAutorisationMode = true;
    // Initialize with one default autorisation row (code '1' per request)
    this.addingAutorisation = [{ code: '1', quantite: 0 }];
    this.showQuantiteModal = true;
  }
  
  // Confirmer l'ajout du client avec la quantité saisie
  confirmQuantiteAndAssociate() {
    const targetProjetId = this.contextProjetId || this.projetActifId;
    const clientId = this.pendingClientId;

    if (!clientId || !targetProjetId) {
      this.showTemporaryAlert('Erreur: Données manquantes pour l\'association.', 'danger');
      return;
    }

    // We only support Autorisations when adding a client to a projet
    const autorisations = (this.addingAutorisation || [])
      .map(a => ({ code: (a.code && a.code.trim()) ? a.code.trim() : '1', quantite: Number(a.quantite) || 0 }))
      .filter(a => a.quantite > 0);

    if (!autorisations.length) {
      this.showTemporaryAlert('Veuillez ajouter au moins une autorisation (code et quantité).', 'warning');
      return;
    }

    const totalToAdd = autorisations.reduce((s, a) => s + a.quantite, 0);

    // Check remaining quantity before calling API
    this.quantiteService.getQuantiteRestante(targetProjetId).subscribe({
      next: (quantiteRestante) => {
        if (totalToAdd > quantiteRestante) {
          this.showTemporaryAlert('Impossible d\'ajouter le client : la quantité autorisée dépasse la quantité restante.', 'danger');
          return;
        }

  // Include the total quantity as quantiteAutorisee so the backend (which
  // currently supports quantiteAutorisee) stores the correct total even
  // if it doesn't persist the per-code breakdown yet.
  const body = { autorisation: autorisations, quantiteAutorisee: totalToAdd };
        this.projetService.addClientToProjet(targetProjetId, clientId, body).subscribe({
          next: (res) => {
            // close modal first
            this.closeQuantiteModal();

            // prepare success UI text
            const projet = this.contextProjet || this.projetActif;
            const nomProjet = projet?.nom || `Projet ${targetProjetId}`;

            // Attempt to persist the per-code autorisations similarly to the edit flow.
            // The add endpoint may not attach the autorisation array in the same format,
            // so we explicitly call the projet-client autorisation endpoint after creation.
            const tryUpdateAutorisations = (projetClientId?: number) => {
              if (projetClientId) {
                // write autorisations for the created projet-client
                this.http.put(
                  `${this.basePath}/api/projet-client/${projetClientId}/autorisation`,
                  autorisations,
                  { observe: 'body', responseType: 'json' as 'json', withCredentials: true }
                ).subscribe({
                  next: () => {
                    this.showTemporaryAlert(`Le client a été ajouté avec succès au projet "${nomProjet}".`, 'success');
                    this.loadClients();
                    this.loadVoyages();
                  },
                  error: (err) => {
                    console.warn('⚠️ Autorisations non écrites immédiatement, rechargement forcé', err);
                    this.showTemporaryAlert(`Le client a été ajouté au projet (autorisation non confirmée).`, 'warning');
                    this.loadClients();
                    this.loadVoyages();
                  }
                });
              } else {
                // fallback: query the projet-client list and find the entry for this client
                this.http.get<any[]>(`${this.basePath}/api/projet-client/projet/${targetProjetId}`, { withCredentials: true }).subscribe({
                  next: (list) => {
                    const found = Array.isArray(list) ? list.find((p: any) => p.clientId === clientId) : null;
                    if (found && found.id) {
                      this.http.put(
                        `${this.basePath}/api/projet-client/${found.id}/autorisation`,
                        autorisations,
                        { observe: 'body', responseType: 'json' as 'json', withCredentials: true }
                      ).subscribe({ next: () => { this.showTemporaryAlert(`Le client a été ajouté avec succès au projet "${nomProjet}".`, 'success'); this.loadClients(); this.loadVoyages(); }, error: () => { this.showTemporaryAlert(`Le client a été ajouté au projet (autorisation non confirmée).`, 'warning'); this.loadClients(); this.loadVoyages(); } });
                    } else {
                      // couldn't find the created projet-client - still reload
                      this.showTemporaryAlert(`Le client a été ajouté au projet "${nomProjet}".`, 'success');
                      this.loadClients();
                      this.loadVoyages();
                    }
                  },
                  error: () => {
                    this.showTemporaryAlert(`Le client a été ajouté au projet "${nomProjet}".`, 'success');
                    this.loadClients();
                    this.loadVoyages();
                  }
                });
              }
            };

            // Try to extract the newly created projet-client id from the response
            let projetClientId: number | undefined;
            try {
              if (res && typeof res === 'object') {
                projetClientId = (res as any).id || (res as any).projetClientId || (res as any).projetClient?.id;
              }
            } catch (e) {
              projetClientId = undefined;
            }

            tryUpdateAutorisations(projetClientId);
          },
          error: async (err) => {
            console.error('Erreur association client-projet:', err);
            let errorMsg = '';
            if (err.error instanceof Blob) {
              try { errorMsg = await err.error.text(); } catch (e) { /* ignore */ }
            } else if (err.error) {
              errorMsg = typeof err.error === 'string' ? err.error : (err.error.message || err.error.error || '');
            }

            this.closeQuantiteModal();
            if (err.status === 400 || err.status === 403) {
              this.showTemporaryAlert('Impossible d\'ajouter le client : la quantité autorisée dépasse la quantité restante.', 'danger');
            } else {
              this.showTemporaryAlert(errorMsg || 'Erreur lors de l\'ajout du client au projet.', 'danger');
            }

            this.notificationService.rafraichir();
            if (clientId) {
              this.clientService.deleteClient(clientId).subscribe({ next: () => {}, error: () => {} });
            }
          }
        });
      },
      error: () => {
        // If we can't get remaining, attempt create and let backend validate
  // Fallback path (couldn't fetch remaining on client) — still send
  // the autorisation array AND the total as quantiteAutorisee so backend
  // records the correct total instead of defaulting to 0.
  const body = { autorisation: autorisations, quantiteAutorisee: totalToAdd };
        this.projetService.addClientToProjet(targetProjetId, clientId, body).subscribe({
          next: (res) => {
            // close modal first
            this.closeQuantiteModal();

            const projet = this.contextProjet || this.projetActif;
            const nomProjet = projet?.nom || `Projet ${targetProjetId}`;

            // same post-write autorisation attempt as in main path
            let projetClientId: number | undefined;
            try {
              if (res && typeof res === 'object') {
                projetClientId = (res as any).id || (res as any).projetClientId || (res as any).projetClient?.id;
              }
            } catch (e) { projetClientId = undefined; }

            const tryUpdateAutorisations = (projetClientId?: number) => {
              if (projetClientId) {
                this.http.put(
                  `${this.basePath}/api/projet-client/${projetClientId}/autorisation`,
                  autorisations,
                  { observe: 'body', responseType: 'json' as 'json', withCredentials: true }
                ).subscribe({ next: () => { this.showTemporaryAlert(`Le client a été ajouté avec succès au projet "${nomProjet}".`, 'success'); this.loadClients(); this.loadVoyages(); }, error: () => { this.showTemporaryAlert(`Le client a été ajouté au projet (autorisation non confirmée).`, 'warning'); this.loadClients(); this.loadVoyages(); } });
              } else {
                this.http.get<any[]>(`${this.basePath}/api/projet-client/projet/${targetProjetId}`, { withCredentials: true }).subscribe({ next: (list) => {
                  const found = Array.isArray(list) ? list.find((p: any) => p.clientId === clientId) : null;
                  if (found && found.id) {
                    this.http.put(
                      `${this.basePath}/api/projet-client/${found.id}/autorisation`,
                      autorisations,
                      { observe: 'body', responseType: 'json' as 'json', withCredentials: true }
                    ).subscribe({ next: () => { this.showTemporaryAlert(`Le client a été ajouté avec succès au projet "${nomProjet}".`, 'success'); this.loadClients(); this.loadVoyages(); }, error: () => { this.showTemporaryAlert(`Le client a été ajouté au projet (autorisation non confirmée).`, 'warning'); this.loadClients(); this.loadVoyages(); } });
                  } else {
                    this.showTemporaryAlert(`Le client a été ajouté au projet "${nomProjet}".`, 'success');
                    this.loadClients();
                    this.loadVoyages();
                  }
                }, error: () => { this.showTemporaryAlert(`Le client a été ajouté au projet "${nomProjet}".`, 'success'); this.loadClients(); this.loadVoyages(); } });
              }
            };

            tryUpdateAutorisations(projetClientId);
          },
          error: async (err) => {
            console.error('Erreur association client-projet (fallback):', err);
            let errorMsg = '';
            if (err.error instanceof Blob) {
              try { errorMsg = await err.error.text(); } catch (e) {}
            } else if (err.error) {
              errorMsg = typeof err.error === 'string' ? err.error : (err.error.message || err.error.error || '');
            }
            this.closeQuantiteModal();
            if (err.status === 400 || err.status === 403) {
              this.showTemporaryAlert('Impossible d\'ajouter le client : la quantité autorisée dépasse la quantité restante.', 'danger');
            } else {
              this.showTemporaryAlert(errorMsg || 'Erreur lors de l\'ajout du client au projet.', 'danger');
            }
            this.notificationService.rafraichir();
            if (clientId) {
              this.clientService.deleteClient(clientId).subscribe({ next: () => {}, error: () => {} });
            }
          }
        });
      }
    });
  }

  updateDialogClient() {
    if (!this.dialogClient?.id) return;
    this.clientService.updateClient(this.dialogClient.id, this.dialogClient, 'body').subscribe({
      next: () => {
        this.dialogClient = { nom: '', numero: '', adresse: '', mf: '' };
        this.selectedClient = null;
        this.editMode = false;
        this.loadClients();
        this.loadVoyages(); // Recharger les voyages pour mettre à jour le reste
        this.closeDialog();
      },
      error: (err) => this.error = 'Erreur modification: ' + (err.error?.message || err.message)
    });
  }

  closeDialog() {
    this.showAddClient = false;
    this.editMode = false;
    this.dialogClient = { nom: '', numero: '', adresse: '', mf: '' };
    this.selectedClient = null;
    this.error = '';
  }

  loadClients() {
    const targetProjetId = this.contextProjetId || this.projetActifId;
    console.log('📊 loadClients() - contextProjetId:', this.contextProjetId, 'projetActifId:', this.projetActifId, 'targetProjetId:', targetProjetId);
    
    if (!targetProjetId) {
      console.warn('⚠️ Aucun projet actif - liste des clients vide');
      this.clients = [];
      this.filteredClients = [];
      this.paginatedClients = [];
      this.totalPages = 1;
      this.totalElements = 0;
      return;
    }

    // Server-side pagination/search/sort for clients of the active project
    const url = `${this.basePath}/api/clients/projet/${targetProjetId}/paged`;
    let params = new HttpParams()
      .set('page', String(Math.max(0, (this.currentPage || 1) - 1)))
      .set('size', String(this.pageSize || 10));

    const search = this.clientFilter?.trim();
    if (search) {
      params = params.set('search', search);
    }

    if (this.filterNom?.trim()) params = params.set('nom', this.filterNom.trim());
    if (this.filterNumero?.trim()) params = params.set('numero', this.filterNumero.trim());
    if (this.filterMf?.trim()) params = params.set('mf', this.filterMf.trim());
    if (this.filterAdresse?.trim()) params = params.set('adresse', this.filterAdresse.trim());

    const backendSort = this.toBackendSort(this.sortColumn, this.sortDirection);
    if (backendSort) {
      params = params.set('sort', backendSort);
    }

    this.http.get<any>(url, { withCredentials: true, params, responseType: 'json' as 'json' }).subscribe({
      next: (pageResp: any) => {
        const raw = Array.isArray(pageResp?.content) ? pageResp.content : [];
        this.totalPages = Number(pageResp?.totalPages) || 1;
        this.totalElements = Number(pageResp?.totalElements) || raw.length;
        this.currentPage = (Number(pageResp?.number) || 0) + 1;

        this.clients = raw.map((row: any) => {
          let autorisations: any = row?.autorisation || [];
          if (Array.isArray(autorisations)) {
            autorisations = autorisations.map((a: any) => ({
              code: (a && a.code) ? String(a.code) : 'DEFAULT',
              quantite: Number(a && a.quantite) || 0
            }));
          } else {
            autorisations = [];
          }

          const sumAutorisation = (row?.quantiteAutorisee != null)
            ? Number(row.quantiteAutorisee) || 0
            : (autorisations.length > 0 ? autorisations.reduce((s: number, a: any) => s + (a?.quantite || 0), 0) : 0);

          const quantitesMap: any = row?.quantitesAutoriseesParProjet || {};
          if (quantitesMap && typeof quantitesMap === 'object') {
            quantitesMap[targetProjetId] = sumAutorisation;
          }

          return {
            ...row,
            autorisation: autorisations,
            quantiteAutorisee: sumAutorisation,
            quantitesAutoriseesParProjet: quantitesMap,
            projetId: targetProjetId
          };
        });

        this.filteredClients = this.clients;
        this.paginatedClients = this.clients;
      },
      error: (err: any) => {
        console.error('❌ Erreur chargement clients paginés:', err);
        this.error = 'Erreur chargement des clients: ' + (err.error?.message || err.message);
        this.clients = [];
        this.filteredClients = [];
        this.paginatedClients = [];
        this.totalPages = 1;
        this.totalElements = 0;
      }
    });
  }

  applyFilter() {
    // Drive search via URL so refresh/share keeps state
    this.updateClientUrlQuery({ page: 1, size: this.pageSize, search: this.clientFilter });
  }

  // Sorting methods
  sortBy(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.updateClientUrlQuery({ page: 1, sort: this.sortColumn, dir: this.sortDirection });
  }

  sortClients() {
    // Sorting is now done server-side via query params.
    this.paginatedClients = this.filteredClients;
  }

  // Pagination methods
  updatePagination() {
    // Pagination is now done server-side.
    this.paginatedClients = this.filteredClients;
  }

  onPageSizeChange() {
    this.updateClientUrlQuery({ page: 1, size: this.pageSize });
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.updateClientUrlQuery({ page });
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  deleteClient(id?: number) {
    if (id === undefined) return;

    // Vérifier si le client a une quantité vendue > 0
    const quantite = this.getTotalLivreClient(id);
    if (quantite > 0) {
      this.showErrorModal = true;
      this.modalTitle = 'Suppression impossible';
      this.modalMessage = `Ce client a une quantité vendue de ${quantite.toFixed(0)} kg. Vous ne pouvez pas supprimer un client ayant des ventes enregistrées.`;
      this.modalIcon = 'bi-exclamation-triangle-fill';
      this.modalIconColor = '#ef4444';
      return;
    }

    // Ouvrir d'abord la boîte de dialogue de code de suppression
    const dialogRef = this.dialog.open(ConfirmCodeDialogComponent, { disableClose: true });
    dialogRef.afterClosed().subscribe((ok: boolean) => {
      if (ok === true) {
        // Afficher la modale de confirmation existante
        this.clientToDelete = id;
        this.showConfirmModal = true;
        this.modalTitle = 'Confirmer la suppression';
        this.modalMessage = 'Êtes-vous sûr de vouloir supprimer ce client ? Cette action est irréversible.';
        this.modalIcon = 'bi-trash-fill';
        this.modalIconColor = '#ef4444';
      }
    });
  }

  confirmDelete() {
    if (this.clientToDelete === null) return;
    
    const targetProjetId = this.contextProjetId || this.projetActifId;
    if (!targetProjetId) {
      this.showConfirmModal = false;
      this.showErrorModal = true;
      this.modalTitle = 'Erreur';
      this.modalMessage = 'Aucun projet actif';
      this.modalIcon = 'bi-x-circle-fill';
      this.modalIconColor = '#ef4444';
      return;
    }
    
    // Utiliser clientService.deleteClient qui utilise la bonne méthode backend
    this.clientService.deleteClient(this.clientToDelete, 'body').subscribe({
      next: () => {
        // console.log('✅ Client supprimé avec succès');
        this.showConfirmModal = false;
        this.clientToDelete = null;
        this.loadClients();
        this.loadVoyages(); // Recharger les voyages pour mettre à jour le reste
      },
      error: (err) => {
        console.error('❌ Erreur suppression client:', err);
        this.showConfirmModal = false;
        this.showErrorModal = true;
        this.modalTitle = 'Erreur de suppression';
        
        // Message d'erreur plus explicite
        let errorMessage = 'Une erreur est survenue lors de la suppression';
        
        if (err.status === 403) {
          errorMessage = 'Vous n\'avez pas les permissions nécessaires pour supprimer ce client.';
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        // Détecter les erreurs de contrainte de clé étrangère
        const errorText = JSON.stringify(err);
        if (errorText.includes('foreign key') || errorText.includes('constraint') || errorText.includes('DataIntegrityViolationException')) {
          errorMessage = 'Ce client est encore associé à un ou plusieurs projets. Il ne peut pas être supprimé tant qu\'il y a des associations actives.';
        }
        
        this.modalMessage = errorMessage;
        this.modalIcon = 'bi-x-circle-fill';
        this.modalIconColor = '#ef4444';
      }
    });
  }

  cancelDelete() {
    this.showConfirmModal = false;
    this.clientToDelete = null;
  }

  closeErrorModal() {
    this.showErrorModal = false;
    this.modalTitle = '';
    this.modalMessage = '';
  }

  cancelEdit() {
    this.selectedClient = null;
    this.editMode = false;
  }

  // Charger les voyages pour le projet actif
  loadVoyages() {
    const targetProjetId = this.contextProjetId || this.projetActifId;
    if (!targetProjetId) {
      this.voyages = [];
      return;
    }
    
    this.voyageService.getVoyagesByProjet(targetProjetId, 'body').subscribe({
      next: async (data) => {
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            const parsed = JSON.parse(text);
            this.voyages = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            this.voyages = [];
          }
        } else {
          this.voyages = Array.isArray(data) ? data : [];
        }
        console.log(`✅ [Client] Voyages rechargés: ${this.voyages.length}`);
        // Voyages affect computed totals; do not touch URL-driven client paging.
        this.refreshComputedValues();
      },
      error: (err) => {
        console.error('Erreur chargement voyages:', err);
        this.voyages = [];
      }
    });
  }

  // Charger les déchargements (utilisés pour calculer les quantités par code)
  loadDechargements() {
    const targetProjetId = this.contextProjetId || this.projetActifId;
    if (!targetProjetId) {
      this.dechargements = [];
      return;
    }

    this.dechargementService.getAllDechargements().subscribe({
      next: async (data: any) => {
        let all: any[] = [];
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            all = JSON.parse(text);
          } catch (e) {
            all = [];
          }
        } else {
          all = Array.isArray(data) ? data : [];
        }

        // Filtrer par projet actif
        this.dechargements = all.filter(d => d.projetId === targetProjetId);
        console.log(`✅ ${this.dechargements.length} déchargements chargés pour le projet ${targetProjetId}`);
        // Déchargements affect computed totals; do not touch URL-driven client paging.
        this.refreshComputedValues();
      },
      error: (err) => {
        console.error('Erreur chargement déchargements:', err);
        this.dechargements = [];
      }
    });
  }

  // Récupère la quantité autorisée pour le projet actif depuis la map renvoyée par le backend
  getQuantitePourProjet(client: any): number | undefined {
    if (!this.projetActifId || !client) return undefined;
    if (client.quantitesAutoriseesParProjet) {
      return client.quantitesAutoriseesParProjet[this.projetActifId];
    }
    // fallback si jamais la structure change
    return (client.quantiteAutorisee !== undefined) ? client.quantiteAutorisee : undefined;
  }
  
  // Calculer le total livré pour un client
  getTotalLivreClient(clientId?: number): number {
    if (!clientId || !this.voyages) return 0;
    
    let filteredVoyages = this.voyages.filter(v => v.clientId === clientId && v.poidsClient);
    
    // Si un filtre de date est actif, filtrer par plage avec journée de travail [07:00, 06:00)
    if (this.dateFilterActive && (this.dateDebut || this.dateFin)) {
      filteredVoyages = filteredVoyages.filter(v => {
        if (!v.date) return false;
        const voyageDateTime = new Date(v.date);
        
        // Si date début définie, vérifier que le voyage est >= dateDebut 07:00
        if (this.dateDebut) {
          const startDate = new Date(this.dateDebut + 'T00:00:00');
          startDate.setHours(7, 0, 0, 0);
          if (voyageDateTime < startDate) return false;
        }
        
        // Si date fin définie, vérifier que le voyage est < dateFin+1 06:00
        if (this.dateFin) {
          const endDate = new Date(this.dateFin + 'T00:00:00');
          endDate.setDate(endDate.getDate() + 1);
          endDate.setHours(6, 0, 0, 0);
          if (voyageDateTime >= endDate) return false;
        }
        
        return true;
      });
    }
    
    return filteredVoyages.reduce((sum, v) => sum + (v.poidsClient || 0), 0);
  }
  
  // Calculer le reste pour un client
  getResteClient(client: any): number {
    if (!client || !client.id) return 0;
    const quantiteAutorisee = this.getQuantitePourProjet(client) || 0;
    const totalLivre = this.getTotalLivreClient(client.id);
    return quantiteAutorisee - totalLivre;
  }

  // Calculer le total déjà livré pour un client ET un code (si les déchargements portent la propriété autorisationCode)
  getTotalLivreForClientCode(clientId?: number, code?: string): number {
    if (!clientId) return 0;

    let filtered = this.dechargements.filter(d => d.clientId === clientId && (d.autorisationCode || d.autorisation?.code) === code);

    // Appliquer filtre de date si activé (basé sur dateDechargement)
    if (this.dateFilterActive && (this.dateDebut || this.dateFin)) {
      filtered = filtered.filter(d => {
        const dDate = d.dateDechargement || d.dateChargement || d.date || null;
        if (!dDate) return false;
        const voyageDateTime = new Date(dDate);

        if (this.dateDebut) {
          const startDate = new Date(this.dateDebut + 'T00:00:00');
          startDate.setHours(7, 0, 0, 0);
          if (voyageDateTime < startDate) return false;
        }
        if (this.dateFin) {
          const endDate = new Date(this.dateFin + 'T00:00:00');
          endDate.setDate(endDate.getDate() + 1);
          endDate.setHours(6, 0, 0, 0);
          if (voyageDateTime >= endDate) return false;
        }
        return true;
      });
    }

    return filtered.reduce((sum, d) => {
      const poidsNet = (d.poidComplet || 0) - (d.poidCamionVide || 0);
      return sum + (poidsNet || 0);
    }, 0);
  }

  // Calculer le reste pour un client pour un code donné
  getResteForClientCode(client: any, code?: string): number {
    if (!client) return 0;
    const autorisations = (client && client.autorisation) ? client.autorisation : [];
    // trouver quantite autorisee pour ce code
    let quantite = 0;
    if (Array.isArray(autorisations) && autorisations.length > 0) {
      const found = autorisations.find((a: any) => (a.code || 'DEFAULT') === (code || 'DEFAULT'));
      quantite = found ? (found.quantite || 0) : 0;
    } else {
      // fallback to legacy map
      quantite = this.getQuantitePourProjet(client) || 0;
    }

    const livre = this.getTotalLivreForClientCode(client.id, code);
    return quantite - livre;
  }

  // Vérifier si un client a dépassé sa quantité autorisée
  isClientEnDepassement(client: any): boolean {
    if (!client) return false;
    const reste = this.getResteClient(client);
    return reste < 0;
  }
  
  // Obtenir la couleur selon le reste
  getResteColor(reste: number, quantiteAutorisee: number): string {
    if (quantiteAutorisee === 0) return '#64748b'; // Gris si pas de limite
    const percentage = (reste / quantiteAutorisee) * 100;
    if (percentage > 50) return '#10b981'; // Vert
    if (percentage > 20) return '#f59e0b'; // Orange
    return '#ef4444'; // Rouge
  }

  // Affiche une alerte temporaire pendant 1 minute
  showTemporaryAlert(message: string, type: 'success' | 'danger' | 'warning' | 'info' = 'info') {
    this.alertMessage = message;
    this.alertType = type;
    this.showAlert = true;
    
    // Masquer l'alerte après 1 minute (60000 ms)
    setTimeout(() => {
      this.showAlert = false;
      this.alertMessage = '';
    }, 60000);
  }

  // Retourne le titre selon le type d'alerte
  getAlertTitle(): string {
    switch (this.alertType) {
      case 'success': return 'Succès !';
      case 'danger': return 'Erreur !';
      case 'warning': return 'Attention !';
      case 'info': return 'Information';
      default: return 'Notification';
    }
  }

  // Ferme l'alerte manuellement
  closeAlert() {
    this.showAlert = false;
    this.alertMessage = '';
  }
  
  // Annuler l'ajout du client et supprimer le client créé
  cancelQuantiteModal() {
    if (this.pendingClientId) {
      // Supprimer le client qui a été créé
      this.clientService.deleteClient(this.pendingClientId, 'body').subscribe({
        next: () => {
          console.log('Client supprimé après annulation');
          this.loadClients();
          this.loadVoyages();
        },
        error: (err) => {
          console.error('Erreur lors de la suppression du client:', err);
        }
      });
    }
    
    // Fermer la modal
    this.showQuantiteModal = false;
    this.pendingClientId = null;
    this.quantiteAutorisee = 0;
  }
  
  // Fermer la modal de quantité sans supprimer
  closeQuantiteModal() {
    this.showQuantiteModal = false;
    this.pendingClientId = null;
    this.quantiteAutorisee = 0;
    this.addAutorisationMode = false;
    this.addingAutorisation = [];
  }
  
  // Activer/désactiver le filtre par date
  toggleDateFilter() {
    this.dateFilterActive = !this.dateFilterActive;
    if (this.dateFilterActive && !this.dateDebut && !this.dateFin) {
      // Default to today for a predictable shareable URL
      this.dateDebut = this.today;
      this.dateFin = this.today;
    }
    this.clampDateFilterToToday();
    this.updateClientUrlQuery({
      dateActive: this.dateFilterActive,
      dateDebut: this.dateFilterActive ? this.dateDebut : null,
      dateFin: this.dateFilterActive ? this.dateFin : null,
    });
    this.refreshComputedValues();
  }
  
  // Gérer le changement de date
  onDateFilterChange() {
    this.clampDateFilterToToday();
    // If user sets dates, consider filter active
    if (this.dateDebut || this.dateFin) {
      this.dateFilterActive = true;
    }

    this.updateClientUrlQuery({
      dateActive: this.dateFilterActive,
      dateDebut: this.dateFilterActive ? this.dateDebut : null,
      dateFin: this.dateFilterActive ? this.dateFin : null,
    });
    this.refreshComputedValues();
  }
  
  // Effacer le filtre par date
  clearDateFilter() {
    this.dateFilterActive = false;
    this.dateDebut = null;
    this.dateFin = null;
    this.updateClientUrlQuery({ dateActive: false, dateDebut: null, dateFin: null });
    this.refreshComputedValues();
  }
  
  // Formater la date en français
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('fr-FR', options);
  }

  // Export PDF
  exportToPDF(): void {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Titre
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Liste des Clients', 14, 15);

    // Informations du projet
    if (this.projetActif) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      let yPos = 25;
      
      if (this.projetActif.nomNavire) {
        doc.text(`Navire: ${this.projetActif.nomNavire}`, 14, yPos);
        yPos += 6;
      }
      if (this.projetActif.port) {
        doc.text(`Port: ${this.projetActif.port}`, 14, yPos);
        yPos += 6;
      }
      if (this.projetActif.nomProduit) {
        doc.text(`Produit: ${this.projetActif.nomProduit}`, 14, yPos);
        yPos += 6;
      }
      // Afficher les sociétés si disponibles (projet.societeNoms peut être Set ou array)
      const societesSet = (this.projetActif && (this.projetActif.societeNoms)) ? this.projetActif.societeNoms : null;
      let societesStr = '';
      if (societesSet) {
        try {
          societesStr = Array.isArray(societesSet) ? societesSet.join(', ') : Array.from(societesSet).join(', ');
        } catch {
          societesStr = String(societesSet);
        }
      }
      if (societesStr) {
        doc.text(`Sociétés: ${societesStr}`, 14, yPos);
        // add a slightly larger margin after societes for better visual separation
        yPos += 6;
      }
      // Afficher la date de début du projet si disponible
      if (this.projetActif && (this.projetActif as any).dateDebut) {
        try {
          doc.text(`Date début projet: ${this.formatDate((this.projetActif as any).dateDebut)}`, 14, yPos);
          yPos += 6;
        } catch {}
      }
      // Afficher la date de début/fin du filtre si présente
      if (this.dateDebut) {
        try {
          doc.text(`Date début: ${this.formatDate(this.dateDebut)}`, 14, yPos);
          yPos += 6;
        } catch {}
      }
      if (this.dateFin) {
        try {
          doc.text(`Date fin: ${this.formatDate(this.dateFin)}`, 14, yPos);
          yPos += 6;
        } catch {}
      }
    }

    // Statistiques
    const totalClients = this.filteredClients.length;
    const totalQuantiteAutorisee = this.filteredClients.reduce((sum, c) => 
      sum + (this.getQuantitePourProjet(c) || 0), 0
    );
    const totalEnleve = this.filteredClients.reduce((sum, c) => 
      sum + (this.getTotalLivreClient(c.id) || 0), 0
    );
    const totalReste = totalQuantiteAutorisee - totalEnleve;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    let statsY = this.projetActif ? 60 : 30;
    doc.text(`Total Clients: ${totalClients}`, 14, statsY);
    doc.text(`Quantité Totale: ${totalQuantiteAutorisee.toFixed(0)} Kg`, 70, statsY);
    doc.text(`Total Enlevé: ${totalEnleve.toFixed(0)} Kg`, 140, statsY);
    doc.text(`Reste Total: ${totalReste.toFixed(0)} Kg`, 200, statsY);

    // Filtres appliqués
    if (this.dateFilterActive && (this.dateDebut || this.dateFin)) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      statsY += 6;
      let filterText = 'Filtre par date: ';
      if (this.dateDebut && this.dateFin) {
        filterText += `${this.formatDate(this.dateDebut)} - ${this.formatDate(this.dateFin)}`;
      } else if (this.dateDebut) {
        filterText += `À partir du ${this.formatDate(this.dateDebut)}`;
      } else if (this.dateFin) {
        filterText += `Jusqu'au ${this.formatDate(this.dateFin)}`;
      }
      doc.text(filterText, 14, statsY);
    }

    // Préparer les données du tableau
    // On génère une ligne par client+autorisation pour afficher le code et le reste spécifique
    const tableData: any[] = [];
    this.filteredClients.forEach(client => {
      const autorisations = (client && (client as any).autorisation) ? (client as any).autorisation : [];
      if (Array.isArray(autorisations) && autorisations.length > 0) {
        autorisations.forEach((a: any) => {
          const code = a.code || 'DEFAULT';
          const quantiteAutorisee = Number(a.quantite || 0);
          const totalLivre = this.getTotalLivreForClientCode(client.id, code);
          const reste = quantiteAutorisee - totalLivre;
          tableData.push([
            client.nom || '-',
            client.numero || '-',
            client.adresse || '-',
            client.mf || '-',
            code,
            quantiteAutorisee.toFixed(0),
            totalLivre.toFixed(0),
            reste.toFixed(0)
          ]);
        });
      } else {
        // fallback: single line with project-level totals
        const quantiteAutorisee = this.getQuantitePourProjet(client) || 0;
        const totalLivre = this.getTotalLivreClient(client.id);
        const reste = quantiteAutorisee - totalLivre;
        tableData.push([
          client.nom || '-',
          client.numero || '-',
          client.adresse || '-',
          client.mf || '-',
          '-',
          quantiteAutorisee.toFixed(0),
          totalLivre.toFixed(0),
          reste.toFixed(0)
        ]);
      }
    });

    // Générer le tableau
    autoTable(doc, {
      startY: statsY + 10,
      head: [['Nom', 'Numéro', 'Adresse', 'MF', 'Autorisation', 'Quantité Autorisée (kg)', 'Quantité Vendue (kg)', 'Reste (kg)']],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [102, 126, 234],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 24 },
        2: { cellWidth: 50 },
        3: { cellWidth: 28 },
        4: { cellWidth: 28 },
        5: { cellWidth: 26, halign: 'right' },
        6: { cellWidth: 26, halign: 'right' },
        7: { cellWidth: 26, halign: 'right' }
      },
      didDrawPage: (data) => {
        // Footer
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${data.pageNumber} / ${pageCount} - Généré le ${new Date().toLocaleDateString('fr-FR')}`,
          14,
          pageHeight - 10
        );
      }
    });

    // Télécharger le PDF
    const fileName = `Clients_${this.projetActif?.nomNavire || 'Liste'}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
  }

  // Export Excel
  exportToExcel(): void {
    // Préparer les données: une ligne par client+autorisation pour montrer le code et le reste par ticket
    const data: any[] = [];
    this.filteredClients.forEach(client => {
      const autorisations = (client && (client as any).autorisation) ? (client as any).autorisation : [];
      if (Array.isArray(autorisations) && autorisations.length > 0) {
        autorisations.forEach((a: any) => {
          const code = a.code || 'DEFAULT';
          const quantiteAutorisee = Number(a.quantite || 0);
          const totalLivre = this.getTotalLivreForClientCode(client.id, code);
          const reste = quantiteAutorisee - totalLivre;
          data.push({
            'Nom': client.nom || '-',
            'Numéro': client.numero || '-',
            'Adresse': client.adresse || '-',
            'MF': client.mf || '-',
            'Autorisation': code,
            'Quantité Autorisée (kg)': quantiteAutorisee.toFixed(0),
            'Quantité Vendue (kg)': totalLivre.toFixed(0),
            'Reste (kg)': reste.toFixed(0)
          });
        });
      } else {
        const quantiteAutorisee = this.getQuantitePourProjet(client) || 0;
        const totalLivre = this.getTotalLivreClient(client.id);
        const reste = quantiteAutorisee - totalLivre;
        data.push({
          'Nom': client.nom || '-',
          'Numéro': client.numero || '-',
          'Adresse': client.adresse || '-',
          'MF': client.mf || '-',
          'Autorisation': '-',
          'Quantité Autorisée (kg)': quantiteAutorisee.toFixed(0),
          'Quantité Vendue (kg)': totalLivre.toFixed(0),
          'Reste (kg)': reste.toFixed(0)
        });
      }
    });

    // Créer la feuille de calcul en ajoutant un en-tête projet puis les données
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([]);
    ws['!merges'] = ws['!merges'] || [];
    let currentRow = 0;

    // Titre principal
    XLSX.utils.sheet_add_aoa(ws, [[`Liste des Clients`]], { origin: { r: currentRow, c: 0 } });
    ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
    currentRow++;
    currentRow++; // Ligne vide après le titre

    // Informations du projet (navire / port / produit / sociétés)
    const projet = this.contextProjet || this.projetActif;
    if (projet) {
      if (projet.nomNavire) {
        XLSX.utils.sheet_add_aoa(ws, [[`Navire: ${projet.nomNavire}`]], { origin: { r: currentRow, c: 0 } });
        ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
        currentRow++;
      }
      if (projet.port) {
        XLSX.utils.sheet_add_aoa(ws, [[`Port: ${projet.port}`]], { origin: { r: currentRow, c: 0 } });
        ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
        currentRow++;
      }
      if (projet.nomProduit) {
        XLSX.utils.sheet_add_aoa(ws, [[`Produit: ${projet.nomProduit}`]], { origin: { r: currentRow, c: 0 } });
        ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
        currentRow++;
      }
      // Sociétés du projet si disponibles
      const societesSet = projet && projet.societeNoms ? projet.societeNoms : null;
      let societesStr = '';
      if (societesSet) {
        try { societesStr = Array.isArray(societesSet) ? societesSet.join(', ') : Array.from(societesSet).join(', '); } catch { societesStr = String(societesSet); }
      }
      if (societesStr) {
        XLSX.utils.sheet_add_aoa(ws, [[`Sociétés: ${societesStr}`]], { origin: { r: currentRow, c: 0 } });
        ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
        currentRow++;
      }
      // Date début du projet si disponible
      if (projet && (projet as any).dateDebut) {
        try {
          XLSX.utils.sheet_add_aoa(ws, [[`Date début projet: ${this.formatDate((projet as any).dateDebut)}`]], { origin: { r: currentRow, c: 0 } });
          ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
          currentRow++;
        } catch {}
      }
      // Dates filtre si présentes
      if (this.dateDebut) {
        XLSX.utils.sheet_add_aoa(ws, [[`Date début: ${this.formatDate(this.dateDebut)}`]], { origin: { r: currentRow, c: 0 } });
        ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
        currentRow++;
      }
      if (this.dateFin) {
        XLSX.utils.sheet_add_aoa(ws, [[`Date fin: ${this.formatDate(this.dateFin)}`]], { origin: { r: currentRow, c: 0 } });
        ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
        currentRow++;
      }
    }

    // Ligne vide
    currentRow++;

    // Statistiques (calculées une seule fois, réutilisées plus tard)
    const totalClientsCalc = this.filteredClients.length;
    const totalQuantiteAutoriseeCalc = this.filteredClients.reduce((sum, c) => 
      sum + (this.getQuantitePourProjet(c) || 0), 0
    );
    const totalEnleveCalc = this.filteredClients.reduce((sum, c) => 
      sum + (this.getTotalLivreClient(c.id) || 0), 0
    );
    const totalResteCalc = totalQuantiteAutoriseeCalc - totalEnleveCalc;

    XLSX.utils.sheet_add_aoa(ws, [[`Total Clients: ${totalClientsCalc}     Quantité Totale: ${totalQuantiteAutoriseeCalc.toFixed(0)} Kg     Total Enlevé: ${totalEnleveCalc.toFixed(0)} Kg     Reste Total: ${totalResteCalc.toFixed(0)} Kg`]], { origin: { r: currentRow, c: 0 } });
    ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 7 } });
    currentRow++;

    // Ligne vide
    currentRow++;

    // Ajouter les données à partir de currentRow
    XLSX.utils.sheet_add_json(ws, data, { origin: { r: currentRow, c: 0 } });

    // Définir la largeur des colonnes (ajout de la colonne code autorisation)
    ws['!cols'] = [
      { wch: 30 }, // Nom
      { wch: 15 }, // Numéro
      { wch: 40 }, // Adresse
      { wch: 20 }, // MF
      { wch: 20 }, // code ticket d'autorisation
      { wch: 20 }, // Quantité Autorisée (kg)
      { wch: 15 }, // Enlevé (kg)
      { wch: 15 }  // Reste (kg)
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Clients');

    // Ajouter une feuille de statistiques
    const totalClients = this.filteredClients.length;
    const totalQuantiteAutorisee = this.filteredClients.reduce((sum, c) => 
      sum + (this.getQuantitePourProjet(c) || 0), 0
    );
    const totalEnleve = this.filteredClients.reduce((sum, c) => 
      sum + (this.getTotalLivreClient(c.id) || 0), 0
    );
    const totalReste = totalQuantiteAutorisee - totalEnleve;

    const statsData = [
      { 'Statistique': 'Total Clients', 'Valeur': totalClients },
      { 'Statistique': 'Quantité Totale Autorisée (T)', 'Valeur': totalQuantiteAutorisee.toFixed(0) },
      { 'Statistique': 'Total Enlevé (T)', 'Valeur': totalEnleve.toFixed(0) },
      { 'Statistique': 'Reste Total (T)', 'Valeur': totalReste.toFixed(0) }
    ];

    if (this.projetActif) {
      statsData.unshift(
        { 'Statistique': 'Navire', 'Valeur': this.projetActif.nomNavire || '-' },
        { 'Statistique': 'Port', 'Valeur': this.projetActif.port || '-' },
        { 'Statistique': 'Produit', 'Valeur': this.projetActif.nomProduit || '-' }
      );
    }

    const wsStats: XLSX.WorkSheet = XLSX.utils.json_to_sheet(statsData);
    wsStats['!cols'] = [{ wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsStats, 'Statistiques');

    // Télécharger le fichier
    const fileName = `Clients_${this.projetActif?.nomNavire || 'Liste'}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // Modal pour modifier la quantité autorisée
  openEditQuantiteModal(client: any) {
    this.editingClient = client;
    this.newQuantiteAutorisee = this.getQuantitePourProjet(client) || 0;
    // prepare autorisation editor (clone existing if any)
    this.editingAutorisation = (client && client.autorisation) ? JSON.parse(JSON.stringify(client.autorisation)) : [];
    this.editAutorisationMode = (this.editingAutorisation && this.editingAutorisation.length > 0) ? true : false;
    this.showEditQuantiteModal = true;
  }

  confirmEditQuantite() {
    if (!this.editingClient) {
      this.showAlert = true;
      this.alertType = 'danger';
      this.alertMessage = 'Erreur: Client invalide';
      return;
    }

    const targetProjetId = this.contextProjetId || this.projetActifId;
    if (!targetProjetId) {
      this.showAlert = true;
      this.alertType = 'danger';
      this.alertMessage = 'Erreur: Aucun projet actif';
      return;
    }

    // Always operate in autorisation mode for edits (no more simple-quantity mode)
    const projetClientId = this.editingClient.projetClientId;
    if (!projetClientId) {
      this.showAlert = true;
      this.alertType = 'danger';
      this.alertMessage = 'Erreur: Association projet-client introuvable';
      return;
    }

    const rows = (this.editingAutorisation || []).map(r => ({ code: r.code && r.code.trim() ? r.code.trim() : 'DEFAULT', quantite: Number(r.quantite) || 0 }));
    if (!rows.length) {
      this.showTemporaryAlert('Veuillez ajouter au moins une autorisation (code et quantité).', 'warning');
      return;
    }

    for (const r of rows) {
      if (r.quantite < 0) {
        this.showTemporaryAlert('Veuillez vérifier les quantités des autorisations (≥ 0).', 'danger');
        return;
      }
    }

    const newTotal = rows.reduce((s: number, a: any) => s + (Number(a.quantite) || 0), 0);
    const existingAlloc = this.getQuantitePourProjet(this.editingClient) || 0;

    this.quantiteService.getQuantiteRestante(targetProjetId).subscribe({
      next: (quantiteRestante) => {
        const allowed = quantiteRestante + existingAlloc;
        if (newTotal > allowed) {
          this.showTemporaryAlert('Impossible d\'ajouter le client : la quantité autorisée dépasse la quantité restante.', 'danger');
          return;
        }

        // Proceed with update via autorisation endpoint
        this.http.put(
          `${this.basePath}/api/projet-client/${projetClientId}/autorisation`,
          rows,
          { observe: 'body', responseType: 'json' }
        ).subscribe({
          next: () => {
            this.showAlert = true;
            this.alertType = 'success';
            this.alertMessage = `Autorisations mises à jour avec succès.`;
            this.showEditQuantiteModal = false;
            this.editingClient = null;
            this.editAutorisationMode = false;
            setTimeout(() => this.loadClients(), 200);
          },
          error: (err) => {
            console.error('❌ Erreur mise à jour autorisations:', err);
            this.showEditQuantiteModal = false;
            this.editingClient = null;
            this.editAutorisationMode = false;
            this.showAlert = true;
            this.alertType = 'danger';
            this.alertMessage = err.error?.message || 'Erreur lors de la mise à jour des autorisations.';
            setTimeout(() => this.loadClients(), 200);
          }
        });
      },
      error: () => {
        // fallback: attempt update and let backend validate
        this.http.put(
          `${this.basePath}/api/projet-client/${projetClientId}/autorisation`,
          rows,
          { observe: 'body', responseType: 'json' }
        ).subscribe({
          next: () => {
            this.showAlert = true;
            this.alertType = 'success';
            this.alertMessage = `Autorisations mises à jour avec succès.`;
            this.showEditQuantiteModal = false;
            this.editingClient = null;
            this.editAutorisationMode = false;
            setTimeout(() => this.loadClients(), 200);
          },
          error: (err) => {
            console.error('❌ Erreur mise à jour autorisations (fallback):', err);
            this.showEditQuantiteModal = false;
            this.editingClient = null;
            this.editAutorisationMode = false;
            this.showAlert = true;
            this.alertType = 'danger';
            this.alertMessage = err.error?.message || 'Erreur lors de la mise à jour des autorisations.';
            setTimeout(() => this.loadClients(), 200);
          }
        });
      }
    });
  }

  // Toggle between editing a simple quantity and editing the autorisation list
  toggleEditAutorisationMode() {
    // Force autorisation mode only (no legacy single-quantity mode)
    this.editAutorisationMode = true;
    if (!this.editingAutorisation || this.editingAutorisation.length === 0) {
      const initialQty = this.newQuantiteAutorisee || 0;
      if (initialQty > 0) {
        this.editingAutorisation = [{ code: '1', quantite: initialQty }];
      } else {
        this.editingAutorisation = [];
      }
    }
  }

  addAutorisationRow() {
    if (!this.editingAutorisation) this.editingAutorisation = [];
    this.editingAutorisation.push({ code: '1', quantite: 0 });
  }

  removeAutorisationRow(index: number) {
    if (!this.editingAutorisation) return;
    this.editingAutorisation.splice(index, 1);
  }

  getTotalEditingAutorisation(): number {
    if (!this.editingAutorisation || this.editingAutorisation.length === 0) return 0;
    return this.editingAutorisation.reduce((s, a) => s + (Number(a.quantite) || 0), 0);
  }

  // Total for addingAutorisation (used in add-modal template)
  getAddingAutorisationTotal(): number {
    if (!this.addingAutorisation || this.addingAutorisation.length === 0) return 0;
    return this.addingAutorisation.reduce((s, a) => s + (Number(a.quantite) || 0), 0);
  }

  // Helper to add a new autorisation row in the ADD modal (default code '1')
  addAddingAutorisationRow() {
    if (!this.addingAutorisation) this.addingAutorisation = [];
    this.addingAutorisation.push({ code: '1', quantite: 0 });
  }

  cancelEditQuantite() {
    this.showEditQuantiteModal = false;
    this.editingClient = null;
    this.newQuantiteAutorisee = 0;
    this.editAutorisationMode = false;
    this.editingAutorisation = [];
  }
}
