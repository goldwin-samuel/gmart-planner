import { Component, effect, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { Style, StatusBar } from '@capacitor/status-bar';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add,
  mic,
  micOutline,
  volumeHighOutline,
  volumeMuteOutline,
  warningOutline,
  addCircleOutline,
  alertCircleOutline,
  appsOutline,
  arrowDownOutline,
  arrowUpOutline,
  bagCheckOutline,
  bedOutline,
  calendarOutline,
  cartOutline,
  checkmark,
  checkmarkCircle,
  chevronBack,
  chevronForward,
  closeCircle,
  closeOutline,
  cloudDoneOutline,
  cloudOfflineOutline,
  cloudUploadOutline,
  colorPaletteOutline,
  createOutline,
  documentTextOutline,
  downloadOutline,
  ellipseOutline,
  eyeOffOutline,
  eyeOutline,
  filterOutline,
  flameOutline,
  gridOutline,
  homeOutline,
  informationCircleOutline,
  keyOutline,
  layersOutline,
  listOutline,
  lockClosedOutline,
  logOutOutline,
  moonOutline,
  notificationsOutline,
  peopleOutline,
  personOutline,
  pricetagsOutline,
  receiptOutline,
  refreshOutline,
  removeOutline,
  searchOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  star,
  starOutline,
  statsChartOutline,
  storefrontOutline,
  sunnyOutline,
  swapVerticalOutline,
  syncOutline,
  timeOutline,
  trashOutline,
  trendingDownOutline,
  trendingUpOutline,
  walletOutline,
  cameraOutline,
  imagesOutline,
  scanOutline,
  cashOutline,
  swapHorizontalOutline,
  barChartOutline,
  pieChartOutline,
  arrowDownCircleOutline,
  arrowUpCircleOutline,
  ellipsisHorizontal,
  documentOutline,
  checkmarkDone,
} from 'ionicons/icons';
import { AuthService } from './core/auth.service';
import { StoreService } from './core/store.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>`,
})
export class AppComponent {
  private theme = inject(ThemeService);
  private store = inject(StoreService);
  private auth = inject(AuthService);

  constructor() {
    addIcons({
      mic,
      'mic-outline': micOutline,
      'volume-high-outline': volumeHighOutline,
      'volume-mute-outline': volumeMuteOutline,
      'warning-outline': warningOutline,
      'camera-outline': cameraOutline,
      'images-outline': imagesOutline,
      'scan-outline': scanOutline,
      'cash-outline': cashOutline,
      'swap-horizontal-outline': swapHorizontalOutline,
      'bar-chart-outline': barChartOutline,
      'pie-chart-outline': pieChartOutline,
      'arrow-down-circle-outline': arrowDownCircleOutline,
      'arrow-up-circle-outline': arrowUpCircleOutline,
      'ellipsis-horizontal': ellipsisHorizontal,
      'document-outline': documentOutline,
      'checkmark-done': checkmarkDone,
      add,
      'add-circle-outline': addCircleOutline,
      'alert-circle-outline': alertCircleOutline,
      'apps-outline': appsOutline,
      'arrow-down-outline': arrowDownOutline,
      'arrow-up-outline': arrowUpOutline,
      'bag-check-outline': bagCheckOutline,
      'bed-outline': bedOutline,
      'calendar-outline': calendarOutline,
      'cart-outline': cartOutline,
      checkmark,
      'checkmark-circle': checkmarkCircle,
      'chevron-back': chevronBack,
      'chevron-forward': chevronForward,
      'close-circle': closeCircle,
      'close-outline': closeOutline,
      'cloud-done-outline': cloudDoneOutline,
      'cloud-offline-outline': cloudOfflineOutline,
      'cloud-upload-outline': cloudUploadOutline,
      'color-palette-outline': colorPaletteOutline,
      'create-outline': createOutline,
      'document-text-outline': documentTextOutline,
      'download-outline': downloadOutline,
      'ellipse-outline': ellipseOutline,
      'eye-off-outline': eyeOffOutline,
      'eye-outline': eyeOutline,
      'filter-outline': filterOutline,
      'flame-outline': flameOutline,
      'grid-outline': gridOutline,
      'home-outline': homeOutline,
      'information-circle-outline': informationCircleOutline,
      'key-outline': keyOutline,
      'layers-outline': layersOutline,
      'list-outline': listOutline,
      'lock-closed-outline': lockClosedOutline,
      'log-out-outline': logOutOutline,
      'moon-outline': moonOutline,
      'notifications-outline': notificationsOutline,
      'people-outline': peopleOutline,
      'person-outline': personOutline,
      'pricetags-outline': pricetagsOutline,
      'receipt-outline': receiptOutline,
      'refresh-outline': refreshOutline,
      'remove-outline': removeOutline,
      'search-outline': searchOutline,
      'settings-outline': settingsOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'sparkles-outline': sparklesOutline,
      star,
      'star-outline': starOutline,
      'stats-chart-outline': statsChartOutline,
      'storefront-outline': storefrontOutline,
      'sunny-outline': sunnyOutline,
      'swap-vertical-outline': swapVerticalOutline,
      'sync-outline': syncOutline,
      'time-outline': timeOutline,
      'trash-outline': trashOutline,
      'trending-down-outline': trendingDownOutline,
      'trending-up-outline': trendingUpOutline,
      'wallet-outline': walletOutline,
    });

    // keep the native status bar in step with the theme
    effect(() => {
      const dark = this.theme.isDark();
      if (!Capacitor.isNativePlatform()) return;
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
      if (Capacitor.getPlatform() === 'android') {
        StatusBar.setBackgroundColor({ color: dark ? '#080d1a' : '#f3f5f9' }).catch(() => {});
      }
    });

    if (Capacitor.isNativePlatform()) {
      setTimeout(() => SplashScreen.hide().catch(() => {}), 350);
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && this.auth.user()) void this.store.refresh();
      });
    }

    // first cloud sync for a restored session, and whenever the network returns
    if (this.auth.user()) void this.store.refresh();
    window.addEventListener('online', () => {
      if (this.auth.user()) void this.store.refresh();
    });
  }
}
