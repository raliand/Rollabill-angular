import { Component, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { AuthService } from '../core/auth.service';
import { Router } from '@angular/router';
import { FirestoreService} from '../core/firestore.service';
import { Observable } from 'rxjs/Observable';
import * as firebase from 'firebase/app';
import { Http, Headers } from '@angular/http';
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/reduce';

import * as Chartist from 'chartist';

declare const $: any;

export interface Invoice {
  AnountDue: number;
  AmountPaid: number;
  Contact?: {
    Name: string;
    ContactID: string;
    EmailAddress?: string;    
  };
  Date?: string;
  DueDate?: string;
  InvoiceID?: string;
  InvoiceNumber: string;
  Status?: string;
  Type?: string;
}

export interface Contact {
  Name: string;
  ContactID: string;
  EmailAddress?: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})

export class DashboardComponent implements OnInit {
  invoicesPayable: Observable<any[]>;
  invoicesReceivable: Observable<any[]>;
  contacts: Observable<any[]>;
  public loading = false;
  
  constructor(public auth: AuthService,
              public http: Http, 
              private afs: FirestoreService,
              private router: Router) {    
  }
  
  // startAnimationForLineChart(chart){
  //     let seq: any, delays: any, durations: any;
  //     seq = 0;
  //     delays = 80;
  //     durations = 500;

  //     chart.on('draw', function(data) {
  //       if(data.type === 'line' || data.type === 'area') {
  //         data.element.animate({
  //           d: {
  //             begin: 600,
  //             dur: 700,
  //             from: data.path.clone().scale(1, 0).translate(0, data.chartRect.height()).stringify(),
  //             to: data.path.clone().stringify(),
  //             easing: Chartist.Svg.Easing.easeOutQuint
  //           }
  //         });
  //       } else if(data.type === 'point') {
  //             seq++;
  //             data.element.animate({
  //               opacity: {
  //                 begin: seq * delays,
  //                 dur: durations,
  //                 from: 0,
  //                 to: 1,
  //                 easing: 'ease'
  //               }
  //             });
  //         }
  //     });

  //     seq = 0;
  // };
  
  // startAnimationForBarChart(chart){
  //     let seq2: any, delays2: any, durations2: any;

  //     seq2 = 0;
  //     delays2 = 80;
  //     durations2 = 500;
  //     chart.on('draw', function(data) {
  //       if(data.type === 'bar'){
  //           seq2++;
  //           data.element.animate({
  //             opacity: {
  //               begin: seq2 * delays2,
  //               dur: durations2,
  //               from: 0,
  //               to: 1,
  //               easing: 'ease'
  //             }
  //           });
  //       }
  //     });

  //     seq2 = 0;
  // };

  ngOnInit() {
    
    this.auth.clientSystem.take(1).subscribe(cs =>{
      var time = new Date().getTime() - new Date(cs.createdAt).getTime();
      console.log(time/1000)
      if(time/1000 < 60){
          this.getEntity('company', cs.type)
          this.getEntity('contacts', cs.type)
          this.getEntity('items', cs.type)
          this.getEntity('invoices', cs.type)
      }
    })
    this.auth.clientSystem.subscribe(clientSystem => {      
      if(clientSystem.type == 'xero'){
        this.invoicesPayable = this.afs.colWithIds$<any>(`client_systems/${clientSystem._id}/invoices`, ref => ref.where('Status', '==', 'AUTHORISED').where('Type', '==', 'ACCPAY'))
        this.invoicesReceivable = this.afs.colWithIds$<any>(`client_systems/${clientSystem._id}/invoices`, ref => ref.where('Status', '==', 'AUTHORISED').where('Type', '==', 'ACCREC'))
        this.contacts = this.afs.colWithIds$<any>(`client_systems/${clientSystem._id}/contacts`, ref => ref.where('ContactStatus', '==', 'ACTIVE'))
      }
      if(clientSystem.type == 'sageone'){
        console.log(clientSystem._id)
        this.invoicesPayable = this.afs.colWithIds$<any>(`client_systems/${clientSystem._id}/purchase_invoices`)
          .map(res => {return res
            .map(item => {
              //console.log(item)
              return {
                AmountPaid: item.total_paid,
                AmountDue: item.outstanding_amount,
                InvoiceNumber : item.displayed_as,
                ...item
              }
            })
          })
        this.invoicesReceivable = this.afs.colWithIds$<Invoice>(`client_systems/${clientSystem._id}/sales_invoices`)
          .map(res => {return res
            .map(item => {
              //console.log(item)
              return {
                AmountPaid: item.total_paid,
                AmountDue: item.outstanding_amount,
                InvoiceNumber : item.displayed_as,
                ...item
              }
            })
          })
        this.contacts = this.afs.colWithIds$<Contact>(`client_systems/${clientSystem._id}/contacts`)
          .map(res => {return res
            .map(item => {
              //console.log(item)
              return {
                Name : item.displayed_as,
                ContactID : item.id,
                ...item
              }
            })
          })
      }
    })


    /*
    {
      'field': string

    }
    {{ (aggregatedStats$ | async)?['field'] }} 
    */
      /* ----------==========     Daily Sales Chart initialization For Documentation    ==========---------- */

  //     const dataDailySalesChart: any = {
  //         labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  //         series: [
  //             [12, 17, 7, 17, 23, 18, 38]
  //         ]
  //     };

  //    const optionsDailySalesChart: any = {
  //         lineSmooth: Chartist.Interpolation.cardinal({
  //             tension: 0
  //         }),
  //         low: 0,
  //         high: 50, // creative tim: we recommend you to set the high sa the biggest value + something for a better look
  //         chartPadding: { top: 0, right: 0, bottom: 0, left: 0},
  //     }

  //     var dailySalesChart = new Chartist.Line('#dailySalesChart', dataDailySalesChart, optionsDailySalesChart);

  //     this.startAnimationForLineChart(dailySalesChart);


  //     /* ----------==========     Completed Tasks Chart initialization    ==========---------- */

  //     const dataCompletedTasksChart: any = {
  //         labels: ['12am', '3pm', '6pm', '9pm', '12pm', '3am', '6am', '9am'],
  //         series: [
  //             [230, 750, 450, 300, 280, 240, 200, 190]
  //         ]
  //     };

  //    const optionsCompletedTasksChart: any = {
  //         lineSmooth: Chartist.Interpolation.cardinal({
  //             tension: 0
  //         }),
  //         low: 0,
  //         high: 1000, // creative tim: we recommend you to set the high sa the biggest value + something for a better look
  //         chartPadding: { top: 0, right: 0, bottom: 0, left: 0}
  //     }

  //     var completedTasksChart = new Chartist.Line('#completedTasksChart', dataCompletedTasksChart, optionsCompletedTasksChart);

  //     // start animation for the Completed Tasks Chart - Line Chart
  //     this.startAnimationForLineChart(completedTasksChart);



  //     /* ----------==========     Emails Subscription Chart initialization    ==========---------- */

  //     var dataEmailsSubscriptionChart = {
  //       labels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  //       series: [
  //         [542, 443, 320, 780, 553, 453, 326, 434, 568, 610, 756, 895]

  //       ]
  //     };
  //     var optionsEmailsSubscriptionChart = {
  //         axisX: {
  //             showGrid: false
  //         },
  //         low: 0,
  //         high: 1000,
  //         chartPadding: { top: 0, right: 5, bottom: 0, left: 0}
  //     };
  //     var responsiveOptions: any[] = [
  //       ['screen and (max-width: 640px)', {
  //         seriesBarDistance: 5,
  //         axisX: {
  //           labelInterpolationFnc: function (value) {
  //             return value[0];
  //           }
  //         }
  //       }]
  //     ];
  //     var emailsSubscriptionChart = new Chartist.Bar('#emailsSubscriptionChart', dataEmailsSubscriptionChart, optionsEmailsSubscriptionChart, responsiveOptions);

  //     //start animation for the Emails Subscription Chart
  //     this.startAnimationForBarChart(emailsSubscriptionChart);
  }
  
    getEntity(entity, type){
      this.loading = true;
      const url = `https://us-central1-rollabill-5503a.cloudfunctions.net/app/api/${entity}/${type}`;
      // const url = `http://localhost:5000/rollabill-5503a/us-central1/app/api/${entity}/${type}`;
      firebase.auth().currentUser.getIdToken()
      .then(authToken => {
        const headers = new Headers({'Authorization': 'Bearer ' + authToken });
        return this.http.get(url, { headers: headers }).toPromise()
      })
      .then(res => this.loading = false)
    }

}
