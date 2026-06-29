/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { initAuth, googleSignIn, logout, getUserSpreadsheetId, setUserSpreadsheetId } from './firebase';
import { User } from 'firebase/auth';
import { Loader2, Database, ExternalLink, LogOut, Search, XCircle, FileSpreadsheet, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<any>(null);
  const [mergedRecords, setMergedRecords] = useState<string[][]>([]);
  const [loadingMerged, setLoadingMerged] = useState(false);
  const [activeTab, setActiveTab] = useState<'import' | 'merged'>('import');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(async (u, t) => {
      setUser(u);
      setToken(t);
      if (u) {
        try {
          const sid = await getUserSpreadsheetId(u.uid);
          setSpreadsheetId(sid);
        } catch (err: any) {
          console.error("Firestore read error:", err);
          if (err.code === 'permission-denied') {
            setError("Permission denied accessing your settings. Please try signing in again.");
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchMergedRecords = async () => {
    if (!token || !spreadsheetId) return;
    setLoadingMerged(true);
    setError(null);
    try {
      const response = await fetch('/api/merged-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, spreadsheetId }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setMergedRecords(data.records || []);
    } catch (err: any) {
      setError("Failed to fetch merged records: " + err.message);
    } finally {
      setLoadingMerged(false);
    }
  };

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

  const handleImport = async (fileIds?: any) => {
    if (!token) return;

    // If called as an event handler, fileIds will be the Event object.
    // We only want to treat it as fileIds if it's an Array.
    const actualFileIds = Array.isArray(fileIds) ? fileIds : undefined;
    
    if (actualFileIds) {
      setProcessingIds(prev => new Set([...prev, ...actualFileIds]));
    } else {
      setImporting(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          accessToken: token,
          spreadsheetId: spreadsheetId,
          fileIds: actualFileIds
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

      // If it's a specific import, merge results into existing ones if available
      if (actualFileIds && result?.results) {
        const newResults = [...result.results];
        data.results.forEach((res: any) => {
          const idx = newResults.findIndex(r => r.fileId === res.fileId);
          if (idx !== -1) {
            newResults[idx] = res;
          } else {
            newResults.push(res);
          }
        });
        setResult({ ...data, results: newResults });
      } else {
        setResult(data);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      if (fileIds) {
        setProcessingIds(prev => {
          const next = new Set(prev);
          fileIds.forEach(id => next.delete(id));
          return next;
        });
      } else {
        setImporting(false);
      }
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
                  {!token && (
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-amber-800 text-sm mb-2">
                      <p className="font-medium mb-1">Workspace access expired</p>
                      <p className="mb-3 opacity-90">Please sign in again to restore access to your Google Drive and Sheets.</p>
                      <button 
                        onClick={handleLogin}
                        className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-md hover:bg-amber-700 transition-colors"
                      >
                        Re-authorize Workspace
                      </button>
                    </div>
                  )}

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
                    onClick={() => handleImport()}
                    disabled={importing || loading || !token || processingIds.size > 0}
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
                  {result && result.results && result.results.length > 0 && (
                    <button
                      onClick={() => handleImport()}
                      disabled={importing}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-50 text-blue-700 font-medium rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 border border-blue-100"
                    >
                      {importing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Importing All...
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4" />
                          Import All Files
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex border-b border-slate-100">
                <button
                  onClick={() => setActiveTab('import')}
                  className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'import' 
                      ? 'border-slate-900 text-slate-900' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Import Results
                </button>
                <button
                  onClick={() => {
                    setActiveTab('merged');
                    if (mergedRecords.length === 0) fetchMergedRecords();
                  }}
                  className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'merged' 
                      ? 'border-slate-900 text-slate-900' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Merged View
                </button>
              </div>

              {activeTab === 'import' ? (
                <>
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
                          <ul className="space-y-4">
                            {result.results.map((file: any) => {
                              const isProcessing = processingIds.has(file.fileId);
                              return (
                                <li key={file.fileId} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
                                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-slate-900 truncate" title={file.fileName}>
                                        {file.fileName || 'Unknown File'}
                                      </p>
                                      <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                                        ID: {file.fileId}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] px-2 py-1 rounded-full font-medium shrink-0 ${
                                        file.status === 'imported' ? 'bg-green-100 text-green-700' : 
                                        file.status === 'skipped' ? 'bg-blue-100 text-blue-700' : 
                                        'bg-red-100 text-red-700'
                                      }`}>
                                        {file.status === 'imported' ? 'Imported' : file.status === 'skipped' ? 'Already Imported' : 'Error'}
                                      </span>
                                      <button
                                        onClick={() => handleImport([file.fileId])}
                                        disabled={isProcessing || importing}
                                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                                        title="Re-import this file"
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <Database className="w-4 h-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
                                    <div>
                                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Last Modified</p>
                                      <p className="text-xs text-slate-600">
                                        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Unknown'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">File Size</p>
                                      <p className="text-xs text-slate-600">
                                        {file.size ? (Number(file.size) / 1024).toFixed(1) + ' KB' : 'Unknown'}
                                      </p>
                                    </div>
                                  </div>

                                  {file.status === 'imported' && (
                                    <p className="text-xs text-green-600 font-medium">
                                      {file.rows} records added
                                    </p>
                                  )}
                                  {file.status === 'error' && (
                                    <p className="text-xs text-red-500 italic">
                                      {file.message}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  )}
                </>
              ) : (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Merged Dictionary</h3>
                      <p className="text-sm text-slate-500">Combined records from all sheets (duplicates removed)</p>
                    </div>
                    <button
                      onClick={fetchMergedRecords}
                      disabled={loadingMerged}
                      className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Refresh Merged View"
                    >
                      <RefreshCcw className={`w-5 h-5 ${loadingMerged ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {loadingMerged ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <p className="text-sm">Merging records from Sheets...</p>
                    </div>
                  ) : mergedRecords.length > 0 ? (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-3">Word</th>
                              <th className="px-4 py-3">Reading</th>
                              <th className="px-4 py-3">Language</th>
                              <th className="px-4 py-3">Part of Speech</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mergedRecords.map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-900">{row[0]}</td>
                                <td className="px-4 py-3 text-slate-600">{row[1]}</td>
                                <td className="px-4 py-3 text-slate-500">{row[2]}</td>
                                <td className="px-4 py-3 text-slate-400">{row[3]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        Total unique records: {mergedRecords.length}
                      </div>
                    </div>
                  ) : (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <Database className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm">No records found. Try fetching or check your linked spreadsheet.</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
