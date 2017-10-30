import { Injectable }          from '@angular/core';
import { FirestoreService} from './firestore.service';
import { AngularFireAuth }     from 'angularfire2/auth';
import * as firebase from 'firebase';
import 'rxjs/add/operator/take';
import { BehaviorSubject } from 'rxjs/BehaviorSubject'

declare const $: any;

@Injectable()
export class MessagingService {
  messaging = firebase.messaging()
  currentMessage = new BehaviorSubject(null)
  constructor(private db: FirestoreService, private afAuth: AngularFireAuth) { }
  
  updateToken(token) {
    this.afAuth.authState.take(1).subscribe(user => {
      if (!user) return;
      const data = { fcmToken: token }
      this.db.upsert(`users/${user.uid}`,data)
    })
  }
  
  getPermission() {
      this.messaging.requestPermission()
      .then(() => {
        console.log('Notification permission granted.');
        return this.messaging.getToken()
      })
      .then(token => {
        console.log(token)
        this.updateToken(token)
      })
      .catch((err) => {
        console.log('Unable to get permission to notify.', err);
      });
    }

    receiveMessage() {
       this.messaging.onMessage((payload) => {
        console.log("Message received. ", payload);
        this.currentMessage.next(payload)
        this.showNotification(payload);
      });
    }

    showNotification(message){
      console.log("Showing Notification. ");
      const type = ['','info','success','warning','danger'];  
      const color = Math.floor((Math.random() * 4) + 1);
  
      $.notify({
          icon: message.notification.icon,
          title: message.notification.title,
          message: message.notification.body            
      },{
          type: type[color],
          timer: 4000,
          placement: {
              from: 'top',
              align: 'right'
          }
      });
    }
}