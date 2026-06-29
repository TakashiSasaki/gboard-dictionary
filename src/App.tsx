/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { initAuth, googleSignIn, logout, getUserSpreadsheetId, setUserSpreadsheetId } from './firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { Loader2, Database, ExternalLink, LogOut, Search, XCircle, FileSpreadsheet, RefreshCcw, ChevronDown, User as UserIcon, Mail, Download, BookOpen, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';

const FormatDocs = () => (
  <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-slate-700 text-left w-full max-w-3xl mx-auto mt-8">
    <div className="mb-6 flex justify-between items-center">
      <h3 className="text-2xl font-bold text-slate-900">Gboard User Dictionary Format</h3>
      <Link to="/" className="text-blue-600 hover:text-blue-700 hover:underline font-medium text-sm">
        Back to App
      </Link>
    </div>
    <p className="mb-4 text-slate-600">Based on our development and testing, here are the technical specifications for the Gboard user dictionary format (<code>dictionary.txt</code> inside the <code>Personal Dictionary.zip</code> file).</p>
    
    <h4 className="text-lg font-semibold mt-6 mb-2 text-slate-900">1. Header Structure</h4>
    <p className="mb-3 text-slate-600">The file must begin with exactly two header lines. Crucially, the second line dictates the column structure using <strong>hard tabs</strong> (<code>\t</code>), not spaces, although spaces are sometimes seen in older exports. For safe importing, the following exact format is confirmed to work:</p>
    <pre className="bg-slate-50 p-4 rounded-lg overflow-x-auto text-sm border border-slate-100 text-slate-800">
# Gboard Dictionary version:2{'\n'}
# Gboard Dictionary format:shortcut{'\t'}word{'\t'}language_tag{'\t'}pos_tag
    </pre>
    
    <h4 className="text-lg font-semibold mt-6 mb-2 text-slate-900">2. Body Structure (TSV)</h4>
    <p className="mb-3 text-slate-600">Following the header, the records are defined in Tab-Separated Values (TSV) format.</p>
    <ul className="list-disc pl-5 space-y-1 mb-4 text-slate-600">
      <li><strong>Line Endings:</strong> Unix-style line endings (<code>\n</code>) must be used. Carriage returns (<code>\r\n</code>) will cause unknown errors during import on Android devices.</li>
      <li><strong>Delimiter:</strong> Columns must be separated by a single hard tab (<code>\t</code>).</li>
    </ul>

    <h4 className="text-lg font-semibold mt-6 mb-2 text-slate-900">3. Columns</h4>
    <ul className="list-disc pl-5 space-y-1 mb-4 text-slate-600">
      <li><code>shortcut</code> (Optional) - The reading/yomi used to trigger the word.</li>
      <li><code>word</code> (Required) - The actual word to be inputted.</li>
      <li><code>language_tag</code> (Optional) - e.g., <code>ja-JP</code>, <code>en-US</code>. If omitted or empty, it often defaults to all languages or the system default.</li>
      <li><code>pos_tag</code> (Optional) - Part of speech, e.g., <code>noun</code>. Rarely strict.</li>
    </ul>

    <h4 className="text-lg font-semibold mt-6 mb-2 text-slate-900">4. Multi-Language Import Behavior</h4>
    <p className="text-slate-600">It is fully supported to have records for multiple different languages (e.g., Japanese and English) within the <strong>same</strong> <code>dictionary.txt</code> file. Gboard parses the <code>language_tag</code> column per row and correctly categorizes them in the app's internal database.</p>
  </div>
);

const AboutApp = () => (
  <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-slate-700 text-left w-full max-w-3xl mx-auto mt-8">
    <div className="mb-6 flex justify-between items-center">
      <h3 className="text-2xl font-bold text-slate-900">About Gboard Dictionary Importer</h3>
      <Link to="/" className="text-blue-600 hover:text-blue-700 hover:underline font-medium text-sm">
        Back to App
      </Link>
    </div>
    
    <p className="mb-6 text-slate-600 leading-relaxed">
      Gboard Dictionary Importer is a utility application designed to help Android users manage, backup, and synchronize their personal Gboard dictionaries across multiple devices using <strong>Google Sheets as a centralized database</strong>.
    </p>

    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-8">
      <h4 className="text-blue-900 font-semibold mb-2 flex items-center gap-2">
        <Database className="w-5 h-5 text-blue-600" />
        Data Privacy & Storage: Are my words saved on your servers?
      </h4>
      <p className="text-blue-800 text-sm leading-relaxed">
        <strong>No. Your dictionary data is NEVER saved to our databases or servers.</strong><br/><br/>
        This application acts merely as a bridge. When you use this app, it reads the dictionary files directly from your Google Drive and writes the extracted words directly to a Google Spreadsheet owned by your Google Account. Your custom words, shortcuts, and language data reside <strong>only in your own Google Sheet</strong> and your own Google Drive.
      </p>
    </div>

    <h4 className="text-lg font-semibold mt-6 mb-2 text-slate-900">Why should I use this app?</h4>
    <p className="mb-4 text-slate-600 leading-relaxed">
      When you switch phones or use multiple Android devices, your Gboard personal dictionary (the custom words you've added for faster typing) does not always sync perfectly or merge well through standard Google backups. Many users export their "Personal Dictionary.zip" to Google Drive, but combining these zip files manually is tedious and error-prone. This app automates that process, saving you time and preventing data loss.
    </p>

    <h4 className="text-lg font-semibold mt-6 mb-2 text-slate-900">How it works</h4>
    <ul className="list-disc pl-5 space-y-2 mb-6 text-slate-600">
      <li><strong>Connect:</strong> The app connects to your Google Account to access your Drive and Sheets.</li>
      <li><strong>Extract & Parse:</strong> It searches your Google Drive for Gboard dictionary exports (<code>Personal Dictionary.zip</code>), extracts the <code>dictionary.txt</code> files, and parses the custom Tab-Separated format.</li>
      <li><strong>Sync to Sheets:</strong> It writes these records into a dedicated Google Spreadsheet (named <code>Gboard_Dictionary_Merged</code>), creating a permanent, accessible backup that you control.</li>
      <li><strong>Merge & Deduplicate:</strong> It reads from the spreadsheet, automatically removes duplicate entries, and provides a clean interface to download a newly consolidated <code>dictionary.txt</code> file ready to be imported back into Gboard on any device.</li>
    </ul>

    <h4 className="text-lg font-semibold mt-6 mb-2 text-slate-900">Required Permissions</h4>
    <div className="text-slate-600 leading-relaxed">
      To function, this application requests two specific Google permissions during sign-in:
      <ul className="list-disc pl-5 space-y-1 mt-2 mb-4">
        <li><strong>Google Drive Read Access:</strong> Required to locate and read your <code>Personal Dictionary.zip</code> files.</li>
        <li><strong>Google Sheets Access:</strong> Required to create and update the spreadsheet where your merged dictionary will be stored.</li>
      </ul>
      <p>You can revoke these permissions at any time from your Google Account security settings.</p>
    </div>
  </div>
);

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<any>(null);
  const [mergedRecords, setMergedRecords] = useState<string[][]>([]);
  const [loadingMerged, setLoadingMerged] = useState(false);
  
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const [languageFilter, setLanguageFilter] = useState<string>('ALL');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [noReadingFilter, setNoReadingFilter] = useState<boolean>(false);

  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL path
  const activeTab = location.pathname === '/merged' ? 'merged' : 'import';

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    mergedRecords.forEach(row => langs.add(row[2]?.trim() || ''));
    return Array.from(langs).sort();
  }, [mergedRecords]);

  const availablePartsOfSpeech = useMemo(() => {
    const pos = new Set<string>();
    mergedRecords.forEach(row => pos.add(row[3]?.trim() || ''));
    return Array.from(pos).sort();
  }, [mergedRecords]);

  const filteredRecords = useMemo(() => {
    return mergedRecords.filter(row => {
      if (noReadingFilter && row[0]?.trim()) return false;
      
      const rowLang = row[2]?.trim() || '';
      if (languageFilter !== 'ALL' && rowLang !== languageFilter) return false;
      
      const rowPos = row[3]?.trim() || '';
      if (posFilter !== 'ALL' && rowPos !== posFilter) return false;
      
      return true;
    });
  }, [mergedRecords, languageFilter, posFilter, noReadingFilter]);

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
          if (err.message?.includes('Quota limit exceeded')) {
            setError(
              <span>
                Firestore quota exceeded. Settings are being loaded from local storage. 
                <a 
                  href="https://console.firebase.google.com/project/moukaeritaid/firestore/databases/gboard-dictionary-importer/data?openUpgradeDialog=true" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline ml-1 text-red-800"
                >
                  Upgrade/View Usage
                </a>
              </span>
            );
          } else if (err.code === 'permission-denied') {
            setError("Permission denied accessing your settings. Please try signing in again.");
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = () => {
      if (showProfileMenu) setShowProfileMenu(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showProfileMenu]);

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
  
  useEffect(() => {
    if (activeTab === 'merged' && mergedRecords.length === 0 && user && token && spreadsheetId) {
      fetchMergedRecords();
    }
  }, [activeTab, user, token, spreadsheetId]);

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
      if (err.message?.includes('Quota limit exceeded')) {
        setError(
          <span>
            Firestore quota exceeded. Please check your database usage or upgrade: 
            <a 
              href="https://console.firebase.google.com/project/moukaeritaid/firestore/databases/gboard-dictionary-importer/data?openUpgradeDialog=true" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline ml-1"
            >
              Firebase Console
            </a>
          </span>
        );
      } else {
        setError("Login failed: " + err.message);
      }
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

  const handleDownloadZip = async () => {
    try {
      const zip = new JSZip();
      
      const header = "# Gboard Dictionary version:2\n# Gboard Dictionary format:shortcut\tword\tlanguage_tag\tpos_tag\n";
      const tsvContent = filteredRecords.map(row => row.join('\t')).join('\n');
      const finalContent = header + tsvContent;
      
      zip.file("dictionary.txt", finalContent);
      
      const content = await zip.generateAsync({ type: "blob" });
      
      const pad = (n: number) => n.toString().padStart(2, '0');
      const now = new Date();
      const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const zipFileName = `PersonalDictionary_${dateStr}.zip`;
      
      saveAs(content, zipFileName);
    } catch (err) {
      console.error("Failed to generate ZIP", err);
      setError("Failed to download dictionary ZIP");
    }
  };

  const handleImport = async (fileIds?: any) => {
    if (!token) return;

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
      if (err.message?.includes('Quota limit exceeded')) {
        setError(
          <span>
            Firestore quota exceeded: 
            <a 
              href="https://console.firebase.google.com/project/moukaeritaid/firestore/databases/gboard-dictionary-importer/data?openUpgradeDialog=true" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline ml-1"
            >
              Open Console
            </a>
          </span>
        );
      } else {
        setError(err.message);
      }
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
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 px-[1px] pt-[2px] pb-[16px]">
      <div className="max-w-3xl mx-auto">
        <header className="mb-[1px] flex items-center justify-end sm:justify-between py-4">
          <div className="hidden sm:block">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Gboard Dictionary Importer</h1>
            <p className="text-slate-500">Search and import your Gboard dictionaries from Drive to Sheets.</p>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <>
                <Link to="/about" className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1.5 text-sm font-medium">
                  <Info className="w-4 h-4" />
                  <span className="hidden sm:inline">About</span>
                </Link>
                <Link to="/docs" className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1.5 text-sm font-medium">
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">Docs</span>
                </Link>
              </>
            )}

            {user && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProfileMenu(!showProfileMenu);
                  }}
                  className="flex items-center gap-2 p-1 pr-3 rounded-full hover:bg-white border border-slate-200 transition-all active:scale-95 bg-white/50 backdrop-blur-sm"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white overflow-hidden ring-2 ring-white">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-4 h-4" />
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showProfileMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-white text-lg font-bold overflow-hidden ring-4 ring-white shadow-sm">
                            {user.photoURL ? (
                              <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span>{user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}</span>
                            )}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="font-semibold text-slate-900 truncate">
                              {user.displayName || 'Anonymous User'}
                            </p>
                            <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-100 inline-block">
                          Connected Account
                        </div>
                      </div>

                      <div className="p-3 space-y-2">
                        {!token && (
                          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                            <div className="flex items-center gap-2 mb-2">
                              <Database className="w-3.5 h-3.5 text-amber-600" />
                              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Access Expired</p>
                            </div>
                            <button 
                              onClick={handleLogin}
                              className="w-full text-center text-[10px] bg-amber-600 text-white py-1.5 rounded-lg hover:bg-amber-700 transition-colors font-bold shadow-sm"
                            >
                              Reconnect Workspace
                            </button>
                          </div>
                        )}

                        {spreadsheetId && (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Sheet</p>
                              </div>
                              <button 
                                onClick={() => setSpreadsheetId(null)}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                                title="Unlink Spreadsheet"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="text-[10px] font-mono text-slate-400 truncate bg-white p-1.5 rounded border border-slate-100">{spreadsheetId}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="p-2 border-t border-slate-100">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors font-medium group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                            <LogOut className="w-4 h-4" />
                          </div>
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-6"
            >
              <div className="relative overflow-hidden bg-slate-900 px-8 py-16 sm:p-20 rounded-[2rem] shadow-2xl text-center mt-4">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-1/2 -left-1/4 w-full h-full bg-blue-500/20 blur-[120px] rounded-full"
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], x: [0, -50, 0], y: [0, -30, 0] }}
                    transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -bottom-1/2 -right-1/4 w-full h-full bg-indigo-500/20 blur-[120px] rounded-full"
                  />
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <div className="mb-8 flex justify-center">
                    <div className="w-24 h-24 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center border border-white/20 shadow-2xl p-4 overflow-hidden">
                      <img src="/icon.svg" alt="App Icon" className="w-full h-full object-contain" />
                    </div>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-white tracking-tight">Sync Gboard to Google Sheets</h2>
                  <p className="text-slate-300 mb-8 max-w-xl mx-auto leading-relaxed text-lg">
                    Automatically extract, combine, and backup all your Android Gboard user dictionary words across multiple devices directly into a centralized Google Spreadsheet.
                  </p>
                  
                  <div className="mb-8">
                    <Link
                      to="/about"
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-500/10 text-blue-300 hover:text-blue-200 hover:bg-blue-500/20 font-medium rounded-full transition-all border border-blue-500/20"
                    >
                      <Info className="w-4 h-4" />
                      About This App
                    </Link>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full sm:w-auto">
                    <button
                      onClick={handleLogin}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] active:scale-95"
                    >
                      Sign in with Google
                    </button>
                    <Link
                      to="/docs"
                      className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-white/5 text-white font-medium rounded-xl hover:bg-white/10 border border-white/10 transition-all backdrop-blur-sm active:scale-95"
                    >
                      Technical Details
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 mt-4"
            >
              <div className="flex border-b border-slate-100 mb-[1px]">
                <Link
                  to="/"
                  className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'import' 
                      ? 'border-slate-900 text-slate-900' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Search & Import
                </Link>
                <Link
                  to="/merged"
                  className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'merged' 
                      ? 'border-slate-900 text-slate-900' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Merged View
                </Link>
              </div>

              {activeTab === 'import' && (
                <>
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
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-50 text-blue-700 font-medium rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 border border-blue-100 mt-4"
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

                  {error && (
                    <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  {result && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white px-[1px] pt-[1px] pb-8 rounded-2xl shadow-sm border border-slate-200 mt-4"
                    >
                      <h3 className="text-lg font-semibold mb-4 px-4 pt-4">Import Summary</h3>
                      <p className="text-slate-600 mb-6 px-4">{result.message}</p>
                      
                      {result.spreadsheetUrl && (
                        <div className="px-4">
                          <a 
                            href={result.spreadsheetUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium text-sm mb-6"
                          >
                            View Spreadsheet <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      )}

                      {result.results && result.results.length > 0 && (
                        <div className="border-t border-slate-100 pt-6 px-4">
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
                                      {file.zipInnerFileName && (
                                        <p className="text-[11px] text-slate-500 mt-1 truncate">
                                          Inside ZIP: <span className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">{file.zipInnerFileName}</span>
                                        </p>
                                      )}
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
                                      <button
                                        onClick={async () => {
                                          try {
                                            const res = await fetch('/api/debug-zip', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ fileId: file.fileId, token })
                                            });
                                            const data = await res.json();
                                            if (data.lines) {
                                              setDebugInfo("First lines of dictionary.txt:\n" + data.lines.join('\n') + "\n\nHEX:\n" + data.hex);
                                            } else {
                                              setDebugInfo("Debug error: " + JSON.stringify(data));
                                            }
                                          } catch(e: any) {
                                            setDebugInfo("Error: " + e.message);
                                          }
                                        }}
                                        className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                        title="Debug raw content"
                                      >
                                        <Search className="w-4 h-4" />
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
              )}

              {activeTab === 'merged' && (
                <div className="bg-white px-[1px] pt-[1px] pb-8 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-[1px] px-7 pt-[1px]">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mt-4">Merged Dictionary</h3>
                      <p className="text-sm text-slate-500">Combined records from all sheets (duplicates removed)</p>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <button
                        onClick={handleDownloadZip}
                        disabled={loadingMerged || mergedRecords.length === 0}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:ring-2 focus:ring-slate-900 focus:ring-offset-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download as ZIP"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      <button
                        onClick={fetchMergedRecords}
                        disabled={loadingMerged}
                        className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                        title="Refresh Merged View"
                      >
                        <RefreshCcw className={`w-5 h-5 ${loadingMerged ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {loadingMerged ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <p className="text-sm">Merging records from Sheets...</p>
                    </div>
                  ) : mergedRecords.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-4 px-7 mb-4 mt-4 items-center">
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={noReadingFilter} 
                            onChange={(e) => setNoReadingFilter(e.target.checked)} 
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" 
                          />
                          No reading (読み無し)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="font-medium text-slate-500">Language:</span>
                          <select 
                            value={languageFilter} 
                            onChange={(e) => setLanguageFilter(e.target.value)} 
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-slate-900 focus:border-slate-900"
                          >
                            <option value="ALL">All</option>
                            {availableLanguages.map(lang => (
                              <option key={lang} value={lang}>{lang === '' ? '(Unspecified)' : lang}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="font-medium text-slate-500">Part of Speech:</span>
                          <select 
                            value={posFilter} 
                            onChange={(e) => setPosFilter(e.target.value)} 
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-slate-900 focus:border-slate-900"
                          >
                            <option value="ALL">All</option>
                            {availablePartsOfSpeech.map(pos => (
                              <option key={pos} value={pos}>{pos === '' ? '(Unspecified)' : pos}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="border border-slate-100 rounded-xl overflow-hidden mx-4 sm:mx-7 mb-2">
                        <div className="overflow-x-auto max-h-[60vh]">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0">
                              <tr>
                                <th className="px-4 py-[1px] whitespace-nowrap">Reading (よみ)</th>
                                <th className="px-4 py-[1px] whitespace-nowrap">Word (単語)</th>
                                <th className="px-4 py-[1px] whitespace-nowrap">Language</th>
                                <th className="px-4 py-[1px] whitespace-nowrap">Part of Speech</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filteredRecords.length > 0 ? (
                                filteredRecords.map((row, idx) => (
                                  <tr 
                                    key={idx} 
                                    className="hover:bg-slate-50/50 transition-colors"
                                  >
                                    <td className="px-4 py-[1px] font-medium text-slate-900 whitespace-nowrap">
                                      {row[0] || <span className="text-slate-400 italic font-normal">None</span>}
                                    </td>
                                    <td className="px-4 py-[1px] text-slate-700 whitespace-nowrap">
                                      {row[1] || <span className="text-slate-400 italic font-normal">None</span>}
                                    </td>
                                    <td className="px-4 py-[1px] text-slate-500 whitespace-nowrap">{row[2]}</td>
                                    <td className="px-4 py-[1px] text-slate-400 whitespace-nowrap">{row[3]}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={4} className="px-4 py-12 text-center text-slate-500 bg-slate-50/50">
                                    No records match the current filters.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex justify-between">
                          <span>Total records: {mergedRecords.length}</span>
                          {filteredRecords.length !== mergedRecords.length && (
                            <span className="text-blue-600">Showing {filteredRecords.length} matching</span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 mt-4 mx-4">
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
      
      {debugInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-900">Debug Info</h3>
              <button onClick={() => setDebugInfo(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <pre className="text-[10px] font-mono text-slate-700 whitespace-pre-wrap break-all bg-slate-100 p-3 rounded-lg border border-slate-200">
                {debugInfo}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/merged" element={<AppContent />} />
        <Route path="/docs" element={<FormatDocs />} />
        <Route path="/about" element={<AboutApp />} />
      </Routes>
    </BrowserRouter>
  );
}

