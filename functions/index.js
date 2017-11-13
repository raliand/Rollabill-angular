'use strict';

const async = require('async');

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

function getXeroClientFromDB(userId, clientSystemId, callback) {

  var config = {
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
        sendNotification(userId, 'Client system does not exist')
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
      sendNotification(userId, 'Error getting document')
      callback(new xero.PublicApplication(config));
    });
}

function authorizeRedirectDB(res, userid, clientSystemId) {
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userid, clientSystemId, xeroClient => {
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

function saveXeroAuth(userId, clientSystemId, req, callback) {
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

app.get('/access/:userId/:clientSystemId', (req, res) => {
  const userId = req.params.userId;
  const clientSystemId = req.params.clientSystemId;
  saveXeroAuth(userId, clientSystemId, req, success => {
    if (success) {
      //sendNotification(userId, 'Xero Authorized')
      //getXeroOrganizations(userId, clientSystemId)
    } else {
      sendNotification(userId, 'Error authorizing Xero')
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
        authorizeRedirectDB(res, userId, userDoc.selected_client_system.id);
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
        getXeroContacts(userId, userDoc.selected_client_system.id, success => {
          if (success) {
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
    .catch(err => {
      console.log('Error getting user document', err);
      //sendNotification(userId,'Error getting user document')
      res.status(403).send('Error getting user document');
      return false;
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
        getXeroItems(userId, userDoc.selected_client_system.id, success => {
          if (success) {
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

function getXeroOrganizations(userId, clientSystemId, callback) {
  var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
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
  })
}

function getXeroContacts(userId, clientSystemId, callback) {
  //var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
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
          var csRef = firestore.collection('client_systems').doc(clientSystemId).collection('contacts').doc(tmpOrg.ContactID);
          var setWithOptions = csRef.set(tmpOrg, { merge: true })
        });
        //sendNotification(userId, 'Contacts Updated')
        callback(true);
      })
      .catch(function (err) {
        console.log(err)
        sendNotification(userId, 'Error updating - please login to Xero');
        callback(false);
      })
  })
}

function getXeroItems(userId, clientSystemId, callback) {
  //var csRef = firestore.collection('client_systems').doc(clientSystemId);
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
    xeroClient.core.items.getItems()
      .then(function (items) {
        //console.log(organisations);
        items.forEach(function (item) {
          //console.log(item.toJSON())
          var tmpOrg = item.toJSON();

          var csRef = firestore.collection('client_systems').doc(clientSystemId).collection('items').doc(tmpOrg.ItemID);
          var setWithOptions = csRef.set(tmpOrg, { merge: true })
        });
        //sendNotification(userId, 'Items Updated')
        callback(true);
      })
      .catch(function (err) {
        console.log(err)
        sendNotification(userId, 'Error updating - please login to Xero');
        callback(false);
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

function getXeroInvoices(userId, clientSystemId, callback) {
  var stats = {}
  getXeroClientFromDB(userId, clientSystemId, xeroClient => {
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
  })
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
          var a = new Date(); // Current date now.
          var b = new Date(csDoc.xeroAuthAt); // Start of 2010.
          if(parseInt(Math.abs(b-a)/1000) > 1800){
            csRef.set({status: 'disconnected'}, {merge: true})
          }
          // if (csDoc.status == 'connected') {
          //   //sendNotification(data.uid,'Refreshing Xero Organizations')
          //   getXeroOrganizations(data.uid, data.selected_client_system.id, success => {
          //     if (!success) {
          //       var setWithOptions = csRef.set({ status: 'disconnected' }, { merge: true });
          //     }
          //   })
          // }
        }
      })
      .catch(err => {
        console.log('Error getting client system document', err);
      });
  });

// exports.updateInvoicesStats = functions.firestore
//   .document('client_systems/{clientSystemId}/invoices/{invoiceId}')
//   .onWrite(event => {
//     var newInvoice = event.data.data();
//     var csRef = firestore.collection('client_systems').doc(event.params.clientSystemId);
//     return csRef.get().then(csDoc => {
//       return saveStats(firestore, csRef, csDoc.data().num_shards, newInvoice)
//     }).catch(err => {
//       console.log(err)
//       return false
//     })
//   });