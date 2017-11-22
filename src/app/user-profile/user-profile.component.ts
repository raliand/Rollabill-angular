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

  authorise(type){
    this.loading = true;
    const url = 'https://us-central1-rollabill-5503a.cloudfunctions.net/app/authorise_freeagent';
    // const url = `http://localhost:5000/rollabill-5503a/us-central1/app/authorise/${type}`;
    firebase.auth().currentUser.getIdToken()
    .then(authToken => {
      const headers = new Headers({'Authorization': 'Bearer ' + authToken });
      return this.http.get(url, { headers: headers }).toPromise()
    })
    .then(res => window.location.href = res.text()).catch(err => {
      console.log(err)
    })
  }

  addClientSystem(type, userId, currentSystemId){
    this.loading = true;
    var data = {
      AmountOwed: 0,
      AmountOwing: 0,
      AmountPaid: 0,
      AmountReceived: 0,
      NotPaidPayableInvoices: 0,
      NotPaidReceivebleInvoices: 0,
      PaidPayableInvoices: 0,
      PaidReceivebleInvoices: 0,
      Name: `New ${type}`,
      status: 'disconnected',
      invoicesUpdatedAt: new Date('1900-01-01'),
      type: type
    }
    this.afs.add('client_systems', data).then(newCS => {
      this.afs.add(`user_client_systems`, {client_system_id: newCS.id, name: `New ${type}`, user_id: userId}).then(re =>{
        this.afs.upsert(`users/${userId}`, {selected_client_system: this.afs.doc(`client_systems/${newCS.id}`).ref})
          .then(res => { this.authorise(type) }).catch(err => {
            this.afs.upsert(`users/${userId}`, {selected_client_system: this.afs.doc(`client_systems/${currentSystemId}`).ref})
          })
        })
      })
  }
}
