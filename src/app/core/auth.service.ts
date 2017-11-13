import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import * as firebase from 'firebase/app';
import { AngularFireAuth } from 'angularfire2/auth';
import { AngularFirestore, AngularFirestoreDocument, AngularFirestoreCollection } from 'angularfire2/firestore';
import { FirestoreService} from './firestore.service';
import { Observable } from 'rxjs/Observable';
import { OAuthService } from 'angular-oauth2-oidc';
import { JwksValidationHandler } from 'angular-oauth2-oidc';
import { AuthConfig } from 'angular-oauth2-oidc';
import 'rxjs/add/operator/switchMap'


export interface User {
  uid: string;
  email: string;
  photoURL?: string;
  displayName?: string;
  selected_client_system?: string;
}

export interface ClientSystem {
  id?: string;
  client_id?: string;
  name?: string;
  type?: string;
  status?: string;
  access_token?: string;
  access_token_secret?: string;
}

export const authConfig: AuthConfig = {
    loginUrl: 'https://www.sageone.com/oauth2/auth/central',
    // Url of the Identity Provider
    issuer: 'https://www.sageone.com/oauth2/auth/central',
    // URL of the SPA to redirect the user to after login
    redirectUri: 'http://localhost:4200',
    // The SPA's id. The SPA is registerd with this id at the auth-server
    clientId: 'b2df7060c0c9ec1225f0',
    responseType: 'code',
    // set the scope for the permissions the client should request
    // The first three are defined by OIDC. The 4th is a usecase-specific one
    scope: 'full_access',
 }

@Injectable()
export class AuthService {
  userDoc: Observable<any>;
  clientSystems: AngularFirestoreCollection<ClientSystem>;
  clientSystemDoc: AngularFirestoreDocument<ClientSystem>;

  user: Observable<User>;
  clientSystem: Observable<ClientSystem>;

  constructor(private afAuth: AngularFireAuth,
              private afs: FirestoreService,
              private oauthService: OAuthService,
              private router: Router) {

      //// Get auth data, then get firestore user document || null
      this.user = this.afAuth.authState
        .switchMap(user => {
          if (user) {
            this.clientSystem = this.afs.doc$<ClientSystem>(`users/${user.uid}`).switchMap(doc => {
              return this.afs.docWithId$<ClientSystem>(doc.selected_client_system.path)
            })
            return this.afs.doc$<User>(`users/${user.uid}`)
          } else {
            return Observable.of(null)
          }
        })
      
      this.configureWithNewConfigApi();
  }

  private configureWithNewConfigApi() {
    this.oauthService.configure(authConfig);
    this.oauthService.tokenValidationHandler = new JwksValidationHandler();
    this.oauthService.oidc = false; // ID_Token
    this.oauthService.setStorage(localStorage);
    this.oauthService.strictDiscoveryDocumentValidation = false;
    this.oauthService.tryLogin();
  }

  googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider()
    return this.oAuthLogin(provider);
  }

  xeroLogin(clientSystemId){
    const data: ClientSystem = {
      status: 'connecting'
    }
    return this.afs.upsert(`client_systems/${clientSystemId}`,data)
  }

  private oAuthLogin(provider) {
    return this.afAuth.auth.signInWithPopup(provider)
      .then((credential) => {
        this.updateUserData(credential.user);
        this.router.navigate(['/']);
      })
  }

  public sageLogin() {
    this.oauthService.requestAccessToken = true;
    this.oauthService.requireHttps = false;
    this.oauthService.responseType = 'code';
    this.oauthService.initImplicitFlow();
  }

  public logoff() {
      this.oauthService.logOut();
  }

  public get name() {
      let claims = this.oauthService.getIdentityClaims();
      if (!claims) return null;
      return (<any>claims).given_name;
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