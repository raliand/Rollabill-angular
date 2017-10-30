import {Injectable} from '@angular/core';
import {Http, Headers} from '@angular/http';
import * as firebase from 'firebase/app';

@Injectable()
export class HttpService {

  constructor(private http: Http ) {}

  createAuthorizationHeader(headers: Headers) {
    firebase.auth().currentUser.getIdToken()
    .then(authToken => {
      console.log('Creating auth headers')
      headers.set('Content-Type', 'text/plain');
      headers.set('Authorization', 'Bearer ' + authToken);
    })     
  }

  get(url) {
    let headers = new Headers();
    this.createAuthorizationHeader(headers);
    console.log(headers)
    return this.http.get(url, {
      headers: headers
    });
  }

  post(url, data) {
    let headers = new Headers();
    this.createAuthorizationHeader(headers);
    return this.http.post(url, data, {
      headers: headers
    });
  }
}