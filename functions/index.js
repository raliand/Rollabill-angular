
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
const Sage = require('sageone-nodejs');
const simpleOauthModule = require('simple-oauth2');
const addSeconds = require('date-fns/add_seconds');
const app = express();

app.use(cors);

const firestore = admin.firestore();

const authenticate = (req, res, next) => {
  cors(req, res, () => {
    if (req.url.startsWith('/access')) {
      console.log('Skipping auth token')
      next();
      return;
    }
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      console.log('No Header or No Bearer');
      res.status(403).send('Unauthorized: No Bearer');
      return;
    }
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

function sendNotification(userId, message) {
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

function loop(array, callback, finish) {
  var copy = array.slice();
  (function recur() {
    var item = copy.shift();
    if (item) {
      callback(item, recur);
    } else {
      if (typeof finish == 'function') {
        finish();
      }
    }
  })();
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

function getAccessToken(clientSystemId, type, requestCode, callback) {
  const configDoc = firestore.collection('configs').doc(type).get().then(cDoc => {
    const config = cDoc.data()
    const oauth2 = simpleOauthModule.create(config.oauth2);
    var csRef = firestore.collection('client_systems').doc(clientSystemId);  
    var getDoc = csRef.get()
      .then(doc => {
        if (!doc.exists) {
          console.log('No such document!');
          callback(null);
        } else {
          const clientSystem = doc.data();
          if(clientSystem.accessToken != null){
            let accessToken = oauth2.accessToken.create(clientSystem.accessToken);
            if (accessToken.expired()) {
              console.log('Refreshing Token')
              // Callbacks
              accessToken.refresh((error, result) => {
                console.log(error)
                console.log(result)
                if ('expires_in' in result) {
                  result.expires_at = addSeconds(
                    new Date(),
                    Number.parseInt(result.expires_in, 10)
                  );
                }
                csRef.set({accessToken: result.token}, {merge: true})
                accessToken = result.token;
                callback(oauth2.accessToken.create(accessToken));
              })
            } else {
              console.log('Not Refreshing Token')
              callback(accessToken);
            }
          } else if(requestCode != null) {
            //var code = clientSystem.requestCode;
            const options = {
              code: requestCode,
              grant_type: 'authorization_code',
              redirect_uri: `${config.authorizeURL.redirect_uri}/${clientSystemId}`
              // redirect_uri: `${config.testURL.redirect_uri}/${clientSystemId}`
            };
            console.log(options);
            oauth2.authorizationCode.getToken(options, (error, result) => {
              if (error) {
                console.error('Access Token Error', error.message);
                callback(null);
              } else {
                if ('expires_in' in result) {
                  result.expires_at = addSeconds(
                    new Date(),
                    Number.parseInt(result.expires_in, 10)
                  );
                }
                console.log('The resulting token: ', result);
                csRef.set({status: 'connected', accessToken: result}, {merge: true});
                const token = oauth2.accessToken.create(result);
                callback(token);
              }
            });
          } else{
            callback(null);
          }
        }
      })
      .catch(err => {
        console.log('Error getting document', err);
        // sendNotification(userId, 'Error getting document')
        callback(null);
      });
  })
}

function getXeroClientFromDB(clientSystemId, callback) {

  var config = {
    authorizeCallbackUrl: `https://us-central1-rollabill-5503a.cloudfunctions.net/app/access/xero/${clientSystemId}`,
    consumerKey: "8UHPCUQ9M50CCKPI6MJDKLPKXS0Y5A",
    consumerSecret: "W1UDMHQNLL5TOHTQ7WXK5GIO4HDFLU",
    userAgent: "Tester (PUBLIC) - Application for testing Xero"
  }

  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  var getDoc = csRef.get()
    .then(doc => {
      if (!doc.exists) {
        console.log('No such document!');
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
      callback(new xero.PublicApplication(config));
    });
}

function authorizeRedirectDB(res, userid, clientSystemId) {
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(clientSystemId, xeroClient => {
    xeroClient.getRequestToken(function (err, token, secret) {
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

function saveXeroAuth(clientSystemId, req, callback) {
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(clientSystemId, xeroClient => {
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
                  status: 'connected',
                  xeroAuthAt: new Date()
                };
                csRef.set(data, { merge: true })
                  .then(result => {
                    callback(true);
                  }).catch(err => {
                    callback(false)
                  });
              })
              .catch(err => {
                console.log('I hope this doesnt happen...'.err)
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

function getXeroEntity(userId, clientSystemId, entity, callback) {  
  getXeroClientFromDB(clientSystemId, xeroClient => {
    if(entity == 'company'){
      xeroClient.core.organisations.getOrganisations()
        .then(function (organisations) {
          //console.log(organisations);
          organisations.forEach(function (organization) {
            var tmpOrg = organization.toJSON();
  
            var count = 0
            organization.Addresses.forEach(function (address) {
              tmpOrg[`Address${count++}`] = address.toJSON();
            })
            count = 0
            organization.Phones.forEach(function (phone) {
              tmpOrg[`Phone${count++}`] = phone.toJSON();
            })
            delete tmpOrg.Addresses;
            delete tmpOrg.Phones;
            delete tmpOrg.ExternalLinks;
            delete tmpOrg.PaymentTerms;
            //console.log(tmpOrg);
            var csRef = firestore.collection('client_systems').doc(clientSystemId);
            var setWithOptions = csRef.set(tmpOrg, { merge: true });
            //sendNotification(userId, 'Organisation Updated')
            callback(true);
          });
        })
        .catch(function (err) {
          console.log(err)
          //sendNotification(userId,'Error updating - please login to Xero');
          callback(false);
        })
    } else if(entity == 'contacts') {
      xeroClient.core.contacts.getContacts()
        .then(function (contacts) {
          //console.log(organisations);
          contacts.forEach(function (contact) {
            // console.log(contact.toJSON())
            var tmpOrg = contact.toJSON();
  
            var count = 0
            contact.Addresses.forEach(function (address) {
              tmpOrg[`Address${count++}`] = address.toJSON();
            })
            count = 0
            contact.Phones.forEach(function (phone) {
              tmpOrg[`Phone${count++}`] = phone.toJSON();
            })
  
            delete tmpOrg.Addresses;
            delete tmpOrg.Phones;
            delete tmpOrg.Balances;
            delete tmpOrg.PaymentTerms;
            delete tmpOrg.SalesTrackingCategories;
            delete tmpOrg.PurchasesTrackingCategories;
  
            // console.log(tmpOrg);
            var cscRef = firestore.collection('client_systems').doc(clientSystemId).collection('contacts').doc(tmpOrg.ContactID);
            var setWithOptions = cscRef.set(tmpOrg, { merge: true })
          });
          //sendNotification(userId, 'Contacts Updated')
          callback(true);
        })
        .catch(function (err) {
          console.log(err)
          sendNotification(userId, 'Error updating - please login to Xero');
          callback(false);
        })      
    } else if(entity == 'items') {
      xeroClient.core.items.getItems()
        .then(function (items) {
          //console.log(organisations);
          items.forEach(function (item) {
            //console.log(item.toJSON())
            var tmpOrg = item.toJSON();
  
            var csiRef = firestore.collection('client_systems').doc(clientSystemId).collection('items').doc(tmpOrg.ItemID);
            var setWithOptions = csiRef.set(tmpOrg, { merge: true })
          });
          //sendNotification(userId, 'Items Updated')
          callback(true);
        })
        .catch(function (err) {
          console.log(err)
          sendNotification(userId, 'Error updating - please login to Xero');
          callback(false);
        })
    } else if(entity == 'invoices') {
      var stats = {}
      var csRef = firestore.collection('client_systems').doc(clientSystemId);
      csRef.get().then(csDoc => {
        var csData = csDoc.data();
        var modifiedDate = new Date(csData.invoicesUpdatedAt);
        stats.AmountOwed = csData.AmountOwed
        stats.AmountOwing = csData.AmountOwing
        stats.AmountPaid = csData.AmountPaid
        stats.AmountReceived = csData.AmountReceived
        stats.NotPaidPayableInvoices = csData.NotPaidPayableInvoices
        stats.NotPaidReceivebleInvoices = csData.NotPaidReceivebleInvoices
        stats.PaidPayableInvoices = csData.PaidPayableInvoices
        stats.PaidReceivebleInvoices = csData.PaidReceivebleInvoices
        xeroClient.core.invoices.getInvoices({ modifiedAfter: modifiedDate })
          .then(invoices => {
            loop(invoices, function (full_invoice, next) {
              var jsonInv = full_invoice.toJSON()
              jsonInv.updatedAt = new Date()
              saveXeroInvoice(clientSystemId, jsonInv, stats, newStats => {
                stats = newStats
                console.log(stats)
                next();
              })
            }, function () {
              stats.invoicesUpdatedAt = new Date()
              console.log(`saving: ${stats}`)
              csRef.set(stats, { merge: true }).then(csId => {
                callback(true)
              }).catch(err => {
                console.log(err)
                sendNotification(userId, 'Error saving invoice stats to Xero');
                callback(false);
              })
            });
          })
          .catch(err => {
            console.log(err)
            sendNotification(userId, 'Error updating - please login to Xero');
            callback(false);
          })
      })
    } else {
      console.log(`Unknown Xero Entity: ${entity}`)
      callback(false)
    }
  })
}

function getSageEntity(userId, clientSystemId, entity, callback) {  
  getAccessToken(clientSystemId, 'sageone', null, accessToken => {
    const configDoc = firestore.collection('configs').doc('sageone').get().then(cDoc => {
      const config = cDoc.data()
      //const config = configSage
      const oauth = {
        requestCode: null,
        authorized: true,
        expires: accessToken.token.expires_at,
        token: accessToken.token,
        refreshToken: accessToken.token.refresh_token
      }
      var sageRef = new Sage(config.oauth2.client.id, config.oauth2.client.secret, config.signing_secret, config.authorizeURL.redirect_uri, config.subscription_key, oauth);
      // var sageRef = new Sage(config.oauth2.client.id, config.oauth2.client.secret, config.signing_secret, config.testURL.redirect_uri, config.subscription_key, oauth);
      if(entity == 'company'){
        sageRef.setBaseUrl('https://api.columbus.sage.com/uki/sageone/core/v3/')
        sageRef.query('GET', 'business', {}, function (err, data) {
          console.log(err)
          if (err) {
              console.error(err.statusCode, err.message);
              callback(true)
          } else {
              console.log("Success");
              console.log("Data:", data);
              var csRef = firestore.collection('client_systems').doc(clientSystemId);
              var setWithOptions = csRef.set(data, { merge: true });
              callback(true)
              // return res.send(data["$resources"]);
          }
        });
      } else if(entity == 'contacts') { 
        sageRef.setBaseUrl('https://api.columbus.sage.com/uki/sageone/accounts/v3/')
        sageRef.query('GET', 'contacts', {}, function (err, data) {
          if (err) {
              console.error(err.statusCode, err.message);
              callback(true)
          } else {
              data.$items.forEach(contact => {
                sageRef.query('GET', `contacts/${contact.id}`, {}, function (cerr, cdata) {
                  if (cerr) {
                      console.error(cerr.statusCode, cerr.message);
                      callback(true)
                  } else {
                    var csiRef = firestore.collection('client_systems').doc(clientSystemId).collection('contacts').doc(contact.id);
                    var setWithOptions = csiRef.set(cdata, { merge: true })
                  }
                });
              })
              sageRef.query('GET', 'contact_persons', {}, function (cperr, cpdata) {
                if (cperr) {
                    console.error(cperr.statusCode, cperr.message);
                    callback(true)
                } else {
                    cpdata.$items.forEach(contact_person => {
                      sageRef.query('GET', `contact_persons/${contact_person.id}`, {}, function (cpperr, cppdata) {
                        if (cpperr) {
                            console.error(cpperr.statusCode, cpperr.message);
                            callback(true)
                        } else {
                          var cscppRef = firestore.collection('client_systems').doc(clientSystemId).collection('contact_persons').doc(contact_person.id);
                          var setWithOption = cscppRef.set(cppdata, { merge: true })
                        }
                      });
                    })
                    callback(true)
                }
              }); 
          }
        }); 
      } else if(entity == 'items') {
        sageRef.setBaseUrl('https://api.columbus.sage.com/uki/sageone/accounts/v3/')
        sageRef.query('GET', 'stock_items', {}, function (err, data) {
          if (err) {
              console.error(err.statusCode, err.message);
              callback(true)
          } else {
              data.$items.forEach(stock_item => {
                sageRef.query('GET', `stock_items/${stock_item.id}`, {}, function (sierr, sidata) {
                  if (sierr) {
                      console.error(sierr.statusCode, sierr.message);
                      callback(true)
                  } else {
                    var csiRef = firestore.collection('client_systems').doc(clientSystemId).collection('items').doc(stock_item.id);
                    var setWithOptions = csiRef.set(sidata, { merge: true })
                  }
                });
              })
              callback(true)
          }
        }); 
      } else if(entity == 'invoices') {
        sageRef.setBaseUrl('https://api.columbus.sage.com/uki/sageone/accounts/v3/')
        sageRef.query('GET', 'purchase_invoices', {}, function (err, data) {
          if (err) {
              console.error(err.statusCode, err.message);
              callback(true)
          } else {
              data.$items.forEach(purchase_invoice => {
                sageRef.query('GET', `purchase_invoices/${purchase_invoice.id}`, {}, function (pierr, pidata) {
                  if (pierr) {
                      console.error(pierr.statusCode, pierr.message);
                      callback(true)
                  } else {
                    var csiRef = firestore.collection('client_systems').doc(clientSystemId).collection('purchase_invoices').doc(purchase_invoice.id);
                    var setWithOptions = csiRef.set(pidata, { merge: true })
                  }
                });
              })
              sageRef.query('GET', 'sales_invoices', {}, function (err, data) {
                if (err) {
                    console.error(err.statusCode, err.message);
                    callback(true)
                } else {
                    data.$items.forEach(sales_invoice => {
                      sageRef.query('GET', `sales_invoices/${sales_invoice.id}`, {}, function (sierr, sidata) {
                        if (sierr) {
                            console.error(sierr.statusCode, sierr.message);
                            callback(true)
                        } else {
                          var cspiRef = firestore.collection('client_systems').doc(clientSystemId).collection('sales_invoices').doc(sales_invoice.id);
                          var setWithOptions = cspiRef.set(sidata, { merge: true })
                        }
                      });
                    })
                    callback(true)
                }
              });
          }
        }); 
      } else {
        console.log(`Unknown Sage Entity: ${entity}`)
        callback(false)
      }
    })
  })
}

function getXeroFullInvoice(userId, clientSystemId, xeroClient, invoiceId, callback) {
  xeroClient.core.invoices.getInvoice(invoiceId)
    .then(function (full_invoice) {
      //console.log(full_invoice.toJSON())
      var tmpOrg = full_invoice.toJSON()
      var lineItems = full_invoice.LineItems
      var payments = full_invoice.Payments
      delete tmpOrg.LineItems
      delete tmpOrg.Payments
      delete tmpOrg.Contact.Addresses
      delete tmpOrg.Contact.Phones
      tmpOrg.updatedAt = new Date()
      var csRef = firestore.collection('client_systems').doc(clientSystemId).collection('invoices').doc(invoiceId);
      var setWithOptions = csRef.set(tmpOrg, { merge: true }).then(invId => {
        deleteCollection(`client_systems/${clientSystemId}/invoices/${invoiceId}/line_items`).then(res => {
          lineItems.forEach(function (lineItem) {
            //console.log(lineItem.toJSON())
            var tmpOrgL = lineItem.toJSON()
            delete tmpOrgL.Tracking
            var cslRef = firestore.collection('client_systems')
              .doc(clientSystemId)
              .collection('invoices')
              .doc(invoiceId).collection('line_items')
              .add(tmpOrgL);
          })
          deleteCollection(`client_systems/${clientSystemId}/invoices/${invoiceId}/payments`).then(res => {
            payments.forEach(function (payment) {
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

function saveXeroInvoice(clientSystemId, jsonInv, stats, callback) {
  var invRef = firestore.collection('client_systems').doc(clientSystemId).collection('invoices').doc(jsonInv.InvoiceID);
  var getDoc = invRef.get()
    .then(doc => {
      if (!doc.exists) {
        if (jsonInv.Type == 'ACCREC') {
          if (jsonInv.Status == 'AUTHORISED') {
            stats.NotPaidReceivebleInvoices += 1;
            stats.AmountOwed += jsonInv.AmountDue;
            stats.AmountReceived += jsonInv.AmountPaid;
          } else if (jsonInv.Status == 'PAID') {
            stats.PaidReceivebleInvoices += 1;
            stats.AmountOwed += jsonInv.AmountDue;
            stats.AmountReceived += jsonInv.AmountPaid;
          }
        } else {
          if (jsonInv.Status == 'AUTHORISED') {
            stats.NotPaidPayableInvoices += 1;
            stats.AmountOwing += jsonInv.AmountDue;
            stats.AmountPaid += jsonInv.AmountPaid;
          } else if (jsonInv.Status == 'PAID') {
            stats.PaidPayableInvoices += 1;
            stats.AmountOwing += jsonInv.AmountDue;
            stats.AmountPaid += jsonInv.AmountPaid;
          }
        }
      } else {
        // console.log('Document data:', doc.data());
        if (jsonInv.Type == 'ACCREC') {
          if (jsonInv.Status == doc.data().Status) {
            if (jsonInv.Status == 'AUTHORISED' || jsonInv.Status == 'PAID') {
              stats.AmountOwed += jsonInv.AmountDue - doc.data().AmountDue;
              stats.AmountReceived += jsonInv.AmountPaid - doc.data().AmountPaid;
            }
          } else {
            if (jsonInv.Status == 'AUTHORISED') {
              stats.NotPaidReceivebleInvoices += 1;
              stats.AmountOwed += jsonInv.AmountDue;
              stats.AmountReceived += jsonInv.AmountPaid;
            } else if (jsonInv.Status == 'PAID') {
              stats.NotPaidReceivebleInvoices += -1;
              stats.AmountOwed += - doc.data().AmountDue;
              stats.AmountReceived += - doc.data().AmountPaid;
              stats.PaidReceivebleInvoices += 1;
              stats.AmountOwed += jsonInv.AmountDue;
              stats.AmountReceived += jsonInv.AmountPaid;
            } else if (doc.data().Status == 'AUTHORISED') {
              stats.NotPaidReceivebleInvoices += -1;
              stats.AmountOwed += - doc.data().AmountDue;
              stats.AmountReceived += - doc.data().AmountPaid;
            }
          }
        } else {
          if (jsonInv.Status == doc.data().Status) {
            if (jsonInv.Status == 'AUTHORISED' || jsonInv.Status == 'PAID') {
              stats.AmountOwing += jsonInv.AmountDue - doc.data().AmountDue;
              stats.AmountPaid += jsonInv.AmountPaid - doc.data().AmountPaid;
            }
          } else {
            if (jsonInv.Status == 'AUTHORISED') {
              stats.NotPaidPayableInvoices += 1;
              stats.AmountOwing += jsonInv.AmountDue;
              stats.AmountReceived += jsonInv.AmountPaid;
            } else if (jsonInv.Status == 'PAID') {
              stats.NotPaidPayableInvoices += -1;
              stats.AmountOwing += - doc.data().AmountDue;
              stats.AmountReceived += - doc.data().AmountPaid;
              stats.PaidPayableInvoices += 1;
              stats.AmountOwing += jsonInv.AmountDue;
              stats.AmountReceived += jsonInv.AmountPaid;
            } else if (doc.data().Status == 'AUTHORISED') {
              stats.NotPaidPayableInvoices += -1;
              stats.AmountOwing += - doc.data().AmountDue;
              stats.AmountReceived += - doc.data().AmountPaid;
            }
          }
        }
      }
      invRef.set(jsonInv).then(callback(stats))
    })
    .catch(err => {
      console.log('Error getting document', err);
      callback(stats)
    });
}

app.get('/access/:type/:clientSystemId', (req, res) => {
  // const userId = req.params.userId;
  const type = req.params.type;
  const clientSystemId = req.params.clientSystemId;
  if(type == 'xero'){
    saveXeroAuth(clientSystemId, req, success => {
      if (success) {
        //console.log('Xero authorized')
        res.redirect('https://rollabill-5503a.firebaseapp.com/dashboard')
      } else {
        console.log('Error authorizing Xero')
        res.redirect('https://rollabill-5503a.firebaseapp.com/dashboard')
        //sendNotification(userId, 'Error authorizing Xero')
      }
    })
  } else {
    var csRef = firestore.collection('client_systems').doc(clientSystemId);
    console.log(req.query.code)
    console.log(req.query.country)
    if(req.query.code != null){
      getAccessToken(clientSystemId, type, req.query.code,token => {
        //res.redirect('http://localhost:4200/dashboard')
        res.redirect('https://rollabill-5503a.firebaseapp.com/dashboard')
      })
    }
  }
});

app.get('/authorise/:type', (req, res) => {
  const type = req.params.type;
  const userId = req.user.uid;
  var userRef = firestore.collection('users').doc(userId);
  var getDoc = userRef.get()
    .then(doc => {
      const userDoc = doc.data();
      if(type == 'xero'){
        authorizeRedirectDB(res, userId, userDoc.selected_client_system.id);
      } else {
        const configDoc = firestore.collection('configs').doc(type).get().then(cDoc => {
          const config = cDoc.data()
          const oauth2 = simpleOauthModule.create(config.oauth2);
          config.authorizeURL.redirect_uri = `${config.authorizeURL.redirect_uri}/${userDoc.selected_client_system.id}`
          const authorizationUri = oauth2.authorizationCode.authorizeURL(config.authorizeURL);
          // config.testURL.redirect_uri = `${config.testURL.redirect_uri}/${userDoc.selected_client_system.id}`
          // const authorizationUri = oauth2.authorizationCode.authorizeURL(config.testURL);
          res.status(200).send(authorizationUri)
        })
      }
    })
});

app.get('/api/:entity/:type', (req, res) => {
  const userId = req.user.uid;
  const type = req.params.type;
  const entity = req.params.entity;
  var userRef = firestore.collection('users').doc(userId);
  var getDoc = userRef.get()
    .then(doc => {
      const userDoc = doc.data();
      if(type == 'xero'){
        getXeroEntity(userId, userDoc.selected_client_system.id, entity, success => {
          if (success) {
            console.log(`Got Xero ${entity}!`)
            res.status(200).send(`Got Xero ${entity}!`);
          } else {
            console.log(`Error getting Xero ${entity}`)
            res.status(403).send(`Error getting Xero ${entity}`);
          }
        });
      } else if (type == 'sageone') {
        getSageEntity(userId, userDoc.selected_client_system.id, entity, success => {
          if (success) {
            console.log(`Got Sage ${entity}!`)
            res.status(200).send(`Got Sage One ${entity}!`);
          } else {
            console.log(`Error getting Sage One ${entity}`)
            res.status(200).send(`Error getting Sage One ${entity}`);
          }
        })
      } else {
        console.log(`Unsupported Type: ${type}`)
        res.status(403).send(`Unsupported Type: ${type}`);
      }
    })
});

app.get('/invoices/:type', (req, res) => {
  const userId = req.user.uid;
  const type = req.params.type;
  var userRef = firestore.collection('users').doc(userId);
  return userRef.get()
    .then(doc => {
      if (!doc.exists) {
        console.log('No such user!');
        res.status(403).send('No such user!');
        return false;
      } else {
        const userDoc = doc.data();
        //res.status(200).send('URL.....');
        getXeroInvoices(userId, userDoc.selected_client_system.id, success => {
          if (success) {
            res.status(200).send('Got Invoices!');
          } else {
            es.status(403).send('Error getting contacts');
          }
        });
      }
    })
});

app.get('/items/:type', (req, res) => {
  const userId = req.user.uid;
  const type = req.params.type;
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
        getXeroItems(userId, userDoc.selected_client_system.id, success => {
          if (success) {
            res.status(200).send('Got Items!');
          } else {
            es.status(403).send('Error getting items');
          }
        });
      }
    })
});

exports.app = functions.https.onRequest(app);

exports.userLogin = functions.firestore
  .document('users/{userId}')
  .onUpdate((event) => {
    const data = event.data.data();
    const previousData = event.data.previous.data();
    var csRef = firestore.collection('client_systems').doc(data.selected_client_system.id);
    return csRef.get()
      .then(doc => {
        if (!doc.exists) {
          console.log('No such client system!');
        } else {
          const csDoc = doc.data();
          if(csDoc.type == 'xero'){
            var a = new Date(); // Current date now.
            var b = new Date(csDoc.xeroAuthAt); // Start of 2010.
            if(parseInt(Math.abs(b-a)/1000) > 1800){
              csRef.set({status: 'disconnected'}, {merge: true})
            }
          }
        }
      })
      .catch(err => {
        console.log('Error getting client system document', err);
      });
  });