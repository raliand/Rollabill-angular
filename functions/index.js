'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
const express = require('express');
const cors = require('cors')({
  origin: true, 
  credentials: true, 
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "X-Access-Token", "Authorization"], 
  exposedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "X-Access-Token", "Authorization"]
});
const xero = require('xero-node');
const app = express();

app.use(cors);

const firestore = admin.firestore();

var xeroClient;

const authenticate = (req, res, next) => {
  cors(req, res, () => {
    console.log(req.headers);
    if(req.url.startsWith('/access')) {
      console.log('Skipping auth token')
      next();
    }
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      console.log('No Header or No Bearer');
      res.status(403).send('Unauthorized: No Bearer');
      return;
    }
    //const idToken = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImIxYzk0N2ExZWIwN2M4ZjRkMTJhZDUwMWMwNjEwZWY0YzQ1NDExNmYifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcm9sbGFiaWxsLTU1MDNhIiwibmFtZSI6IkFuZHJleSBUY2hpb3JuaXkiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDQuZ29vZ2xldXNlcmNvbnRlbnQuY29tLy1MT3FoYlFSSDdFTS9BQUFBQUFBQUFBSS9BQUFBQUFBQUFBQS9CbEptVnFiNkhSVS9waG90by5qcGciLCJhdWQiOiJyb2xsYWJpbGwtNTUwM2EiLCJhdXRoX3RpbWUiOjE1MDkyODkwNzQsInVzZXJfaWQiOiJ0Nkw4OHJXQ0FGZGhrMjRUS1pwTmlpY0x0OVMyIiwic3ViIjoidDZMODhyV0NBRmRoazI0VEtacE5paWNMdDlTMiIsImlhdCI6MTUwOTI5NjI3NywiZXhwIjoxNTA5Mjk5ODc3LCJlbWFpbCI6InJhbGlhbmQxQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7Imdvb2dsZS5jb20iOlsiMTA2OTE5NTgxOTEyMTU3OTUyNTQ4Il0sImVtYWlsIjpbInJhbGlhbmQxQGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6Imdvb2dsZS5jb20ifX0.kPRCC75DdFj0OEhSUaupVliy4RehZq-EgMzAXJlD8wJOSeZtx7wTSMpKblgssGvjC1YmrHLW4UZNYv3duOhaKyKXWzU0dDbI55TgAmMTHv8i6sTYln-FRS9AUdiI2lOyvIMvP4x0577n46dfeVTL_cVaz7RdHliO97BOv8dzYghrxD_8jLs9pjOxjGWstPgyzVgXWUyUjGRz6uTlcizrC5Ww0ofdHZfCJc_Mj6WLjOrgT5SW0TC_qke1yE6waNjH7whDGMKWTmpDJBhYCeSo2XLlhQAxyoBYJorcFmgKVBDYG6KC9ZeKrI4BNxsVNfPwOn0ALVv5UvX2sf6fXrsfeQ";
    const idToken = req.headers.authorization.split('Bearer ')[1];

    admin.auth().verifyIdToken(idToken).then(decodedIdToken => {
      req.user = decodedIdToken.uid;
      next();
    }).catch(error => {
      console.log('Bad token');
      res.status(403).send('Unauthorized: Bad token');
      return;
    });
  });  
};

app.use(authenticate);

function getXeroClientFromDB(userId,clientSystemId, callback) {

  var config =  {
    authorizeCallbackUrl: `https://us-central1-rollabill-5503a.cloudfunctions.net/app/access/${userId}/${clientSystemId}`,
    consumerKey: "8UHPCUQ9M50CCKPI6MJDKLPKXS0Y5A",
    consumerSecret: "W1UDMHQNLL5TOHTQ7WXK5GIO4HDFLU",
    userAgent: "Tester (PUBLIC) - Application for testing Xero"
  }

  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  var getDoc = csRef.get()
  .then(doc => {
      if (!doc.exists) {
        console.log('No such document!');
        sendNotification(userId,'Client system does not exist')
        xeroClient = new xero.PublicApplication(config);
        callback(xeroClient);
      } else {
        const clientSystem = doc.data();
        config.accessToken = clientSystem.oauth_token;
        config.accessSecret = clientSystem.oauth_token_secret;
        xeroClient = new xero.PublicApplication(config);
        callback(xeroClient);
      }
  })
  .catch(err => {
    console.log('Error getting document', err);
    sendNotification(userId,'Error getting document')
    xeroClient = new xero.PublicApplication(config);
    callback(xeroClient);
  });  
}

function authorizeRedirectDB(res, userid, clientSystemId) {
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userid,clientSystemId, xeroClient => {    
    xeroClient.getRequestToken(function(err, token, secret) {
      if (!err) {
        var data = {
          oauth_token: token,
          oauth_token_secret: secret
        };
        var setWithOptions = csRef.set(data, { merge: true });
  
        var AccountingScope = '';
  
        var authoriseUrl = xeroClient.buildAuthorizeUrl(token, {
            scope: AccountingScope
        });
        console.log(authoriseUrl);      
        res.status(200).send(authoriseUrl);
        return;
      } else {
        res.status(403).send('');
        return;
      }
    })
  });  
}

function sendNotification(userId,message){
  var userRef = firestore.collection('users').doc(userId);
  const payload = {
    notification: {
      body: message
    }
  };

  var getDoc = userRef.get()
      .then(doc => {
          if (!doc.exists) {
              console.log('No such User!');
          } else {
            admin.messaging().sendToDevice(doc.data().fcmToken, payload)
          }
      })
      .catch(err => {
          console.log('Error getting document', err);
      });  
}

function saveXeroAuth(csRef, req, callback){
  var getDoc = csRef.get()
  .then(doc => {
      if (!doc.exists) {
          console.log('No such document!');
          callback(false);
      } else {
          const clientSystem = doc.data();
          if (req.query.oauth_verifier && req.query.oauth_token == clientSystem.oauth_token) {
            console.log('access...');
            xeroClient.setAccessToken(clientSystem.oauth_token, clientSystem.oauth_token_secret, req.query.oauth_verifier)
                .then(token => {
                  console.log(token.results);
                  var data = {
                    oauth_token: token.results.oauth_token,
                    oauth_token_secret: token.results.oauth_token_secret
                  };
                  csRef.set(data, { merge: true });
                  callback(true);                 
                })
                .catch(err => {
                  console.log('I hope this doesnt happen...')
                  console.log(err)
                  callback(false);
                })
          };            
      }
  })
  .catch(err => {
    console.log('Error getting document', err);
    //sendNotification(userId,'Error getting document')
    callback(false);
  });
}

app.get('/access/:userId/:clientSystemId', (req, res) => {
  const userId = req.params.userId;
  const clientSystemId = req.params.clientSystemId;
  //var xeroClient = getXeroClient(req.session);
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  saveXeroAuth(csRef, req, success =>{
    if(success){
      getXeroOrganizations(userId, clientSystemId)
    } else {
      sendNotification(userId,'Error authorizing Xero')
    }
  })
  res.redirect('https://rollabill-5503a.firebaseapp.com/dashboard')
});

app.get('/authorise', (req, res) => {
    const userId = req.user;
    var userRef = firestore.collection('users').doc(userId);
    var getDoc = userRef.get()
      .then(doc => {
        if (!doc.exists) {
          console.log('No such user!');
          res.status(403).send('No such user!');
          return;
        } else {
          const userDoc = doc.data();
          //res.status(200).send('URL.....');
          authorizeRedirectDB(res, userId,userDoc.selected_client_system.id);
        }
      })
      .catch(err => {
        console.log('Error getting user document', err);
        //sendNotification(userId,'Error getting user document')
        res.status(403).send('Error getting user document');
        return;
      });
});

function getXeroOrganizations(userId, clientSystemId){
  console.log(`userId: ${userId}, clientSystemId: ${clientSystemId}`);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
    xeroClient.core.organisations.getOrganisations()
    .then(function(organisations) {
      console.log(organisations);
      sendNotification(userId,'Organisation Updated')
      organisations.forEach(function(item) {
        console.log(item);
      });
      //TODO Persist Organizations
      // var csRef = firestore.collection('client_systems').doc(clientSystemId);
      // var data = {
      //   oauth_token: token,
      //   oauth_token_secret: secret
      // };
      // var setWithOptions = csRef.set(data, { merge: true });
    })
    .catch(function(err) {
      sendNotification(userId,'Error updating - please login to Xero')
      //TODO set client system status to disconnected
      // var csRef = firestore.collection('client_systems').doc(clientSystemId);
      // var data = {
      //   oauth_token: token,
      //   oauth_token_secret: secret
      // };
      // var setWithOptions = csRef.set(data, { merge: true });
    })
  })
}

exports.app = functions.https.onRequest(app);

exports.countNameChanges = functions.firestore
.document('client_systems/{clientSystemId}')
.onUpdate((event) => {

  console.log('countNameChanges function fired....')
  const data = event.data.data();
  const previousData = event.data.previous.data();

  if (data.status == previousData.status) return;

  //var status = getXeroOrganizations(clientSystemId);
  

  return event.data.ref.set({
    status: currStatus
  }, {merge: true});
});

exports.userLogin = functions.firestore
.document('users/{userId}')
.onUpdate((event) => {
  const data = event.data.data();
  const previousData = event.data.previous.data();
  console.log('get organizations');
  getXeroOrganizations(data.uid, data.selected_client_system.id)

  // var csRef = firestore.doc(data.selected_client_system);
  // var getDoc = cityRef.get()
  //     .then(doc => {
  //         if (!doc.exists) {
  //             console.log('No such document!');
  //         } else {
  //           sendNotification(data.uid,'getXeroOrganizations')
  //           getXeroOrganizations(data.uid, doc.id())
  //         }
  //     })
  //     .catch(err => {
  //         console.log('Error getting document', err);
  //     });

  if (data.fcmToken == previousData.fcmToken) return;
});