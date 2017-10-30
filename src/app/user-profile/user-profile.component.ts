import { Component, OnInit } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { HttpService } from '../core/http.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit {

  constructor(public auth: AuthService, public http: HttpService) { }

  ngOnInit() {
  }

  authoriseXero(){
    this.http.get('https://us-central1-rollabill-5503a.cloudfunctions.net/app/authorise').subscribe(result => {
      window.location.href = result.text();
    });
  }

  authoriseXeroLocal(){
    this.http.get('http://localhost:5000/rollabill-5503a/us-central1/app/authorise').subscribe(result => {
      window.location.href = result.text();
    });
  }

}
