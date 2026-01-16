import { Injectable } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './service/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthErrorInterceptor implements HttpInterceptor {
  private isHandlingExpiration = false;
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: any) => {
        if (error instanceof HttpErrorResponse) {
          // Gérer les erreurs 401 - Token invalide ou expiré
          if (error.status === 401) {
            // 401 reste en général une erreur d'authentification -> logout
            // Mais si le backend renvoie un message métier clair (rare pour 401), on pourrait l'afficher côté UI.
            console.warn('🔒 Token expiré ou invalide (401). Déconnexion automatique...');
            this.handleTokenExpiration();
          }
          
          // Gérer les erreurs 403 liées au token expiré
          if (error.status === 403) {
            const errorMessageRaw = (error.error?.message || error.error || error.message || '').toString();
            const errorMessage = errorMessageRaw.toLowerCase();
            // Use the outgoing request URL as primary source (more reliable in interceptors)
            const requestUrl = (req && (req.urlWithParams || req.url)) || error.url || '';

            // Heuristiques: certains messages sont des erreurs métier (duplicate, exists, déjà, ticket/bon existant)
            const businessKeywords = [
              'existe', 'déjà', 'already exists', 'already', 'exists', 'duplicate', 'dupli',
              'numticket', 'num ticket', 'numéro de ticket', 'ticket',
              'numbon', 'num bon', 'bonlivraison', 'bon de livraison', 'bon', 'bonlivraison', 'bon de liv' 
            ];

            const msgLooksLikeBusiness = businessKeywords.some(k => errorMessage.includes(k));

            // Endpoint specific whitelist (POST create dechargement often returns business 403)
            const isDechargementCreate = requestUrl.includes('/api/dechargement') && req.method === 'POST';
            const isNotificationsPost = requestUrl.includes('/api/notifications') && req.method === 'POST';
            const isProjetDepotCreate = requestUrl.includes('/api/projet-depot') && req.method === 'POST';
            const isQuantiteAutorisee = (requestUrl.includes('/api/projet-client/') && requestUrl.includes('/quantite-autorisee')) ||
                                       (requestUrl.includes('/api/projet-depot/') && requestUrl.includes('/quantite-autorisee'));

            // If the response looks like a business error (by endpoint or message), do NOT logout; let the component handle it
            if (isDechargementCreate || isNotificationsPost || isProjetDepotCreate || isQuantiteAutorisee || msgLooksLikeBusiness) {
              console.warn('⚠️ 403 métier détecté (no-logout). Request:', req.method, requestUrl, 'Message:', errorMessageRaw);
              return throwError(() => error);
            }

            // Otherwise treat as authentication/authorization problem
            // Don't check if user is authenticated - just handle the 403 as token expiration
            console.warn('🔒 Erreur 403 reçue - Token probablement expiré ou invalide.');
            console.warn('   📍 Request:', req.method, requestUrl);
            console.warn('   💬 Message:', errorMessageRaw || 'Aucun message');
            console.warn('   🚪 Déconnexion automatique...');
            this.handleTokenExpiration();
          }
        }
        return throwError(() => error);
      })
    );
  }

  private handleTokenExpiration(): void {
    // Éviter les appels multiples simultanés
    if (this.isHandlingExpiration) {
      // console.log('⏭️ Déconnexion déjà en cours, ignoré...');
      return;
    }
    
    this.isHandlingExpiration = true;
    // console.log('🚪 Déconnexion de l\'utilisateur...');
    
    // Marquer comme déconnecté immédiatement
    this.authService.markLoggedOut();
    
    // Nettoyer les données locales
    try {
      localStorage.removeItem('projetActif');
      localStorage.removeItem('viewMode');
      localStorage.removeItem('isAllVoyagesView');
      localStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('projetActifId');
    } catch {}
    
    // Supprimer le cookie JWT
    if (typeof document !== 'undefined') {
      document.cookie = 'jwt=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
    
    // Rediriger vers la page de connexion avec paramètre d'expiration
    setTimeout(() => {
      this.isHandlingExpiration = false;
      if (!this.router.url.includes('/login')) {
        // console.log('↪️ Redirection vers /login avec message d\'expiration');
        this.router.navigate(['/login'], { 
          queryParams: { 
            expired: 'true'
          } 
        });
      } else {
        // console.log('↪️ Déjà sur la page de login');
      }
    }, 100);
  }
}
