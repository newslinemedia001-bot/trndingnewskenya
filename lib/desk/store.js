/**
 * Server-side Firestore access for the editorial desk.
 *
 * Writes go through the Firestore REST API with a service-account key, which
 * keeps the security rules strict (clients still cannot write) without pulling
 * in the Admin/gRPC stack:
 *
 *   FIREBASE_SERVICE_ACCOUNT=./secrets/serviceAccount.json   (or inline JSON)
 *   GOOGLE_APPLICATION_CREDENTIALS=...                       (alternative)
 *
 * Without that key the public site can still read published stories through
 * the web SDK (the rules expose them), but the desk is read-only and says so.
 *
 * Documents store ISO-8601 dates rather than Firestore Timestamps, so the
 * shapes are plain JSON everywhere.
 */
import { getDb } from '@/lib/firebase'
import { collection, doc, getDoc, getDocs, limit, query, where as whereFn } from 'firebase/firestore'
import {
  credentialPath,
  deleteDoc as restDelete,
  hasAdminCredentials,
  readCollection as restReadCollection,
  readDoc as restReadDoc,
  writeDoc as restWriteDoc,
} from './firestore-rest.mjs'

export { credentialPath, hasAdminCredentials }

/** 'admin' can read and write; 'web' can only read published stories. */
export function storeMode() {
  return hasAdminCredentials() ? 'admin' : 'web'
}

export function canWrite() {
  return hasAdminCredentials()
}

/** True when the desk has no database credentials yet. */
export function deskBlocked() {
  return !canWrite()
}

export async function readCollection(name, where = null) {
  if (storeMode() === 'admin') return restReadCollection(name, where)

  // Public read path: the rules only allow queries filtered to published rows.
  const db = getDb()
  if (!db) return []
  const ref = where
    ? query(collection(db, name), whereFn(where.field, where.op || '==', where.value), limit(500))
    : query(collection(db, name), limit(500))
  const snapshot = await getDocs(ref)
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
}

export async function readDoc(name, id) {
  if (!id) return null
  if (storeMode() === 'admin') return restReadDoc(name, id)

  const db = getDb()
  if (!db) return null
  const snapshot = await getDoc(doc(db, name, id))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function writeDoc(name, id, data, { merge = true } = {}) {
  return restWriteDoc(name, id, data, { merge })
}

export async function deleteDoc(name, id) {
  return restDelete(name, id)
}
