import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { PreloadAllModules, RouteReuseStrategy, provideRouter, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AuthService } from './app/core/auth.service';
import { FeedbackService } from './app/core/feedback.service';
import { LayoutService } from './app/core/layout.service';
import { StoreService } from './app/core/store.service';
import { ThemeService } from './app/core/theme.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'ios', swipeBackEnabled: true }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAppInitializer(async () => {
      const theme = inject(ThemeService);
      const fb = inject(FeedbackService);
      const auth = inject(AuthService);
      const store = inject(StoreService);
      const layout = inject(LayoutService);
      await Promise.all([theme.init(), fb.init(), auth.restore(), layout.init()]);
      if (auth.user()) await store.hydrate();
    }),
  ],
}).catch((err) => console.error(err));
