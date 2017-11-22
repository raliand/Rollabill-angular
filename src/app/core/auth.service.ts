import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import * as firebase from 'firebase/app';
import { AngularFireAuth } from 'angularfire2/auth';
import { AngularFirestore, AngularFirestoreDocument, AngularFirestoreCollection } from 'angularfire2/firestore';
import { FirestoreService} from './firestore.service';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/switchMap'


export interface User {
  uid: string;
  email: string;
  photoURL?: string;
  displayName?: string;
  selected_client_system?: string;
}

export interface ClientSystem {
  _id: string;
  type: string;
  Name?: string;
  status?: string;
  createdAt?: string;
}

@Injectable()
export class AuthService {
  
  user: Observable<User>;
  clientSystem: Observable<ClientSystem>;
  userClientSystems: Observable<any[]>

  constructor(private afAuth: AngularFireAuth,
              private afs: FirestoreService,
              private router: Router) {

      //// Get auth data, then get firestore user document || null
      this.user = this.afAuth.authState
        .switchMap(user => {
          if (user) {
            this.clientSystem = this.afs.docWithId$<User>(`users/${user.uid}`).switchMap(doc => {
              return this.afs.docWithId$<ClientSystem>(doc.selected_client_system.path)
                .map(item => {
                  if(item.type == 'sageone'){
                    return {Name: item.name, ...item}
                  } else {
                    return item
                  }
                })
            })
            this.userClientSystems = this.afs.col$('user_client_systems', ref => ref.where('user_id', '==', user.uid))
            return this.afs.doc$<User>(`users/${user.uid}`)
          } else {
            return Observable.of(null)
          }
        })
  }

  googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider()
    return this.oAuthLogin(provider);
  }

  private oAuthLogin(provider) {
    return this.afAuth.auth.signInWithPopup(provider)
      .then((credential) => {
        this.updateUserData(credential.user);
        this.router.navigate(['/']);
      })
  }

  private updateUserData(user) {
    // Sets user data to firestore on login
    const data: User = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    }
    return this.afs.upsert(`users/${user.uid}`,data)
  }
  
  signOut() {
    this.afAuth.auth.signOut().then(() => {
        this.router.navigate(['/']);
    });
  }
}