import { Component, OnInit, ElementRef } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { ROUTES } from '../sidebar/sidebar.component';
import {Location, LocationStrategy, PathLocationStrategy} from '@angular/common';
import * as firebase from 'firebase/app';
import { Http, Headers } from '@angular/http';
import {CapitalizePipe} from "../../capitalize.pipe";
import { FirestoreService} from '../../core/firestore.service';
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

    constructor(public auth: AuthService, location: Location,  private element: ElementRef, public http: Http, private afs: FirestoreService) {
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

    authorise(type){
      this.loading = true;
      const url = `https://us-central1-rollabill-5503a.cloudfunctions.net/app/authorise/${type}`;
    //   const url = `http://localhost:5000/rollabill-5503a/us-central1/app/authorise/${type}`;
      firebase.auth().currentUser.getIdToken()
      .then(authToken => {
        const headers = new Headers({'Authorization': 'Bearer ' + authToken });
        return this.http.get(url, { headers: headers }).toPromise()
      })
      .then(res => window.location.href = res.text()).catch(err => {
        console.log(err)
      })
    }
  
    getEntity(entity, type){
      this.loading = true;
      const url = `https://us-central1-rollabill-5503a.cloudfunctions.net/app/api/${entity}/${type}`;
    //   const url = `http://localhost:5000/rollabill-5503a/us-central1/app/api/${entity}/${type}`;
      firebase.auth().currentUser.getIdToken()
      .then(authToken => {
        const headers = new Headers({'Authorization': 'Bearer ' + authToken });
        return this.http.get(url, { headers: headers }).toPromise()
      })
      .then(res => this.loading = false)
    }

    selectClientSystem(systemId, userId){
      this.afs.upsert(`users/${userId}`, {selected_client_system: this.afs.doc(`client_systems/${systemId}`).ref})
    }
}
