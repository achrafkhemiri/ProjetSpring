import { Component, ChangeDetectorRef } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { DepotControllerService } from '../../api/api/depotController.service';
import { ProjetDepotControllerService } from '../../api/api/projetDepotController.service';
import { VoyageControllerService } from '../../api/api/voyageController.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Inject } from '@angular/core';
import { BASE_PATH } from '../../api/variables';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmCodeDialogComponent } from '../../shared/confirm-code-dialog.component';
import { ProjetActifService } from '../../service/projet-actif.service';
import { ProjetControllerService } from '../../api/api/projetController.service';
import { ActivatedRoute, Router } from '@angular/router';
import { DepotDTO } from '../../api/model/depotDTO';
import { ProjetDepotDTO } from '../../api/model/projetDepotDTO';
import { VoyageDTO } from '../../api/model/voyageDTO';
import { BreadcrumbItem } from '../breadcrumb/breadcrumb.component';
import { NotificationService } from '../../service/notification.service';
import { QuantiteService } from '../../service/quantite.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Interface étendue pour les dépôts avec quantités
interface DepotWithQuantite extends DepotDTO {
  projetDepotId?: number;
  quantiteAutorisee?: number;
}

@Component({
  selector: 'app-depot',
  templateUrl: './depot.component.html',
  styleUrls: ['./depot.component.css'],
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
export class DepotComponent {
  depots: DepotWithQuantite[] = [];
  projetDepots: ProjetDepotDTO[] = [];
  filteredDepots: DepotWithQuantite[] = [];
  paginatedDepots: DepotWithQuantite[] = [];
  // Global active project
  projetActifId: number | null = null;
  projetActif: any = null;
  // Context (visited) project from session
  contextProjetId: number | null = null;
  contextProjet: any = null;
  breadcrumbItems: BreadcrumbItem[] = [];
  selectedDepot: DepotWithQuantite | null = null;
  dialogDepot: DepotDTO = { nom: '', adresse: '', mf: '' };
  editMode: boolean = false;
  error: string = '';
  isSidebarOpen: boolean = true;
  showAddDialog: boolean = false;
  depotFilter: string = '';
  
  // Pour l'autocomplétion type Select2
  allDepots: DepotDTO[] = []; // Tous les dépôts (toutes les BDD)
  filteredSuggestions: DepotDTO[] = [];
  showSuggestions: boolean = false;
  selectedExistingDepot: DepotDTO | null = null;
  
  // Modal de quantité
  showQuantiteModal: boolean = false;
  quantiteAutorisee: number = 0;
  pendingDepotId: number | null = null;
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 5;
  totalElements: number = 0;
  totalPages: number = 1;
  pageSizes: number[] = [5, 10, 20, 50];
  
  // Tri
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  
  // Voyages pour calculer la quantité vendue
  voyages: VoyageDTO[] = [];
  
  // Date Filter
  dateFilterActive: boolean = false;
  dateDebut: string | null = null;
  dateFin: string | null = null;
  // Date max pour le filtre (aujourd'hui)
  today: string = '';
  
  // Alerte temporaire
  showAlert: boolean = false;
  alertMessage: string = '';
  alertType: 'success' | 'danger' | 'warning' | 'info' = 'info';
  
  // Modal de confirmation/erreur
  showConfirmModal: boolean = false;
  showErrorModal: boolean = false;
  modalTitle: string = '';
  modalMessage: string = '';
  modalIcon: string = '';
  modalIconColor: string = '';
  depotToDelete: number | null = null;
  
  Math = Math;

  private lastDepotQueryKey: string = '';
  private lastDateQueryKey: string = '';

  private toBackendSort(sortColumn: string, dir: 'asc' | 'desc'): string | null {
    const c = (sortColumn || '').trim();
    if (!c) return null;

    // Project-scoped paging endpoint is based on ProjetDepot, so depot fields must be prefixed.
    switch (c) {
      case 'nom':
      case 'adresse':
      case 'mf':
        return `depot.${c},${dir}`;
      case 'id':
        return `depot.id,${dir}`;
      default:
        return null;
    }
  }

  private clampDateFilterToToday() {
    if (this.dateDebut && this.today && this.dateDebut > this.today) {
      this.dateDebut = this.today;
    }
    if (this.dateFin && this.today && this.dateFin > this.today) {
      this.dateFin = this.today;
    }
  }

  private refreshComputedValues() {
    // Date filter only affects computed totals in template; do not reload depots.
    this.filteredDepots = this.depots;
    this.paginatedDepots = this.depots;
    this.cdr.detectChanges();
  }

  private updateDepotUrlQuery(partial: {
    page?: number;
    size?: number;
    search?: string | null;
    sort?: string | null;
    dir?: 'asc' | 'desc' | null;
    dateActive?: boolean | null;
    dateDebut?: string | null;
    dateFin?: string | null;
  }) {
    const queryParams: any = {};
    if (partial.page !== undefined) queryParams.page = partial.page;
    if (partial.size !== undefined) queryParams.size = partial.size;

    if (partial.search !== undefined) {
      const v = (partial.search ?? '').toString().trim();
      queryParams.search = v.length > 0 ? v : null;
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

  constructor(
    private depotService: DepotControllerService,
    private projetDepotService: ProjetDepotControllerService,
    private voyageService: VoyageControllerService,
    private projetActifService: ProjetActifService, 
    private projetService: ProjetControllerService,
    private notificationService: NotificationService,
    private quantiteService: QuantiteService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    @Inject(BASE_PATH) private basePath: string,
    private cdr: ChangeDetectorRef
  ) {
    // 🔥 Écouter les changements du projet actif
    this.projetActifService.projetActif$.subscribe(projet => {
      // console.log('📡 [Depot] Notification reçue - Nouveau projet:', projet);
      
      if (projet && projet.id) {
        const previousId = this.projetActifId;
        this.projetActifId = projet.id;
        this.projetActif = projet;
        
        // 🔥 FIX : Recharger si le projet change OU si c'est la première fois
        if (!previousId || previousId !== projet.id) {
          // console.log('🔄 [Depot] Rechargement - previousId:', previousId, 'newId:', projet.id);
          setTimeout(() => {
            this.reloadData();
          }, 50);
        }
      }
    });
    
    // 🔥 Écouter les rafraîchissements manuels (après modification de déchargement)
    this.notificationService.onRefresh().subscribe(() => {
      console.log('🔄 [Depot] Rafraîchissement demandé - rechargement des données');
      this.reloadData();
    });
    
    this.initializeProjetContext();
    // Initialiser la date du jour
    this.today = this.getTodayString();

    // URL-driven pagination/search/sort/date for /depot
    this.route.queryParamMap.subscribe(params => {
      const page = Number(params.get('page') || '1') || 1;
      const sizeParam = params.get('size');
      const size = Number(sizeParam || String(this.pageSize)) || this.pageSize;
      const search = (params.get('search') ?? '').toString();
      const sort = (params.get('sort') ?? '').toString();
      const dirRaw = (params.get('dir') ?? 'asc').toString().toLowerCase();
      const dir: 'asc' | 'desc' = dirRaw === 'desc' ? 'desc' : 'asc';

      const dateDebutParam = params.get('dateDebut');
      const dateFinParam = params.get('dateFin');
      const dateActiveRaw = (params.get('dateActive') ?? '').toString().toLowerCase();
      const dateActive = (dateActiveRaw === '1' || dateActiveRaw === 'true' || !!dateDebutParam || !!dateFinParam);

      // Ensure URL always contains size for share/refresh consistency
      if (!sizeParam) {
        this.updateDepotUrlQuery({ size, page: Math.max(1, page) });
      }

      const dateKey = `${dateActive ? '1' : '0'}|${dateDebutParam ?? ''}|${dateFinParam ?? ''}`;
      if (dateKey !== this.lastDateQueryKey) {
        this.lastDateQueryKey = dateKey;
        this.dateFilterActive = dateActive;
        this.dateDebut = dateDebutParam ? dateDebutParam.toString() : null;
        this.dateFin = dateFinParam ? dateFinParam.toString() : null;
        this.clampDateFilterToToday();
        this.refreshComputedValues();
      }

      const depotKey = `${page}|${size}|${search.trim()}|${sort}|${dir}`;
      if (depotKey === this.lastDepotQueryKey) return;
      this.lastDepotQueryKey = depotKey;

      this.currentPage = Math.max(1, page);
      this.pageSize = size;
      this.depotFilter = search;
      this.sortColumn = sort;
      this.sortDirection = dir;

      this.loadDepots();
    });
  }

  initializeProjetContext() {
    const globalProjet = this.projetActifService.getProjetActif?.();
    if (globalProjet && globalProjet.id) {
      this.projetActifId = globalProjet.id;
      this.projetActif = globalProjet;
    }
    const contextId = window.sessionStorage.getItem('projetActifId');
    if (contextId) {
      this.contextProjetId = Number(contextId);
      this.loadProjetDetails(this.contextProjetId, true);
    }
    this.loadAllDepots(); // Charger tous les dépôts pour l'autocomplétion
    this.loadProjetDepotsMeta();
    this.loadVoyages(); // Charger les voyages pour calculer la quantité vendue
  }

  // 🔥 NOUVEAU : Méthode pour recharger toutes les données
  reloadData() {
    console.log('🔄 [Depot] reloadData() appelé');
    
    // Réinitialiser le contexte si on n'est pas sur une page de paramètre
    const contextId = window.sessionStorage.getItem('projetActifId');
    if (contextId) {
      this.contextProjetId = Number(contextId);
      this.loadProjetDetails(this.contextProjetId, true);
    } else {
      this.contextProjetId = null;
      this.contextProjet = null;
    }
    
    // Recharger toutes les données
    this.loadAllDepots();

    // Recharger la méta (pour autocomplétion) + liste paginée + voyages
    this.loadProjetDepotsMeta();
    this.loadDepots();
    this.loadVoyages();
    
    this.updateBreadcrumb();
  }
  
  // Nouvelle méthode pour charger dépôts puis voyages de manière séquentielle
  private loadDepotsAndVoyages() {
    // Kept for backward compatibility; new flow is URL-driven paging.
    this.loadDepots();
    this.loadVoyages();
  }

  // Meta list for current project (used to exclude already-associated depots in autocompletion)
  private loadProjetDepotsMeta() {
    const targetProjetId = this.contextProjetId || this.projetActifId;
    if (!targetProjetId) {
      this.projetDepots = [];
      return;
    }

    this.projetDepotService.getProjetDepotsByProjetId(targetProjetId, 'body').subscribe({
      next: async (data: any) => {
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            const parsed = JSON.parse(text);
            this.projetDepots = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            this.projetDepots = [];
          }
        } else {
          this.projetDepots = Array.isArray(data) ? data : [];
        }
      },
      error: () => {
        this.projetDepots = [];
      }
    });
  }
  
  // Version async de loadDepotsDetails
  private loadDepotsDetailsAsync(): Promise<void> {
    return new Promise((resolve) => {
      if (this.projetDepots.length === 0) {
        this.depots = [];
        this.filteredDepots = [];
        this.paginatedDepots = [];
        this.totalPages = 1;
        this.totalElements = 0;
        resolve();
        return;
      }

      const depotIds = [...new Set(this.projetDepots.map(pd => pd.depotId))];
      
      this.depotService.getAllDepots('body').subscribe({
        next: async (data: any) => {
          let allDepots: DepotDTO[] = [];
          
          if (data instanceof Blob) {
            const text = await data.text();
            try {
              const parsed = JSON.parse(text);
              allDepots = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              console.error('Erreur parsing depots:', e);
            }
          } else if (Array.isArray(data)) {
            allDepots = data;
          }
          
          this.depots = allDepots
            .filter(depot => depotIds.includes(depot.id!))
            .map(depot => {
              const projetDepot = this.projetDepots.find(pd => pd.depotId === depot.id);
              return {
                ...depot,
                projetDepotId: projetDepot?.id,
                quantiteAutorisee: projetDepot?.quantiteAutorisee || 0
              } as DepotWithQuantite;
            })
            .sort((a, b) => (b.id || 0) - (a.id || 0));
          
          console.log('✅ [Depot] Dépôts rechargés:', this.depots.length);
          this.filteredDepots = this.depots;
          this.paginatedDepots = this.depots;
          resolve();
        },
        error: (err: any) => {
          console.error('❌ Erreur chargement détails dépôts:', err);
          this.depots = [];
          this.filteredDepots = [];
          this.paginatedDepots = [];
          this.totalPages = 1;
          this.totalElements = 0;
          resolve();
        }
      });
    });
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

  updateBreadcrumb() {
    const projet = this.contextProjet || this.projetActif;
    if (projet) {
      this.breadcrumbItems = [
        { label: 'Projets', url: '/projet' },
        { label: projet.nom || `Projet ${projet.id}`, url: `/projet/${projet.id}/parametre` },
        { label: 'Param\u00e8tres', url: `/projet/${projet.id}/parametre` },
        { label: 'D\u00e9p\u00f4ts' }
      ];
    } else {
      this.breadcrumbItems = [
        { label: 'D\u00e9p\u00f4ts' }
      ];
    }
  }

  openAddDialog() {
    this.dialogDepot = { nom: '', adresse: '', mf: '' };
    this.selectedExistingDepot = null;
    this.showAddDialog = true;
    this.editMode = false;
    this.showSuggestions = false;
    this.filteredSuggestions = [];
  }

  // Charger tous les dépôts de la base de données pour l'autocomplétion
  loadAllDepots() {
    this.depotService.getAllDepots('body').subscribe({
      next: async (data) => {
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            const json = JSON.parse(text);
            if (Array.isArray(json)) {
              // Trier par ID décroissant (du plus récent au plus ancien)
              this.allDepots = json.sort((a, b) => (b.id || 0) - (a.id || 0));
            }
          } catch (e) {
            console.error('Erreur parsing allDepots:', e);
          }
        } else if (Array.isArray(data)) {
          // Trier par ID décroissant (du plus récent au plus ancien)
          this.allDepots = data.sort((a, b) => (b.id || 0) - (a.id || 0));
        }
        // console.log('AllDepots chargés et triés pour autocomplétion:', this.allDepots.length);
      },
      error: (err) => {
        console.error('Erreur chargement allDepots:', err);
      }
    });
  }

  // Filtrer les suggestions lors de la saisie
  onDepotInputChange() {
    const searchValue = this.dialogDepot.nom;
    
    if (!searchValue || searchValue.trim().length < 2) {
      this.showSuggestions = false;
      this.filteredSuggestions = [];
      this.selectedExistingDepot = null;
      return;
    }
    
    const searchLower = searchValue.trim().toLowerCase();
    const targetProjetId = this.contextProjetId || this.projetActifId;
    
    // Filtrer les dépôts qui correspondent et qui ne sont PAS déjà dans le projet actuel
    this.filteredSuggestions = this.allDepots.filter(depot => {
      const matchesSearch = depot.nom?.toLowerCase().includes(searchLower);
      // Exclure les dépôts déjà associés au projet actuel
      const notInCurrentProject = !this.projetDepots.some(pd => pd.depotId === depot.id);
      return matchesSearch && notInCurrentProject;
    }).slice(0, 10); // Limiter à 10 suggestions
    
    this.showSuggestions = this.filteredSuggestions.length > 0;
    this.selectedExistingDepot = null;
  }

  // Sélectionner un dépôt existant depuis les suggestions
  selectSuggestion(depot: DepotDTO) {
    this.selectedExistingDepot = depot;
    this.dialogDepot.nom = depot.nom || '';
    this.dialogDepot.adresse = depot.adresse || '';
    this.dialogDepot.mf = depot.mf || '';
    this.showSuggestions = false;
    this.filteredSuggestions = [];
  }

  // Fermer les suggestions si on clique ailleurs
  closeSuggestions() {
    setTimeout(() => {
      this.showSuggestions = false;
      this.filteredSuggestions = [];
    }, 200);
  }

  selectDepot(dep: DepotDTO) {
    this.dialogDepot = { 
      id: dep.id,
      nom: dep.nom,
      adresse: dep.adresse,
      mf: dep.mf,
      projetId: dep.projetId
    };
    this.selectedDepot = dep;
    this.editMode = true;
    this.showAddDialog = true;
  }

  addDialogDepot() {
    if (!this.dialogDepot.nom) {
      this.error = 'Veuillez remplir le nom.';
      return;
    }
    
    const targetProjetId = this.contextProjetId || this.projetActifId;
    
    // Si un dépôt existant a été sélectionné, demander la quantité
    if (this.selectedExistingDepot && this.selectedExistingDepot.id) {
      // console.log('Association dépôt existant:', this.selectedExistingDepot.id, 'au projet:', targetProjetId);
      if (targetProjetId) {
        // Stocker l'ID du dépôt en attente et ouvrir la modal de quantité
        this.pendingDepotId = this.selectedExistingDepot.id;
        this.quantiteAutorisee = 0;
        this.showQuantiteModal = true;
        this.closeDialog();
      }
      return;
    }
    
    // Créer un nouveau dépôt puis demander la quantité
    // console.log('Création nouveau depot - payload:', this.dialogDepot);

    this.depotService.createDepot(this.dialogDepot, 'body').subscribe({
      next: async (created) => {
        // console.log('Réponse création depot (raw):', created);

        let createdId: number | null = null;
        
        if (created instanceof Blob) {
          const text = await created.text();
          try {
            const parsed = JSON.parse(text);
            // console.log('Réponse création depot (parsed):', parsed);
            createdId = parsed?.id;
          } catch (e) {
            console.error('Erreur parsing création depot:', e);
          }
        } else {
          createdId = (created as any)?.id;
        }

        if (createdId && targetProjetId) {
          // Stocker l'ID et ouvrir la modal de quantité
          this.pendingDepotId = createdId;
          this.quantiteAutorisee = 0;
          this.showQuantiteModal = true;
          this.closeDialog();
        } else {
          this.loadDepots();
          this.closeDialog();
        }
      },
      error: (err) => {
        this.error = 'Erreur ajout: ' + (err.error?.message || err.message);
        console.error('Erreur création depot:', err);
      }
    });
  }

  // Confirmer l'ajout avec quantité
  confirmAddDepotWithQuantite() {
    if (this.quantiteAutorisee === null || this.quantiteAutorisee === undefined || this.quantiteAutorisee < 0) {
      this.showAlert = true;
      this.alertType = 'danger';
      this.alertMessage = 'Veuillez entrer une quantité autorisée valide (≥ 0)';
      return;
    }

    const targetProjetId = this.contextProjetId || this.projetActifId;
    
    if (!this.pendingDepotId || !targetProjetId) {
      this.showAlert = true;
      this.alertType = 'danger';
      this.alertMessage = 'Erreur: ID dépôt ou projet manquant';
      return;
    }

    // Créer le ProjetDepot avec quantité
    const projetDepot: any = {
      projetId: targetProjetId,
      depotId: this.pendingDepotId,
      quantiteAutorisee: this.quantiteAutorisee
    };

    this.projetDepotService.createProjetDepot(projetDepot, 'body').subscribe({
      next: () => {
        // console.log('✅ ProjetDepot créé avec quantité:', this.quantiteAutorisee);
        this.showAlert = true;
        this.alertType = 'success';
        this.alertMessage = `Dépôt ajouté avec succès (Quantité: ${this.quantiteAutorisee} kg)`;
        this.showQuantiteModal = false;
        this.pendingDepotId = null;
        this.quantiteAutorisee = 0;
        
        // Recharger les données avec un petit délai pour laisser la BD se mettre à jour
        setTimeout(() => {
          this.loadDepots();
          this.loadVoyages();
        }, 200);
      },
      error: async (err) => {
        console.error('❌ Erreur création ProjetDepot:', err);
        // If it's a 400/403, treat as quantity-exceed similar to client flow
        let errorMsg = '';

        if (err.error instanceof Blob) {
          try {
            const text = await err.error.text();
            if (text && text.trim()) errorMsg = text;
          } catch (e) {
            console.error('Erreur parsing blob:', e);
          }
        } else if (err.error) {
          if (typeof err.error === 'string') errorMsg = err.error;
          else if (err.error.message) errorMsg = err.error.message;
          else if (err.error.error) errorMsg = err.error.error;
        }

        if (err.status === 400 || err.status === 403) {
          // Close the quantite modal
          this.showQuantiteModal = false;

          const projet = this.contextProjet || this.projetActif;
          if (projet && targetProjetId) {
            // Get remaining quantity
            this.quantiteService.getQuantiteRestante(targetProjetId).subscribe({
              next: (quantiteRestante) => {
                const nomProjet = projet.nom || `Projet ${targetProjetId}`;
                const alertMsg = `Impossible d'ajouter le dépôt : la quantité autorisée dépasse la quantité restante.\n\n` +
                                 `📊 Projet "${nomProjet}" :\n` +
                                 `✅ Quantité restante disponible : ${quantiteRestante.toFixed(0)}`;
                // show temporary alert (create method below)
                this.showTemporaryAlert(alertMsg, 'danger');
              },
              error: () => {
                const nomProjet = projet.nom || `Projet ${targetProjetId}`;
                const alertMsg = errorMsg && errorMsg.trim()
                  ? errorMsg
                  : `Impossible d'ajouter le dépôt au projet "${nomProjet}" : la quantité autorisée dépasse la quantité restante.`;
                this.showTemporaryAlert(alertMsg, 'danger');
              }
            });
          } else {
            const alertMsg = errorMsg && errorMsg.trim()
              ? errorMsg
              : 'Impossible d\'ajouter le dépôt : la quantité autorisée dépasse la quantité restante du projet.';
            this.showTemporaryAlert(alertMsg, 'danger');
          }

          // Refresh notifications
          this.notificationService.rafraichir();

          // Remove orphan depot if needed
          if (this.pendingDepotId) {
            // console.log('Suppression du dépôt orphelin:', this.pendingDepotId);
            this.depotService.deleteDepot(this.pendingDepotId, 'body').subscribe({
              next: () => console.log('Dépôt orphelin supprimé'),
              error: (delErr) => console.error('Erreur suppression dépôt orphelin:', delErr)
            });
          }

          // Reset state
          this.pendingDepotId = null;
          this.quantiteAutorisee = 0;
        } else {
          // Other errors
          this.showAlert = true;
          this.alertType = 'danger';
          this.alertMessage = 'Erreur: ' + (errorMsg || err.message || err.error?.message || '');
          this.showQuantiteModal = false;
        }
      }
    });
  }

  // Annuler l'ajout avec quantité
  cancelAddDepotWithQuantite() {
    this.showQuantiteModal = false;
    this.pendingDepotId = null;
    this.quantiteAutorisee = 0;
  }

  updateDialogDepot() {
    if (!this.dialogDepot?.id) return;
    this.depotService.updateDepot(this.dialogDepot.id, this.dialogDepot, 'body').subscribe({
      next: () => {
        this.dialogDepot = { nom: '', adresse: '', mf: '' };
        this.selectedDepot = null;
        this.editMode = false;
        this.loadDepots();
        this.closeDialog();
      },
      error: (err) => this.error = 'Erreur modification: ' + (err.error?.message || err.message)
    });
  }

  closeDialog() {
    this.showAddDialog = false;
    this.editMode = false;
    this.dialogDepot = { nom: '', adresse: '', mf: '' };
    this.selectedDepot = null;
    this.error = '';
  }

  applyFilter() {
    // Drive search via URL so refresh/share keeps state
    this.updateDepotUrlQuery({ page: 1, size: this.pageSize, search: this.depotFilter });
  }

  // Total livré pour un dépôt avec filtre par plage de dates (journée de travail 7h00 → 6h00)
  getTotalLivreDepot(depotId?: number): number {
    if (!depotId || !this.voyages) return 0;
    let voyagesFiltrés = this.voyages.filter(v => v.depotId === depotId && v.poidsDepot);

    if (this.dateFilterActive && (this.dateDebut || this.dateFin)) {
      const startDate = this.dateDebut ? new Date(this.dateDebut + 'T00:00:00') : new Date('1900-01-01');
      const endDate = this.dateFin ? new Date(this.dateFin + 'T00:00:00') : new Date();
      
      voyagesFiltrés = voyagesFiltrés.filter(v => {
        if (!v.date) return false;
        const voyageDateTime = new Date(v.date);
        
        // Vérifier si le voyage tombe dans l'une des journées de travail de la plage
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const workDayStart = new Date(d);
          workDayStart.setHours(7, 0, 0, 0);
          const workDayEnd = new Date(d);
          workDayEnd.setDate(workDayEnd.getDate() + 1);
          workDayEnd.setHours(6, 0, 0, 0);
          
          if (voyageDateTime >= workDayStart && voyageDateTime < workDayEnd) {
            return true;
          }
        }
        return false;
      });
    }
    return voyagesFiltrés.reduce((sum, v) => sum + (v.poidsDepot || 0), 0);
  }

  toggleDateFilter() {
    this.dateFilterActive = !this.dateFilterActive;
    if (this.dateFilterActive && !this.dateDebut && !this.dateFin) {
      this.dateDebut = this.today;
      this.dateFin = this.today;
    }
    this.clampDateFilterToToday();
    this.updateDepotUrlQuery({
      dateActive: this.dateFilterActive,
      dateDebut: this.dateFilterActive ? this.dateDebut : null,
      dateFin: this.dateFilterActive ? this.dateFin : null,
    });
    this.refreshComputedValues();
  }

  onDateFilterChange() {
    this.clampDateFilterToToday();
    if (this.dateDebut || this.dateFin) {
      this.dateFilterActive = true;
    }
    this.updateDepotUrlQuery({
      dateActive: this.dateFilterActive,
      dateDebut: this.dateFilterActive ? this.dateDebut : null,
      dateFin: this.dateFilterActive ? this.dateFin : null,
    });
    this.refreshComputedValues();
  }

  clearDateFilter() {
    this.dateFilterActive = false;
    this.dateDebut = null;
    this.dateFin = null;
    this.updateDepotUrlQuery({ dateActive: false, dateDebut: null, dateFin: null });
    this.refreshComputedValues();
  }
  
  
  sortBy(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.updateDepotUrlQuery({ page: 1, sort: this.sortColumn, dir: this.sortDirection });
  }
  
  sortDepots() {
    // Sorting is now done server-side via query params.
    this.paginatedDepots = this.filteredDepots;
  }
  
  updatePagination() {
    // Pagination is now done server-side.
    this.paginatedDepots = this.filteredDepots;
  }
  
  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.updateDepotUrlQuery({ page });
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
    this.updateDepotUrlQuery({ page: 1, size: this.pageSize });
  }

  deleteDepot(id?: number) {
    if (id === undefined) return;

    // Vérifier si le dépôt a une quantité vendue > 0
    const quantite = this.getTotalLivreDepot(id);
    if (quantite > 0) {
      this.showErrorModal = true;
      this.modalTitle = 'Suppression impossible';
      this.modalMessage = `Ce dépôt a une quantité vendue de ${quantite.toFixed(0)} kg. Vous ne pouvez pas supprimer un dépôt ayant des ventes enregistrées.`;
      this.modalIcon = 'bi-exclamation-triangle-fill';
      this.modalIconColor = '#ef4444';
      return;
    }

    // Ouvrir d'abord la boîte de dialogue de code de suppression
    const dialogRef = this.dialog.open(ConfirmCodeDialogComponent, { disableClose: true });
    dialogRef.afterClosed().subscribe((ok: boolean) => {
      if (ok === true) {
        // Afficher la modale de confirmation existante
        this.depotToDelete = id;
        this.showConfirmModal = true;
        this.modalTitle = 'Confirmer la suppression';
        this.modalMessage = 'Êtes-vous sûr de vouloir supprimer ce dépôt ? Cette action est irréversible.';
        this.modalIcon = 'bi-trash-fill';
        this.modalIconColor = '#ef4444';
      }
    });
  }

  confirmDelete() {
    if (this.depotToDelete === null) return;
    
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
    
    // Utiliser depotService.deleteDepot qui utilise la bonne méthode backend
    this.depotService.deleteDepot(this.depotToDelete, 'body').subscribe({
      next: () => {
        // console.log('✅ Dépôt supprimé avec succès');
        this.showConfirmModal = false;
        this.depotToDelete = null;
        this.loadDepots();
      },
      error: (err) => {
        console.error('❌ Erreur suppression dépôt:', err);
        this.showConfirmModal = false;
        this.showErrorModal = true;
        this.modalTitle = 'Erreur de suppression';
        
        // Message d'erreur plus explicite
        let errorMessage = 'Une erreur est survenue lors de la suppression';
        
        if (err.status === 403) {
          errorMessage = 'Vous n\'avez pas les permissions nécessaires pour supprimer ce dépôt.';
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        // Détecter les erreurs de contrainte de clé étrangère
        const errorText = JSON.stringify(err);
        if (errorText.includes('foreign key') || errorText.includes('constraint') || errorText.includes('DataIntegrityViolationException')) {
          errorMessage = 'Ce dépôt est encore associé à un ou plusieurs projets. Il ne peut pas être supprimé tant qu\'il y a des associations actives.';
        }
        
        this.modalMessage = errorMessage;
        this.modalIcon = 'bi-x-circle-fill';
        this.modalIconColor = '#ef4444';
      }
    });
  }

  cancelDelete() {
    this.showConfirmModal = false;
    this.depotToDelete = null;
  }

  closeErrorModal() {
    this.showErrorModal = false;
    this.modalTitle = '';
    this.modalMessage = '';
  }

  // Affiche une alerte temporaire pendant 1 minute (utilisé pour erreurs de dépassement)
  showTemporaryAlert(message: string, type: 'success' | 'danger' | 'warning' | 'info' = 'info') {
    this.alertMessage = message;
    this.alertType = type;
    this.showAlert = true;
    setTimeout(() => {
      this.showAlert = false;
      this.alertMessage = '';
    }, 60000);
  }

  loadDepots() {
    const targetProjetId = this.contextProjetId || this.projetActifId;
    // console.log('📊 [Depot] loadDepots() - targetProjetId:', targetProjetId);
    
    if (!targetProjetId) {
      console.warn('⚠️ Aucun projet actif - liste des dépôts vide');
      this.depots = [];
      this.filteredDepots = [];
      this.paginatedDepots = [];
      this.totalPages = 1;
      this.totalElements = 0;
      return;
    }

    const url = `${this.basePath}/api/depots/projet/${targetProjetId}/paged`;
    let params = new HttpParams()
      .set('page', String(Math.max(0, this.currentPage - 1)))
      .set('size', String(this.pageSize));

    const s = (this.depotFilter || '').trim();
    if (s.length > 0) params = params.set('search', s);

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

        this.depots = raw.map((row: any) => ({
          id: row?.id,
          nom: row?.nom,
          adresse: row?.adresse,
          mf: row?.mf,
          projetDepotId: row?.projetDepotId,
          quantiteAutorisee: Number(row?.quantiteAutorisee) || 0,
        })) as DepotWithQuantite[];

        this.filteredDepots = this.depots;
        this.paginatedDepots = this.depots;
      },
      error: (err: any) => {
        console.error('❌ Erreur chargement dépôts paginés:', err);
        this.error = 'Erreur chargement des dépôts: ' + (err.error?.message || err.message);
        this.depots = [];
        this.filteredDepots = [];
        this.paginatedDepots = [];
        this.totalPages = 1;
        this.totalElements = 0;
      }
    });
  }

  // Charger les détails des dépôts depuis les ProjetDepot
  loadDepotsDetails() {
    if (this.projetDepots.length === 0) {
      this.depots = [];
      this.filteredDepots = [];
      this.paginatedDepots = [];
      this.totalPages = 1;
      this.totalElements = 0;
      return;
    }

    // Récupérer les IDs uniques des dépôts
    const depotIds = [...new Set(this.projetDepots.map(pd => pd.depotId))];
    
    // Charger tous les dépôts
    this.depotService.getAllDepots('body').subscribe({
      next: async (data: any) => {
        let allDepots: DepotDTO[] = [];
        
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            const parsed = JSON.parse(text);
            allDepots = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.error('Erreur parsing depots:', e);
          }
        } else if (Array.isArray(data)) {
          allDepots = data;
        }
        
        // Filtrer et enrichir avec les infos de ProjetDepot
        this.depots = allDepots
          .filter(depot => depotIds.includes(depot.id!))
          .map(depot => {
            const projetDepot = this.projetDepots.find(pd => pd.depotId === depot.id);
            return {
              ...depot,
              projetDepotId: projetDepot?.id,
              quantiteAutorisee: projetDepot?.quantiteAutorisee || 0
            } as DepotWithQuantite;
          })
          .sort((a, b) => (b.id || 0) - (a.id || 0));
        
        // console.log('✅ Dépôts enrichis avec quantités:', this.depots);
        this.filteredDepots = this.depots;
        this.paginatedDepots = this.depots;
      },
      error: (err: any) => {
        console.error('❌ Erreur chargement détails dépôts:', err);
        this.depots = [];
        this.filteredDepots = [];
        this.paginatedDepots = [];
        this.totalPages = 1;
        this.totalElements = 0;
      }
    });
  }

  // Charger les voyages
  loadVoyages() {
    const targetProjetId = this.contextProjetId || this.projetActifId;
    
    if (targetProjetId) {
      // Charger les voyages du projet
      this.voyageService.getVoyagesByProjet(targetProjetId, 'body').subscribe({
        next: async (data: any) => {
          if (data instanceof Blob) {
            const text = await data.text();
            try {
              const parsed = JSON.parse(text);
              this.voyages = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              console.error('Erreur parsing voyages:', e);
              this.voyages = [];
            }
          } else {
            this.voyages = Array.isArray(data) ? data : [];
          }
          console.log('✅ [Depot] Voyages rechargés:', this.voyages.length);
          // Voyages affect computed totals; do not touch URL-driven depot paging.
          this.refreshComputedValues();
        },
        error: (err: any) => {
          console.error('Erreur chargement voyages:', err);
          this.voyages = [];
        }
      });
    } else {
      // Charger tous les voyages
      this.voyageService.getAllVoyages('body').subscribe({
        next: async (data: any) => {
          if (data instanceof Blob) {
            const text = await data.text();
            try {
              const parsed = JSON.parse(text);
              this.voyages = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              console.error('Erreur parsing voyages:', e);
              this.voyages = [];
            }
          } else {
            this.voyages = Array.isArray(data) ? data : [];
          }
          console.log('✅ [Depot] Voyages rechargés:', this.voyages.length);
          // Voyages affect computed totals; do not touch URL-driven depot paging.
          this.refreshComputedValues();
        },
        error: (err: any) => {
          console.error('Erreur chargement voyages:', err);
          this.voyages = [];
        }
      });
    }
  }

  // Calculer la quantité livrée pour un dépôt
  getQuantiteLivree(depot: DepotWithQuantite): number {
    if (!depot.id) return 0;
    // Respect date filter (work-day window) when active
    return this.getTotalLivreDepot(depot.id);
  }

  // Calculer le reste pour un dépôt
  getReste(depot: DepotWithQuantite): number {
    const quantiteAutorisee = depot.quantiteAutorisee || 0;
    const quantiteLivree = this.getQuantiteLivree(depot);
    return quantiteAutorisee - quantiteLivree;
  }

  // Calculer le pourcentage utilisé
  getPourcentageUtilise(depot: DepotWithQuantite): number {
    const quantiteAutorisee = depot.quantiteAutorisee || 0;
    if (quantiteAutorisee === 0) return 0;
    const quantiteLivree = this.getQuantiteLivree(depot);
    return (quantiteLivree / quantiteAutorisee) * 100;
  }

  // Obtenir la classe CSS pour la barre de progression
  getProgressBarClass(depot: DepotWithQuantite): string {
    const pourcentage = this.getPourcentageUtilise(depot);
    if (pourcentage >= 100) return 'progress-bar-danger';
    if (pourcentage >= 80) return 'progress-bar-warning';
    return 'progress-bar-success';
  }

  // Modal pour modifier la quantité autorisée
  showEditQuantiteModal: boolean = false;
  editingDepot: DepotWithQuantite | null = null;
  newQuantiteAutorisee: number = 0;

  openEditQuantiteModal(depot: DepotWithQuantite) {
    this.editingDepot = depot;
    this.newQuantiteAutorisee = depot.quantiteAutorisee || 0;
    this.showEditQuantiteModal = true;
  }

  confirmEditQuantite() {
    if (!this.editingDepot || !this.editingDepot.projetDepotId) {
      this.showAlert = true;
      this.alertType = 'danger';
      this.alertMessage = 'Erreur: Dépôt invalide';
      return;
    }

    if (this.newQuantiteAutorisee === null || this.newQuantiteAutorisee === undefined || this.newQuantiteAutorisee < 0) {
      this.showAlert = true;
      this.alertType = 'danger';
      this.alertMessage = 'Veuillez entrer une quantité valide (≥ 0)';
      return;
    }

    this.projetDepotService.updateQuantiteAutorisee(
      this.editingDepot.projetDepotId,
      this.newQuantiteAutorisee,
      'body'
    ).subscribe({
      next: () => {
        this.showAlert = true;
        this.alertType = 'success';
        this.alertMessage = `Quantité mise à jour avec succès (${this.newQuantiteAutorisee} kg)`;
        this.showEditQuantiteModal = false;
        this.editingDepot = null;
        
        // Recharger les données avec un petit délai
        setTimeout(() => {
          this.loadDepots();
          this.loadVoyages();
        }, 200);
      },
      error: (err) => {
        console.error('❌ Erreur mise à jour quantité:', err);
        this.showEditQuantiteModal = false;
        this.editingDepot = null;
        
        // Afficher un message personnalisé selon le type d'erreur
        this.showAlert = true;
        this.alertType = 'danger';
        
        if (err.status === 403) {
          // Erreur 403 - dépassement de quantité
          this.alertMessage = '⚠️ Quantité non autorisée : La quantité demandée dépasse la quantité disponible du projet.';
        } else if (err.status === 400 || err.status === 500) {
          // Autres erreurs de validation
          this.alertMessage = '❌ Impossible de modifier la quantité. Veuillez vérifier les données saisies.';
        } else {
          // Erreur générique
          this.alertMessage = '❌ Une erreur est survenue lors de la modification de la quantité.';
        }
      }
    });
  }

  cancelEditQuantite() {
    this.showEditQuantiteModal = false;
    this.editingDepot = null;
    this.newQuantiteAutorisee = 0;
  }

  // Alertes
  closeAlert() {
    this.showAlert = false;
  }

  getAlertTitle(): string {
    switch (this.alertType) {
      case 'success': return 'Succès';
      case 'danger': return 'Erreur';
      case 'warning': return 'Attention';
      case 'info': return 'Information';
      default: return '';
    }
  }

  // Calcul cumulé legacy supprimé: méthodes remplacées par version fenêtre [07:00, 06:00)

  formatDate(date: string | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Helper: retourne aujourd'hui au format yyyy-MM-dd (heure locale)
  private getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Export PDF
  exportToPDF(): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Titre
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Liste des Dépôts', 14, 15);

    // Informations du projet (contexte prioritaire)
    const projet = this.contextProjet || this.projetActif;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    let yPos = 25;
    if (projet) {
      if (projet.nomNavire) { doc.text(`Navire: ${projet.nomNavire}`, 14, yPos); yPos += 6; }
      if (projet.port) { doc.text(`Port: ${projet.port}`, 14, yPos); yPos += 6; }
      if (projet.nomProduit) { doc.text(`Produit: ${projet.nomProduit}`, 14, yPos); yPos += 6; }
      if (projet.nom) { doc.text(`Projet: ${projet.nom}`, 14, yPos); yPos += 6; }
      const societesSet = (projet as any)?.societeNoms || null;
      let societesStr = '';
      if (societesSet) {
        try { societesStr = Array.isArray(societesSet) ? societesSet.join(', ') : Array.from(societesSet).join(', '); } catch { societesStr = String(societesSet); }
      }
      if (societesStr) { doc.text(`Sociétés: ${societesStr}`, 14, yPos); yPos += 8; }
    }

    // Statistiques
    const totalDepots = this.filteredDepots.length;
    const totalVendu = this.filteredDepots.reduce((sum, d) => sum + (this.getTotalLivreDepot(d.id) || 0), 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    let statsY = projet ? Math.max(yPos + 6, 55) : 40;
    doc.text(`Total Dépôts: ${totalDepots}`, 14, statsY);
    doc.text(`Quantité Totale Vendue: ${totalVendu.toFixed(0)} kg`, 90, statsY);

    if (this.dateFilterActive && (this.dateDebut || this.dateFin)) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      statsY += 6;
      let filterText = 'Filtre par date: ';
      if (this.dateDebut && this.dateFin) filterText += `${this.formatDate(this.dateDebut)} - ${this.formatDate(this.dateFin)}`;
      else if (this.dateDebut) filterText += `À partir du ${this.formatDate(this.dateDebut)}`;
      else if (this.dateFin) filterText += `Jusqu'au ${this.formatDate(this.dateFin)}`;
      doc.text(filterText, 14, statsY);
    }

    // Préparer les données du tableau avec colonnes supplémentaires (PDF)
    const tableData = this.filteredDepots.map(depot => {
      const quantiteAutorisee = depot.quantiteAutorisee || 0;
      const quantiteVendue = this.getQuantiteLivree(depot);
      const reste = quantiteAutorisee - quantiteVendue;
      const pct = quantiteAutorisee === 0 ? 0 : (quantiteVendue / quantiteAutorisee) * 100;
      return [
        depot.nom || '-',
        depot.adresse || '-',
        depot.mf || '-',
        quantiteAutorisee,
        quantiteVendue,
        reste,
        pct
      ];
    });

    // Générer le tableau (compressé pour tenir sur une page paysage A4)
    // Calculer la largeur imprimable pour répartir les colonnes
    const pageWidth = (doc.internal.pageSize.width || (doc.internal.pageSize as any).getWidth()) - 20; // 10mm margins
    // Répartition en mm (approx) : Nom 50, Adresse 80, MF 40, Qta 30, Qtl 30, Reste 30, % 15
    const colWidths = [50, 80, 40, 30, 30, 30, 15];
    // Si la somme dépasse la pageWidth, réduire proportionnellement
    const sum = colWidths.reduce((s, v) => s + v, 0);
    let scale = 1;
    if (sum > pageWidth) scale = pageWidth / sum;
    const finalWidths = colWidths.map(w => Math.floor(w * scale));

    autoTable(doc, {
      startY: statsY + 10,
      head: [[
        'Nom', 'Adresse', 'Matricule Fiscal', 'Quantité Autorisée (kg)',
        'Quantité Livrée (kg)', 'Reste (kg)', '% Utilisé'
      ]],
      body: tableData.map(row => row.map((cell, idx) => {
        // Formatage des nombres pour affichage (PDF)
        if (idx >= 3 && typeof cell === 'number') {
          if (idx === 6) return (cell as number).toFixed(0) + ' %';
          return (cell as number).toFixed(0);
        }
        return cell;
      })),
      theme: 'grid',
      margin: { left: 10, right: 10 },
      tableWidth: pageWidth,
      styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
      headStyles: { fillColor: [251, 191, 36], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: finalWidths[0] },
        1: { cellWidth: finalWidths[1] },
        2: { cellWidth: finalWidths[2] },
        3: { cellWidth: finalWidths[3], halign: 'right' },
        4: { cellWidth: finalWidths[4], halign: 'right' },
        5: { cellWidth: finalWidths[5], halign: 'right' },
        6: { cellWidth: finalWidths[6], halign: 'right' }
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Page ${data.pageNumber} / ${pageCount} - Généré le ${new Date().toLocaleDateString('fr-FR')}`, 10, pageHeight - 10);
      }
    });

    // Nom de fichier plus lisible (utilise le nom du projet si disponible)
    const safeName = (projet?.nom || projet?.nomNavire || 'Liste').toString().replace(/[^a-z0-9_\-\s]/ig, '').replace(/\s+/g, '_');
    const yyyy = new Date().toISOString().slice(0,10);
    const fileName = `Depots_${safeName}_${yyyy}.pdf`;
    doc.save(fileName);
  }

  // Export Excel
  exportToExcel(): void {
    // Préparer les données avec colonnes supplémentaires
    // Garder les valeurs numériques comme des nombres (pas des chaînes) pour éviter les conversions incorrectes
    const data = this.filteredDepots.map(depot => {
      const quantiteAutorisee = depot.quantiteAutorisee || 0;
      const quantiteVendue = this.getQuantiteLivree(depot);
      const reste = quantiteAutorisee - quantiteVendue;
      const pct = quantiteAutorisee === 0 ? 0 : (quantiteVendue / quantiteAutorisee) * 100; // 0..100
      return {
        'Nom': depot.nom || '-',
        'Adresse': depot.adresse || '-',
        'Matricule Fiscal': depot.mf || '-',
        'Quantité Autorisée (kg)': quantiteAutorisee,
        'Quantité Livrée (kg)': quantiteVendue,
        'Reste (kg)': reste,
        '% Utilisé': pct
      };
    });

    // Créer la feuille de calcul avec en-tête projet (titre + meta)
    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([]);
    ws['!merges'] = ws['!merges'] || [];
    let currentRow = 0;

    XLSX.utils.sheet_add_aoa(ws, [[`Liste des Dépôts`]], { origin: { r: currentRow, c: 0 } });
    ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 6 } });
    currentRow++;
    currentRow++; // Ligne vide après le titre

    const projet = this.contextProjet || this.projetActif;
    if (projet) {
      if (projet.nomNavire) { XLSX.utils.sheet_add_aoa(ws, [[`Navire: ${projet.nomNavire}`]], { origin: { r: currentRow, c: 0 } }); ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 6 } }); currentRow++; }
      if (projet.port) { XLSX.utils.sheet_add_aoa(ws, [[`Port: ${projet.port}`]], { origin: { r: currentRow, c: 0 } }); ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 6 } }); currentRow++; }
      if (projet.nomProduit) { XLSX.utils.sheet_add_aoa(ws, [[`Produit: ${projet.nomProduit}`]], { origin: { r: currentRow, c: 0 } }); ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 6 } }); currentRow++; }
      const societesSet = (projet as any)?.societeNoms || null;
      let societesStr = '';
      if (societesSet) { try { societesStr = Array.isArray(societesSet) ? societesSet.join(', ') : Array.from(societesSet).join(', '); } catch { societesStr = String(societesSet); } }
      if (societesStr) { XLSX.utils.sheet_add_aoa(ws, [[`Sociétés: ${societesStr}`]], { origin: { r: currentRow, c: 0 } }); ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 6 } }); currentRow++; }
      if ((projet as any).dateDebut) { try { XLSX.utils.sheet_add_aoa(ws, [[`Date début projet: ${this.formatDate((projet as any).dateDebut)}`]], { origin: { r: currentRow, c: 0 } }); ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 6 } }); currentRow++; } catch {} }
    }

    currentRow++;

    // Statistiques (comme dans le PDF)
    const totalDepotsCalc = this.filteredDepots.length;
    const totalVenduCalc = this.filteredDepots.reduce((sum, d) => sum + (this.getTotalLivreDepot(d.id) || 0), 0);

    XLSX.utils.sheet_add_aoa(ws, [[`Total Dépôts: ${totalDepotsCalc}     Quantité Totale Vendue: ${totalVenduCalc.toFixed(0)} kg`]], { origin: { r: currentRow, c: 0 } });
    ws['!merges'].push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 6 } });
    currentRow++;

    currentRow++;

    // Headers définis explicitement pour éviter header=[] ou différence d'ordre
    const headers = [
      'Nom', 'Adresse', 'Matricule Fiscal',
      'Quantité Autorisée (kg)', 'Quantité Livrée (kg)', 'Reste (kg)', '% Utilisé'
    ];

    // Ajouter les données (les valeurs numériques sont des nombres, pas des chaînes)
    // Si data est vide, on ajoute quand même la ligne d'en-tête pour garder la structure valide
    if (data.length === 0) {
      XLSX.utils.sheet_add_aoa(ws, [headers], { origin: { r: currentRow, c: 0 } });
      // Mettre la référence manuellement
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: currentRow, c: headers.length - 1 } });
    } else {
      XLSX.utils.sheet_add_json(ws, data, { origin: { r: currentRow, c: 0 }, header: headers, skipHeader: false });
    }

    // Définir la largeur des colonnes
    ws['!cols'] = [
      { wch: 30 }, // Nom
      { wch: 50 }, // Adresse
      { wch: 25 }, // MF
      { wch: 20 }, // Quantité Autorisée
      { wch: 20 }, // Quantité Livrée
      { wch: 18 }, // Reste
      { wch: 12 }  // % Utilisé
    ];

    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dépôts');

    // Post-traitement: formater les colonnes numériques et activer filtre + gel d'entête
    try {
      // Déterminer la plage utilisée
      if (!ws['!ref']) {
        // si pour une raison quelconque la ref n'existe pas, construire une ref minimale
        const lastCol = headers.length - 1;
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: currentRow + (data.length > 0 ? data.length : 0), c: lastCol } });
      }

      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

      // Appliquer format numérique pour colonnes 4..6 (index 3..5) et pourcentage sur la dernière (index 6)
      for (let R = range.s.r + 1; R <= range.e.r; ++R) { // +1 pour sauter l'en-tête
        // Quantité Autorisée (col D / index 3)
        const cellD = XLSX.utils.encode_cell({ r: R, c: 3 });
        if (ws[cellD] && typeof ws[cellD].v !== 'undefined') { const val = Number(ws[cellD].v); if (!isNaN(val)) { ws[cellD].t = 'n'; ws[cellD].z = '0'; ws[cellD].v = val; } }

        // Quantité Livrée (col E / index 4)
        const cellE = XLSX.utils.encode_cell({ r: R, c: 4 });
        if (ws[cellE] && typeof ws[cellE].v !== 'undefined') { const val = Number(ws[cellE].v); if (!isNaN(val)) { ws[cellE].t = 'n'; ws[cellE].z = '0'; ws[cellE].v = val; } }

        // Reste (col F / index 5)
        const cellF = XLSX.utils.encode_cell({ r: R, c: 5 });
        if (ws[cellF] && typeof ws[cellF].v !== 'undefined') { const val = Number(ws[cellF].v); if (!isNaN(val)) { ws[cellF].t = 'n'; ws[cellF].z = '0'; ws[cellF].v = val; } }

        // % Utilisé (col G / index 6) - stocké en pourcentage (0-100) -> convertir en fraction
        const cellG = XLSX.utils.encode_cell({ r: R, c: 6 });
        if (ws[cellG] && typeof ws[cellG].v !== 'undefined') {
          const raw = Number(ws[cellG].v);
          if (!isNaN(raw)) {
            ws[cellG].t = 'n';
            // convert to fraction for Excel percent format
            ws[cellG].v = raw / 100;
            ws[cellG].z = '0.0%';
          }
        }
      }

      // Activer autofilter sur toute la table si la référence est valide
      if (ws['!ref']) {
        (ws as any)['!autofilter'] = { ref: ws['!ref'] };
      }

      // Geler la 1ère ligne (vue du classeur)
      (wb as any).Workbook = (wb as any).Workbook || {};
      (wb as any).Workbook.Views = [{ xSplit: 0, ySplit: currentRow + 1, topLeftCell: 'A2', activeTab: 0 }];
    } catch (e) {
      // Si quelque chose échoue, ne pas bloquer l'export
      console.warn('Post-traitement Excel échoué:', e);
    }

    // Feuille de statistiques
    const totalVendu = this.filteredDepots.reduce((sum, d) => sum + (this.getQuantiteLivree(d) || 0), 0);
    const totalDepots = this.filteredDepots.length;
    const statsData: any[] = [];
    if (projet) {
      statsData.push({ 'Statistique': 'Projet', 'Valeur': projet.nom || '-' });
      statsData.push({ 'Statistique': 'Navire', 'Valeur': projet.nomNavire || '-' });
      statsData.push({ 'Statistique': 'Port', 'Valeur': projet.port || '-' });
      statsData.push({ 'Statistique': 'Produit', 'Valeur': projet.nomProduit || '-' });
    }
    statsData.push({ 'Statistique': 'Total Dépôts', 'Valeur': totalDepots });
    statsData.push({ 'Statistique': 'Quantité Totale Vendue (kg)', 'Valeur': Number(totalVendu.toFixed(0)) });

    const wsStats: XLSX.WorkSheet = XLSX.utils.json_to_sheet(statsData);
    wsStats['!cols'] = [{ wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsStats, 'Statistiques');

    const safeName = (projet?.nom || projet?.nomNavire || 'Liste').toString().replace(/[^a-z0-9_\-\s]/ig, '').replace(/\s+/g, '_');
    const yyyy = new Date().toISOString().slice(0,10);
    const fileName = `Depots_${safeName}_${yyyy}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }
}
