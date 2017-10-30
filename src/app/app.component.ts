import { Component, OnInit } from '@angular/core';
import {Location, LocationStrategy, PathLocationStrategy} from '@angular/common';
import { MessagingService } from './core/messaging.service';

declare const $: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  message;

  constructor(public location: Location, private msgService: MessagingService) {}

  ngOnInit() {
      $.material.options.autofill = true;
      $.material.init()
      this.msgService.getPermission()
      this.msgService.receiveMessage()
      this.message = this.msgService.currentMessage
  }
  
    isMaps(path){
      var titlee = this.location.prepareExternalUrl(this.location.path());
      titlee = titlee.slice( 1 );
      if(path == titlee){
        return false;
      }
      else {
        return true;
      }
    }
}
