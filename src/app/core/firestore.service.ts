import { Injectable } from '@angular/core';
import * as firebase from 'firebase/app';
import { 
  AngularFirestore, 
  AngularFirestoreDocument,
  AngularFirestoreCollection
} from 'angularfire2/firestore';
import { Observable } from 'rxjs/Observable';

@Injectable()
export class FirestoreService {

  constructor(private afs: AngularFirestore) { }

  col<T>(ref: string, queryFn?): AngularFirestoreCollection<T[]> {
    return this.afs.collection(ref, queryFn);
  }

  doc<T>(ref: string): AngularFirestoreDocument<T> {
    return this.afs.doc(ref);
  }

  get timestamp() {
    return firebase.firestore.FieldValue.serverTimestamp()
  }

  update<T>(ref: string, data: any) {
    return this.doc(ref).update({
      ...data,
      updatedAt: this.timestamp
    })
  }

  set<T>(ref: string, data: any) {
    const timestamp = this.timestamp
    return this.doc(ref).set({
      ...data,
      updatedAt: timestamp,
      createdAt: timestamp
    })
  }

  add<T>(ref: string, data) {
    const timestamp = this.timestamp
    return this.col(ref).add({
      ...data,
      updatedAt: timestamp,
      createdAt: timestamp
    })
  }

  upsert<T>(ref: string, data: any) {
    const doc = this.doc(ref).snapshotChanges().take(1).toPromise()
    return doc.then(snap => {
      return snap.payload.exists ? this.update(ref, data) : this.set(ref, data)
    })
  }

  colWithIds$<T>(ref: string, queryFn?): Observable<any[]> {
    return this.col(ref, queryFn).snapshotChanges().map(actions => {
      return actions.map(a => {
        const data = a.payload.doc.data();
        const id = a.payload.doc.id;
        return { id, ...data };
      });
    });
  }

  col$<T>(ref: string, queryFn?): Observable<any[]> {
    return this.col(ref, queryFn).valueChanges();
  }

  doc$<T>(ref: string): Observable<any> {
    return this.doc(ref).valueChanges();
  }

  docWithId$<T>(ref: string): Observable<any> {
    return this.doc(ref).snapshotChanges()
                .map(a => {
                  const data = a.payload.data();
                  const id = a.payload.id;
                  return { id, ...data };
                });
  }

  inspectDoc(ref: string): void {
    const tick = new Date().getTime()
    this.doc(ref).snapshotChanges()
        .take(1)
        .do(d => {
          const tock = new Date().getTime() - tick
          console.log(`Loaded Document in ${tock}ms`, d)
        })
        .subscribe()
  }

  inspectCol(ref: string): void {
    const tick = new Date().getTime()
    this.col(ref).snapshotChanges()
        .take(1)
        .do(c => {
          const tock = new Date().getTime() - tick
          console.log(`Loaded Collection in ${tock}ms`, c)
        })
        .subscribe()
  }

}
