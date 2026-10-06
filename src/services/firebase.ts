import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import type { AuditRun } from '../types';

import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth & Provider
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore with configured databaseId
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot as required by Firebase skill
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[MIHAK Firebase] Firestore client is offline or database is initializing.');
    }
  }
}
testFirestoreConnection();

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface SavedAuditItem {
  id: string;
  userId: string;
  title: string;
  inputType: 'text' | 'url' | 'audio' | 'pdf' | 'search';
  statusSummary: string;
  claimCount: number;
  createdAt: string;
  originalUrl?: string;
  auditResult: AuditRun;
}

export async function signInWithGoogle(): Promise<UserProfile> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // Sync profile document to users/{uid}
  const userPath = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || 'مستخدم مِحَكّ',
      email: user.email,
      photoURL: user.photoURL,
      lastLoginAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('[MIHAK Firebase] User profile sync warning:', err);
  }

  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL
  };
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuth(callback: (user: UserProfile | null) => void): () => void {
  return onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      callback({
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName,
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL
      });
    } else {
      callback(null);
    }
  });
}

export async function saveAuditToFirestore(
  audit: AuditRun,
  metadata: {
    inputType: 'text' | 'url' | 'audio' | 'pdf' | 'search';
    title?: string;
    originalUrl?: string;
  }
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('يجب تسجيل الدخول لحفظ نتيجة التدقيق.');
  }

  const auditId = audit.id || `audit-${Date.now()}`;
  const auditPath = `audits/${auditId}`;
  const auditDocRef = doc(db, 'audits', auditId);

  // Compute status summary
  const supported = audit.stats.supported + audit.stats.verifiedQuotes;
  const partial = audit.stats.partiallySupported;
  const unverified = audit.stats.insufficientEvidence + audit.stats.needsSpecialistReview;
  const statusSummary = `${supported} مدعوم، ${partial} جزئي، ${unverified} غير مثبت`;

  const payload: SavedAuditItem = {
    id: auditId,
    userId: currentUser.uid,
    title: metadata.title || audit.input_text.slice(0, 120) || 'نتيجة تدقيق',
    inputType: metadata.inputType,
    statusSummary,
    claimCount: audit.claims.length,
    createdAt: new Date().toISOString(),
    originalUrl: metadata.originalUrl,
    auditResult: audit
  };

  try {
    await setDoc(auditDocRef, {
      ...payload,
      auditResultJson: JSON.stringify(audit)
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, auditPath);
  }

  return auditId;
}

export async function getUserSavedAudits(userId: string): Promise<SavedAuditItem[]> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== userId) {
    return [];
  }

  const auditsPath = 'audits';
  try {
    const auditsRef = collection(db, 'audits');
    const q = query(
      auditsRef,
      where('userId', '==', userId),
      limit(50)
    );

    const snapshot = await getDocs(q);
    const results: SavedAuditItem[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      let auditResult = data.auditResult as AuditRun;
      if (!auditResult && data.auditResultJson) {
        try {
          auditResult = JSON.parse(data.auditResultJson);
        } catch {
          // Ignore parse error
        }
      }

      results.push({
        id: docSnap.id,
        userId: data.userId,
        title: data.title || 'تدقيق محفوظ',
        inputType: data.inputType || 'text',
        statusSummary: data.statusSummary || '',
        claimCount: data.claimCount || 0,
        createdAt: data.createdAt || '',
        originalUrl: data.originalUrl,
        auditResult
      });
    });

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return results;
  } catch (error) {
    console.warn('[MIHAK Firebase] Error fetching saved audits:', error);
    if (error instanceof Error && error.message.includes('permission')) {
      handleFirestoreError(error, OperationType.LIST, auditsPath);
    }
    return [];
  }
}

export async function deleteSavedAudit(auditId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('يجب تسجيل الدخول لحذف نتيجة التدقيق.');
  }

  const auditPath = `audits/${auditId}`;
  const auditDocRef = doc(db, 'audits', auditId);
  try {
    await deleteDoc(auditDocRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, auditPath);
  }
}
