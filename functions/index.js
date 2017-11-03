'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
const express = require('express');
const cors = require('cors')({
  origin: true, 
  credentials: true
});
const xero = require('xero-node');
const app = express();

app.use(cors);

const firestore = admin.firestore();

const authenticate = (req, res, next) => {
  cors(req, res, () => {
    //console.log(req.headers);
    if(req.url.startsWith('/access')) {
      console.log('Skipping auth token')
      next();
      return;
    }
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      console.log('No Header or No Bearer');
      res.status(403).send('Unauthorized: No Bearer');
      return;
    }
    //const idToken = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImIxYzk0N2ExZWIwN2M4ZjRkMTJhZDUwMWMwNjEwZWY0YzQ1NDExNmYifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcm9sbGFiaWxsLTU1MDNhIiwibmFtZSI6IkFuZHJleSBUY2hpb3JuaXkiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDQuZ29vZ2xldXNlcmNvbnRlbnQuY29tLy1MT3FoYlFSSDdFTS9BQUFBQUFBQUFBSS9BQUFBQUFBQUFBQS9CbEptVnFiNkhSVS9waG90by5qcGciLCJhdWQiOiJyb2xsYWJpbGwtNTUwM2EiLCJhdXRoX3RpbWUiOjE1MDkyODkwNzQsInVzZXJfaWQiOiJ0Nkw4OHJXQ0FGZGhrMjRUS1pwTmlpY0x0OVMyIiwic3ViIjoidDZMODhyV0NBRmRoazI0VEtacE5paWNMdDlTMiIsImlhdCI6MTUwOTI5NjI3NywiZXhwIjoxNTA5Mjk5ODc3LCJlbWFpbCI6InJhbGlhbmQxQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7Imdvb2dsZS5jb20iOlsiMTA2OTE5NTgxOTEyMTU3OTUyNTQ4Il0sImVtYWlsIjpbInJhbGlhbmQxQGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6Imdvb2dsZS5jb20ifX0.kPRCC75DdFj0OEhSUaupVliy4RehZq-EgMzAXJlD8wJOSeZtx7wTSMpKblgssGvjC1YmrHLW4UZNYv3duOhaKyKXWzU0dDbI55TgAmMTHv8i6sTYln-FRS9AUdiI2lOyvIMvP4x0577n46dfeVTL_cVaz7RdHliO97BOv8dzYghrxD_8jLs9pjOxjGWstPgyzVgXWUyUjGRz6uTlcizrC5Ww0ofdHZfCJc_Mj6WLjOrgT5SW0TC_qke1yE6waNjH7whDGMKWTmpDJBhYCeSo2XLlhQAxyoBYJorcFmgKVBDYG6KC9ZeKrI4BNxsVNfPwOn0ALVv5UvX2sf6fXrsfeQ";
    const idToken = req.headers.authorization.split('Bearer ')[1];

    admin.auth().verifyIdToken(idToken).then(decodedIdToken => {
      req.user = decodedIdToken;
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
        callback(new xero.PublicApplication(config));
      } else {
        const clientSystem = doc.data();
        config.accessToken = clientSystem.oauth_token;
        config.accessSecret = clientSystem.oauth_token_secret;
        callback(new xero.PublicApplication(config));
      }
  })
  .catch(err => {
    console.log('Error getting document', err);
    sendNotification(userId,'Error getting document')
    callback(new xero.PublicApplication(config));
  });  
}

function authorizeRedirectDB(res, userid, clientSystemId) {
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userid,clientSystemId, xeroClient => {    
    xeroClient.getRequestToken(function(err, token, secret) {
      if (!err) {
        var data = {
          oauth_token: token,
          oauth_token_secret: secret,
          status: 'connecting'
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

function saveXeroAuth(userId, clientSystemId, req, callback){
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
    var getDoc = csRef.get()
    .then(doc => {
        if (!doc.exists) {
            console.log('No such document!');
            callback(false);
        } else {
            const clientSystem = doc.data();
            if (req.query.oauth_verifier && req.query.oauth_token == clientSystem.oauth_token) {
              xeroClient.setAccessToken(clientSystem.oauth_token, clientSystem.oauth_token_secret, req.query.oauth_verifier)
                  .then(token => {
                    var data = {
                      oauth_token: token.results.oauth_token,
                      oauth_token_secret: token.results.oauth_token_secret,
                      status: 'connected'
                    };
                    csRef.set(data, { merge: true })
                      .then(result => {
                        callback(true);
                      }).catch(err => {
                        callback(false)
                      });                                     
                  })
                  .catch(err => {
                    console.log('I hope this doesnt happen...'. err)
                    callback(false);
                  })
            };            
        }
    })
    .catch(err => {
      console.log('Error getting document', err);
      callback(false);
    });
  });  
}

app.get('/access/:userId/:clientSystemId', (req, res) => {
  const userId = req.params.userId;
  const clientSystemId = req.params.clientSystemId;  
  saveXeroAuth(userId, clientSystemId, req, success =>{
    if(success){
      sendNotification(userId,'Xero Authorized')
      //getXeroOrganizations(userId, clientSystemId)
    } else {
      sendNotification(userId,'Error authorizing Xero')
    }
  })
  res.redirect('https://rollabill-5503a.firebaseapp.com/dashboard')
});

app.get('/authorise', (req, res) => {
  const userId = req.user.uid;
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

app.get('/xero_contacts', (req, res) => {
  const userId = req.user.uid;
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
        getXeroContacts(userId,userDoc.selected_client_system.id, success => {
          if(success) {
            res.status(200).send('Got Contacts!');
          } else {
            es.status(403).send('Error getting contacts');
          }
        });
      }
    })
    .catch(err => {
      console.log('Error getting user document', err);
      //sendNotification(userId,'Error getting user document')
      res.status(403).send('Error getting user document');
      return;
    });
});

app.get('/xero_invoices', (req, res) => {
  const userId = req.user.uid;
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
        getXeroInvoices(userId,userDoc.selected_client_system.id, success => {
          if(success) {
            res.status(200).send('Got Invoices!');
          } else {
            es.status(403).send('Error getting contacts');
          }
        });
      }
    })
    .catch(err => {
      console.log('Error getting user document', err);
      //sendNotification(userId,'Error getting user document')
      res.status(403).send('Error getting user document');
      return;
    });
});

app.get('/xero_items', (req, res) => {
  const userId = req.user.uid;
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
        getXeroItems(userId,userDoc.selected_client_system.id, success => {
          if(success) {
            res.status(200).send('Got Items!');
          } else {
            es.status(403).send('Error getting items');
          }
        });
      }
    })
    .catch(err => {
      console.log('Error getting user document', err);
      //sendNotification(userId,'Error getting user document')
      res.status(403).send('Error getting user document');
      return;
    });
});

function getXeroOrganizations(userId, clientSystemId, callback){
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
    xeroClient.core.organisations.getOrganisations()
    .then(function(organisations) {
      //console.log(organisations);
      organisations.forEach(function(organization) {
        var tmpOrg = organization._obj;
        
        var count = 0
        organization.Addresses.forEach(function(address) {
          tmpOrg[`Address${count++}`] = address._obj;
        })
        count = 0
        organization.Phones.forEach(function(phone) {
          tmpOrg[`Phone${count++}`] = phone._obj;
        })
        delete tmpOrg.Addresses;
        delete tmpOrg.Phones;
        delete tmpOrg.ExternalLinks;
        delete tmpOrg.PaymentTerms;        
        console.log(tmpOrg);
        var setWithOptions = csRef.set(tmpOrg, { merge: true });
        sendNotification(userId,'Organisation Updated')
        callback(true);
      });
    })
    .catch(function(err) {
      console.log(err)
      sendNotification(userId,'Error updating - please login to Xero');
      callback(false);
    })
  })
}

function getXeroContacts(userId, clientSystemId, callback){
  //var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
    xeroClient.core.contacts.getContacts()
    .then(function(contacts) {
      //console.log(organisations);
      contacts.forEach(function(contact) {
        console.log(contact.toJSON())
        var tmpOrg = contact.toJSON();
        
        var count = 0
        contact.Addresses.forEach(function(address) {
          tmpOrg[`Address${count++}`] = address._obj;
        })
        count = 0
        contact.Phones.forEach(function(phone) {
          tmpOrg[`Phone${count++}`] = phone._obj;
        })

        delete tmpOrg.Addresses;
        delete tmpOrg.Phones;
        delete tmpOrg.Balances;
        delete tmpOrg.PaymentTerms;
        delete tmpOrg.SalesTrackingCategories;
        delete tmpOrg.PurchasesTrackingCategories;
        
        console.log(tmpOrg);
        var csRef = firestore.collection('client_systems').doc(clientSystemId).collection('contacts').doc(tmpOrg.ContactID);
        var setWithOptions = csRef.set(tmpOrg, { merge: true })          
      });
      sendNotification(userId,'Contacts Updated')
      callback(true);
    })
    .catch(function(err) {
      console.log(err)
      sendNotification(userId,'Error updating - please login to Xero');
      callback(false);
    })
  })
}

function getXeroItems(userId, clientSystemId, callback){
  //var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
    xeroClient.core.items.getItems()
    .then(function(items) {
      //console.log(organisations);
      items.forEach(function(item) {
        //console.log(item.toJSON())
        var tmpOrg = item.toJSON();
        
        var csRef = firestore.collection('client_systems').doc(clientSystemId).collection('items').doc(tmpOrg.ItemID);
        var setWithOptions = csRef.set(tmpOrg, { merge: true })          
      });
      sendNotification(userId,'Items Updated')
      callback(true);
    })
    .catch(function(err) {
      console.log(err)
      sendNotification(userId,'Error updating - please login to Xero');
      callback(false);
    })
  })
}

function getXeroFullInvoice(userId, clientSystemId, xeroClient, invoiceId, callback){
  xeroClient.core.invoices.getInvoice(invoiceId)
  .then(function(full_invoice) {
    //console.log(full_invoice.toJSON())
    var tmpOrg = full_invoice.toJSON()
    var lineItems = full_invoice.LineItems
    var payments = full_invoice.Payments
    delete tmpOrg.LineItems
    delete tmpOrg.Payments
    delete tmpOrg.Contact.Addresses
    delete tmpOrg.Contact.Phones
    var csRef = firestore.collection('client_systems').doc(clientSystemId).collection('invoices').doc(invoiceId);
    var setWithOptions = csRef.set(tmpOrg, { merge: true }).then(invId => {
      deleteCollection(`client_systems/${clientSystemId}/invoices/${invoiceId}/line_items`).then(res =>{
        lineItems.forEach(function(lineItem){
          //console.log(lineItem.toJSON())
          var tmpOrgL = lineItem.toJSON()
          delete tmpOrgL.Tracking
          var cslRef = firestore.collection('client_systems')
                                .doc(clientSystemId)
                                .collection('invoices')
                                .doc(invoiceId).collection('line_items')
                                .add(tmpOrgL);
        })
        deleteCollection('client_systems/invoices/payments').then(res =>{
          payments.forEach(function(payment){
            //console.log(lineItem.toJSON())
            var tmpOrgP = payment.toJSON()
            var cspRef = firestore.collection('client_systems')
                                  .doc(clientSystemId)
                                  .collection('invoices')
                                  .doc(invoiceId).collection('payments')
                                  .add(tmpOrgP);
          })
          callback(true)              
        })
      })      
    })          
  })
}

function getXeroInvoices(userId, clientSystemId, callback){
  //var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
    xeroClient.core.invoices.getInvoices()
    .then(function(invoices) {
      //console.log(organisations);
      var count = 1;
      invoices.forEach(function(invoice) {
        (function(ind) {
          setTimeout(getXeroFullInvoice, 1100 * ind, userId, clientSystemId, xeroClient, invoice.InvoiceID, success => {console.log('Invoice Added')})
        })(count++);        
      })
      //sendNotification(userId,'Invoices Updated')
      callback(true);
    })
    .catch(function(err) {
      console.log(err)
      sendNotification(userId,'Error updating - please login to Xero');
      callback(false);
    })
  })
}

function deleteCollection(collectionPath) {
  var collectionRef = firestore.collection(collectionPath);
  var query = collectionRef.orderBy('__name__');

  return new Promise((resolve, reject) => {
      deleteQueryBatch(query, resolve, reject);
  });
}

function deleteQueryBatch(query, resolve, reject) {
  query.get()
      .then((snapshot) => {
          // When there are no documents left, we are done
          if (snapshot.size == 0) {
              return 0;
          }

          // Delete documents in a batch
          var batch = firestore.batch();
          snapshot.docs.forEach((doc) => {
              batch.delete(doc.ref);
          });

          return batch.commit().then(() => {
              return snapshot.size;
          });
      }).then((numDeleted) => {
          if (numDeleted === 0) {
              resolve();
              return;
          }

          // Recurse on the next process tick, to avoid
          // exploding the stack.
          process.nextTick(() => {
              deleteQueryBatch(query, resolve, reject);
          });
      })
      .catch(reject);
}

exports.app = functions.https.onRequest(app);

exports.userLogin = functions.firestore
.document('users/{userId}')
.onUpdate((event) => {
  const data = event.data.data();
  const previousData = event.data.previous.data();  
  var csRef = firestore.collection('client_systems').doc(data.selected_client_system.id);
  var getDoc = csRef.get()
  .then(doc => {
    if (!doc.exists) {
      console.log('No such client system!');  
    } else {
      const csDoc = doc.data();
      if(csDoc.status == 'connected'){
        sendNotification(data.uid,'Refreshing Xero Organizations')
        getXeroOrganizations(data.uid, data.selected_client_system.id, success => {
          if(!success){
            var setWithOptions = csRef.set({status: 'disconnected'}, { merge: true });
          } 
        })        
      }
    }
  })
  .catch(err => {
    console.log('Error getting client system document', err);
  });  
});