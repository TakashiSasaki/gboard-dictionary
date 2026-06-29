import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const provider = new GoogleAuthProvider();
// Request Workspace scopes as requested by user
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
const TOKEN_STORAGE_KEY = 'gboard_importer_token';

let cachedAccessToken: string | null = null;

// Try to restore from localStorage on initialization
const restoreToken = () => {
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      const { token, expiresAt } = JSON.parse(stored);
      if (expiresAt > Date.now()) {
        cachedAccessToken = token;
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  } catch (e) {
    console.error('Failed to restore token:', e);
  }
};

restoreToken();

export const initAuth = (
  callback: (user: User | null, token: string | null) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    // If user exists but token is missing from memory, try one last restore
    if (user && !cachedAccessToken) {
      restoreToken();
    }
    callback(user, cachedAccessToken);
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    
    // Save to localStorage (default Google token expiry is 1 hour)
    const expiresAt = Date.now() + 3500 * 1000; // Buffer 100s
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({
      token: cachedAccessToken,
      expiresAt
    }));

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  restoreToken(); // Ensure it's fresh
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
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
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();

const SPREADSHEET_ID_KEY_PREFIX = 'gboard_importer_sheet_';

export const getUserSpreadsheetId = async (uid: string): Promise<string | null> => {
  const path = `users/${uid}`;
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const sid = userDoc.data().spreadsheetId || null;
      if (sid) {
        localStorage.setItem(SPREADSHEET_ID_KEY_PREFIX + uid, sid);
      }
      return sid;
    }
  } catch (error: any) {
    if (error.message?.includes('Quota limit exceeded')) {
      console.warn('Firestore quota exceeded, falling back to local storage');
      return localStorage.getItem(SPREADSHEET_ID_KEY_PREFIX + uid);
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
  return localStorage.getItem(SPREADSHEET_ID_KEY_PREFIX + uid);
};

export const setUserSpreadsheetId = async (uid: string, spreadsheetId: string) => {
  const path = `users/${uid}`;
  localStorage.setItem(SPREADSHEET_ID_KEY_PREFIX + uid, spreadsheetId);
  try {
    await setDoc(doc(db, 'users', uid), {
      spreadsheetId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error: any) {
    if (error.message?.includes('Quota limit exceeded')) {
      console.warn('Firestore quota exceeded, saved only to local storage');
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};
