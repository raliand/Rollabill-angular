import {Injectable} from '@angular/core';
import {Http, Headers, RequestOptions} from '@angular/http';
import * as firebase from 'firebase/app';

@Injectable()
export class HttpService {

  constructor(private http: Http ) {}

  createAuthorizationHeader(token: string) {
    firebase.auth().currentUser.getIdToken()
    .then(authToken => {
      token = authToken;
    })     
  }

  get(url) {
    let authToken = '';
    this.createAuthorizationHeader(authToken);
    let headers = new Headers({'Authorization': 'Bearer ' + authToken});
    console.log(headers)
    let options = new RequestOptions();
    options.headers = headers;
    return this.http.get(url, options);
  }

  post(url, data) {
    let headers = new Headers({'X-Requested-By':'Angular 2'});
    //this.createAuthorizationHeader(headers);
    let options = new RequestOptions();
    options.headers = headers;
    return this.http.post(url, data, options);
  }
}