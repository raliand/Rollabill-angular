import { NgModule } from '@angular/core';
import { AuthService } from './auth.service';
import { AngularFireAuthModule } from 'angularfire2/auth';
import { AngularFirestoreModule } from 'angularfire2/firestore';
import { FirestoreService } from './firestore.service';
import { MessagingService } from './messaging.service';
import { HttpService } from './http.service';
@NgModule({
  imports: [
    AngularFireAuthModule,
    AngularFirestoreModule
  ],
  providers: [AuthService, FirestoreService, MessagingService, HttpService]
})
export class CoreModule { }