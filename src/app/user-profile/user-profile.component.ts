import { Component, OnInit } from '@angular/core';
import { AuthService } from '../core/auth.service';
import * as firebase from 'firebase/app';
import { Http, Headers } from '@angular/http';
import { AngularFirestore, AngularFirestoreDocument, AngularFirestoreCollection } from 'angularfire2/firestore';
import { FirestoreService} from '../core/firestore.service';
import 'rxjs/add/operator/toPromise';


@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit {

  public loading = false;

  constructor(public auth: AuthService, 
              private afs: FirestoreService,
              public http: Http) { }

  ngOnInit() {
  }

  private updateClientSystemData(clientSystem) {
    this.loading = true;
    const data = {
      Address0: {
        City: clientSystem.Address0.City,
        Country: clientSystem.Address0.Country,
        PostalCode: clientSystem.Address0.PostalCode
      }
    }
    this.afs.upsert(`client_systems/${clientSystem.id}`, data).then(res => this.loading = false)
  }


  authoriseXero(){
    this.loading = true;
    const url = 'https://us-central1-rollabill-5503a.cloudfunctions.net/app/authorise';
    //const url = 'http://localhost:5000/rollabill-5503a/us-central1/app/authorise';
    firebase.auth().currentUser.getIdToken()
    .then(authToken => {
      const headers = new Headers({'Authorization': 'Bearer ' + authToken });
      return this.http.get(url, { headers: headers }).toPromise()
    })
    .then(res => window.location.href = res.text())
  }

  getXeroContacts(){
    this.loading = true;
    //const url = 'https://us-central1-rollabill-5503a.cloudfunctions.net/app/xero_contacts';
    const url = 'http://localhost:5000/rollabill-5503a/us-central1/app/xero_contacts';
    firebase.auth().currentUser.getIdToken()
    .then(authToken => {
      const headers = new Headers({'Authorization': 'Bearer ' + authToken });
      return this.http.get(url, { headers: headers }).toPromise()
    })
    .then(res => this.loading = false)
  }

  getXeroInvoices(){
    this.loading = true;
    //const url = 'https://us-central1-rollabill-5503a.cloudfunctions.net/app/xero_invoices';
    const url = 'http://localhost:5000/rollabill-5503a/us-central1/app/xero_invoices';
    firebase.auth().currentUser.getIdToken()
    .then(authToken => {
      const headers = new Headers({'Authorization': 'Bearer ' + authToken });
      return this.http.get(url, { headers: headers }).toPromise()
    })
    .then(res => this.loading = false)
  }

  getXeroItems(){
    this.loading = true;
    //const url = 'https://us-central1-rollabill-5503a.cloudfunctions.net/app/xero_items';
    const url = 'http://localhost:5000/rollabill-5503a/us-central1/app/xero_items';
    firebase.auth().currentUser.getIdToken()
    .then(authToken => {
      const headers = new Headers({'Authorization': 'Bearer ' + authToken });
      return this.http.get(url, { headers: headers }).toPromise()
    })
    .then(res => this.loading = false)
  }
}
