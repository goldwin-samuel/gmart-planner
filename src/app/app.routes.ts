import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from './core/auth.service';

const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).createUrlTree(['/login']);
};

const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? inject(Router).createUrlTree(['/tabs/home']) : true;
};

const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/tabs/more']);
};

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage),
  },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'home', loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'list', loadComponent: () => import('./pages/list/list.page').then((m) => m.ListPage) },
      { path: 'money', loadComponent: () => import('./pages/money/money.page').then((m) => m.MoneyPage) },
      { path: 'insights', loadComponent: () => import('./pages/insights/insights.page').then((m) => m.InsightsPage) },
      { path: 'more', loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage) },
      { path: 'item/:id', loadComponent: () => import('./pages/item-detail/item-detail.page').then((m) => m.ItemDetailPage) },
      { path: 'categories', loadComponent: () => import('./pages/categories/categories.page').then((m) => m.CategoriesPage) },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: 'tabs/home', pathMatch: 'full' },
  { path: '**', redirectTo: 'tabs/home' },
];
