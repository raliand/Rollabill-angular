import { Component, OnInit, ElementRef } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { ROUTES } from '../sidebar/sidebar.component';
import {Location, LocationStrategy, PathLocationStrategy} from '@angular/common';
import * as firebase from 'firebase/app';
import { Http, Headers } from '@angular/http';
import 'rxjs/add/operator/toPromise';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit {
    private listTitles: any[];
    location: Location;
    private toggleButton: any;
    private sidebarVisible: boolean;
    public loading = false;

    constructor(public auth: AuthService, location: Location,  private element: ElementRef, public http: Http) {
      this.location = location;
          this.sidebarVisible = false;
    }

    ngOnInit(){
      this.listTitles = ROUTES.filter(listTitle => listTitle);
      const navbar: HTMLElement = this.element.nativeElement;
      this.toggleButton = navbar.getElementsByClassName('navbar-toggle')[0];
    }

    sidebarOpen() {
        const toggleButton = this.toggleButton;
        const body = document.getElementsByTagName('body')[0];
        setTimeout(function(){
            toggleButton.classList.add('toggled');
        }, 500);
        body.classList.add('nav-open');

        this.sidebarVisible = true;
    };
    sidebarClose() {
        const body = document.getElementsByTagName('body')[0];
        this.toggleButton.classList.remove('toggled');
        this.sidebarVisible = false;
        body.classList.remove('nav-open');
    };
    sidebarToggle() {
        // const toggleButton = this.toggleButton;
        // const body = document.getElementsByTagName('body')[0];
        if (this.sidebarVisible === false) {
            this.sidebarOpen();
        } else {
            this.sidebarClose();
        }
    };

    getTitle(){
      var titlee = this.location.prepareExternalUrl(this.location.path());
      if(titlee.charAt(0) === '#'){
          titlee = titlee.slice( 2 );
      }
      titlee = titlee.split('/').pop();

      for(var item = 0; item < this.listTitles.length; item++){
          if(this.listTitles[item].path === titlee){
              return this.listTitles[item].title;
          }
      }
      return 'Dashboard';
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
        const url = 'https://us-central1-rollabill-5503a.cloudfunctions.net/app/xero_contacts';
        //const url = 'http://localhost:5000/rollabill-5503a/us-central1/app/xero_contacts';
        firebase.auth().currentUser.getIdToken()
        .then(authToken => {
          const headers = new Headers({'Authorization': 'Bearer ' + authToken });
          return this.http.get(url, { headers: headers }).toPromise()
        })
        .then(res => this.loading = false)
      }
    
      getXeroInvoices(){
        this.loading = true;
        const url = 'https://us-central1-rollabill-5503a.cloudfunctions.net/app/xero_invoices';
        //const url = 'http://localhost:5000/rollabill-5503a/us-central1/app/xero_invoices';
        firebase.auth().currentUser.getIdToken()
        .then(authToken => {
          const headers = new Headers({'Authorization': 'Bearer ' + authToken });
          return this.http.get(url, { headers: headers }).toPromise()
        })
        .then(res => this.loading = false)
      }
    
      getXeroItems(){
        this.loading = true;
        const url = 'https://us-central1-rollabill-5503a.cloudfunctions.net/app/xero_items';
        //const url = 'http://localhost:5000/rollabill-5503a/us-central1/app/xero_items';
        firebase.auth().currentUser.getIdToken()
        .then(authToken => {
          const headers = new Headers({'Authorization': 'Bearer ' + authToken });
          return this.http.get(url, { headers: headers }).toPromise()
        })
        .then(res => this.loading = false)
      }
}
