import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';
import { RouterModule } from '@angular/router';

import { AppRoutingModule } from './app.routing';
import { ComponentsModule } from './components/components.module';

import { AppComponent } from './app.component';

import { DashboardComponent } from './dashboard/dashboard.component';
import { UserProfileComponent } from './user-profile/user-profile.component';
import { TableListComponent } from './table-list/table-list.component';
import { TypographyComponent } from './typography/typography.component';
import { IconsComponent } from './icons/icons.component';
import { MapsComponent } from './maps/maps.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { UpgradeComponent } from './upgrade/upgrade.component';

import { AngularFireModule } from 'angularfire2';
import { CoreModule } from './core/core.module';
import { AuthGuard } from './core/auth.guard';
import { LoginComponent } from './login/login.component';
import { OAuthModule } from 'angular-oauth2-oidc';

const firebaseConfig = {
  apiKey: "AIzaSyBYCRGNQiEJv_LqbnKCGn7Hm2NcKO2_h9M",
  authDomain: "rollabill-5503a.firebaseapp.com",
  databaseURL: "https://rollabill-5503a.firebaseio.com",
  projectId: "rollabill-5503a",
  storageBucket: "rollabill-5503a.appspot.com",
  messagingSenderId: "363147593639"
};

@NgModule({
  declarations: [
    AppComponent,
    DashboardComponent,
    UserProfileComponent,
    TableListComponent,
    TypographyComponent,
    IconsComponent,
    MapsComponent,
    NotificationsComponent,
    UpgradeComponent,
    LoginComponent,

  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpModule,
    ComponentsModule,
    RouterModule,
    AngularFireModule.initializeApp(firebaseConfig),
    AppRoutingModule,
    CoreModule,
    OAuthModule.forRoot() 
  ],
  providers: [AuthGuard],
  bootstrap: [AppComponent]
})
export class AppModule { }
