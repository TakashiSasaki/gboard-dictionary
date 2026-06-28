/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { initAuth, googleSignIn, logout, getUserSpreadsheetId, setUserSpreadsheetId } from './firebase';
import { User } from 'firebase/auth';
import { Loader2, Database, ExternalLink, LogOut, Search, XCircle, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      async (u, t) => {
        setUser(u);
        setToken(t);
        const sid = await getUserSpreadsheetId(u.uid);
        setSpreadsheetId(sid);
        setLoading(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setSpreadsheetId(null);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        const sid = await getUserSpreadsheetId(res.user.uid);
        setSpreadsheetId(sid);
      }
    } catch (err: any) {
      console.error(err);
      setError("Login failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setResult(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!token) return;
    
    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          accessToken: token,
          spreadsheetId: spreadsheetId
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import');
      }

      if (data.spreadsheetId && user) {
        await setUserSpreadsheetId(user.uid, data.spreadsheetId);
        setSpreadsheetId(data.spreadsheetId);
      }

      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Gboard Dictionary Importer</h1>
            <p className="text-slate-500">Search and import your Gboard dictionaries from Drive to Sheets.</p>
          </div>
          {user && (
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </header>

        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-12 rounded-2xl shadow-sm border border-slate-200 text-center"
            >
              <div className="mb-8 flex justify-center">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <Database className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold mb-4">Connect to Google</h2>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                We need access to your Google Drive to find dictionary files and Google Sheets to save the data.
              </p>
              <button
                onClick={handleLogin}
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Sign in with Google
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-6">
                  <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-12 h-12 rounded-full border border-slate-100" />
                  <div>
                    <p className="font-medium">{user.displayName}</p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {spreadsheetId && (
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-slate-700">Linked Spreadsheet</p>
                          <p className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{spreadsheetId}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          if (user) {
                             // Instead of deleting, we just clear the local state to create a new one next time
                             // or we can allow the user to clear it in Firestore
                             setSpreadsheetId(null);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        title="Unlink Spreadsheet (Will create a new one on next import)"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Scanning and Importing...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        Search for "Personal Dictionary.zip" and Import
                      </>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-red-700 text-sm">
                  {error}
                </div>
              )}

              {result && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200"
                >
                  <h3 className="text-lg font-semibold mb-4">Import Summary</h3>
                  <p className="text-slate-600 mb-6">{result.message}</p>
                  
                  {result.spreadsheetUrl && (
                    <a 
                      href={result.spreadsheetUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium text-sm mb-6"
                    >
                      View Spreadsheet <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  {result.results && result.results.length > 0 && (
                    <div className="border-t border-slate-100 pt-6">
                      <h4 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">Files Processed</h4>
                      <ul className="space-y-3">
                        {result.results.map((file: any) => (
                          <li key={file.fileId} className="flex items-center justify-between text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <span className="font-mono text-slate-500">{file.fileId}</span>
                            <span className="font-medium">{file.rows} records imported</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
