import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to handle the merge process
  app.post("/api/merged-records", async (req, res) => {
    const { accessToken, spreadsheetId } = req.body;
    if (!accessToken || !spreadsheetId) {
      return res.status(400).json({ error: "Missing access token or spreadsheet ID" });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: "v4", auth });

    try {
      // 1. Get all sheet titles
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetTitles = (spreadsheet.data.sheets || [])
        .map(s => s.properties?.title)
        .filter((t): t is string => !!t);

      if (sheetTitles.length === 0) {
        return res.json({ records: [] });
      }

      // 2. Batch get all values
      const ranges = sheetTitles.map(title => `${title}!A1:D10000`);
      const batchRes = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
      });

      const allRows: string[][] = [];
      const seen = new Set<string>();

      (batchRes.data.valueRanges || []).forEach(range => {
        if (!range.values) return;
        
        range.values.forEach(row => {
          // Normalize row to 4 columns
          const normalized = [
            row[0] || "",
            row[1] || "",
            row[2] || "",
            row[3] || ""
          ].map(s => String(s).trim());

          // Create a unique key for de-duplication
          const key = JSON.stringify(normalized);
          if (!seen.has(key)) {
            seen.add(key);
            allRows.push(normalized);
          }
        });
      });

      res.json({ records: allRows });
    } catch (err: any) {
      console.error("Merge error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // API to handle the import process
  app.post("/api/import", async (req, res) => {
    const { accessToken, spreadsheetId: providedSpreadsheetId, fileIds } = req.body;
    if (!accessToken) {
      return res.status(401).json({ error: "Missing access token" });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    try {
      // 1. Search for files containing "Personal" and "Dictionary" in the name
      const searchRes = await drive.files.list({
        q: "name contains 'Personal' and name contains 'Dictionary' and trashed = false",
        fields: "files(id, name, mimeType, modifiedTime, size)",
      });

      // Filter for zip files specifically in JS for better control
      let files = (searchRes.data.files || []).filter(f => 
        f.name?.toLowerCase().endsWith('.zip') || 
        f.mimeType === 'application/zip' ||
        f.mimeType === 'application/x-zip-compressed'
      );

      // Filter by requested fileIds if provided
      if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
        files = files.filter(f => f.id && fileIds.includes(f.id));
      }

      if (files.length === 0) {
        return res.json({ message: "No matching dictionary zip files found.", results: [] });
      }

      // 2. Use provided spreadsheet or create a new one
      let spreadsheetId = providedSpreadsheetId;
      if (!spreadsheetId) {
        const spreadsheetName = `Gboard Dictionaries Import ${new Date().toISOString().split('T')[0]}`;
        const createSpreadsheetRes = await sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: spreadsheetName,
            },
          },
        });
        spreadsheetId = createSpreadsheetRes.data.spreadsheetId;
      }

      if (!spreadsheetId) {
        throw new Error("Failed to resolve spreadsheet ID");
      }

      // Fetch existing sheet titles to avoid duplicates
      const sheetMetadata = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(title))",
      });
      const existingSheetTitles = new Set(
        sheetMetadata.data.sheets?.map(s => s.properties?.title).filter(Boolean) || []
      );

      const importResults = [];
      const sheetsToAdd = files.filter(f => f.id && !existingSheetTitles.has(f.id));

      // 3. Batch add all necessary sheets at once
      if (sheetsToAdd.length > 0) {
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: sheetsToAdd.map(f => ({
                addSheet: {
                  properties: {
                    title: f.id,
                  },
                },
              })),
            },
          });
        } catch (err: any) {
          console.warn("Batch add sheets warning (some might already exist or concurrent error):", err.message);
        }
      }

      // 4. Process each zip file
      for (const file of files) {
        if (!file.id) continue;

        const fileMetadata = {
          fileId: file.id,
          fileName: file.name,
          modifiedTime: file.modifiedTime,
          size: file.size,
        };

        try {
          // Clear existing content first to ensure clean overwrite
          await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${file.id}!A1:Z10000`, 
          });

          // Download zip
          const zipRes = await drive.files.get(
            { fileId: file.id, alt: "media" },
            { responseType: "arraybuffer" }
          );

          const zipBuffer = Buffer.from(zipRes.data as ArrayBuffer);
          const zip = new AdmZip(zipBuffer);
          const zipEntries = zip.getEntries();

          // One zip file has one CSV
          const csvEntry = zipEntries[0];
          if (!csvEntry) {
            importResults.push({ fileId: file.id, status: "error", message: "No content in zip" });
            continue;
          }

          const csvContent = csvEntry.getData().toString("utf8");
          
          // Gboard dictionaries are primarily TSV. We prioritize TSV parsing.
          let tsvRecords: string[][] = [];
          let csvRecords: string[][] = [];

          try {
            tsvRecords = parse(csvContent, {
              delimiter: '\t',
              skip_empty_lines: true,
              relax_column_count: true,
            });
          } catch (e) {}

          try {
            csvRecords = parse(csvContent, {
              delimiter: ',',
              skip_empty_lines: true,
              relax_column_count: true,
            });
          } catch (e) {}

          // Determine which one is better. 
          // If TSV parsing results in at least 2 columns (Reading and Word), we favor it.
          const getColCount = (recs: string[][]) => recs.length > 0 ? Math.max(...recs.map(r => r.length), 0) : 0;
          const tsvCols = getColCount(tsvRecords);
          const csvCols = getColCount(csvRecords);

          // Favor TSV if it looks valid (>= 2 columns), otherwise fallback to the one with more columns
          let records = (tsvCols >= 2) ? tsvRecords : (csvCols > tsvCols ? csvRecords : tsvRecords);
          
          // Filter out comment lines (usually start with #)
          records = records.filter(row => row.length > 0 && !row[0].startsWith('#'));

          // Validate column count
          const finalMaxCols = getColCount(records);
          if (finalMaxCols < 2) {
            importResults.push({ 
              fileId: file.id, 
              status: "error", 
              message: `Invalid format: Expected at least 2 columns (Reading and Word), found ${finalMaxCols}.` 
            });
            continue;
          }

          if (finalMaxCols > 4) {
            importResults.push({ 
              fileId: file.id, 
              status: "error", 
              message: `Invalid format: Unexpected columns found (maximum 4 allowed, found ${finalMaxCols}).` 
            });
            continue;
          }

          // Write data to the new sheet
          const sheetName = file.id;
          if (records.length > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetName}!A1`,
              valueInputOption: "RAW",
              requestBody: {
                values: records,
              },
            });

            // Small delay to prevent hitting rate limits
            if (files.length > 5) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          importResults.push({ ...fileMetadata, zipInnerFileName: csvEntry.entryName, status: "imported", rows: records.length });
        } catch (fileErr: any) {
          console.error(`Error processing file ${file.id}:`, fileErr.message);
          importResults.push({ ...fileMetadata, status: "error", message: fileErr.message });
        }
      }

      res.json({
        message: "Import completed",
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        results: importResults,
      });

    } catch (error: any) {
      console.error("Import error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/debug-zip", express.json(), async (req, res) => {
    try {
      const { fileId, token } = req.body;
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!driveRes.ok) throw new Error("Drive fetch failed");
      const AdmZip = (await import('adm-zip')).default;
      const arrayBuffer = await driveRes.arrayBuffer();
      const zip = new AdmZip(Buffer.from(arrayBuffer));
      const csvEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith(".txt"));
      if (!csvEntry) return res.json({ error: "No text file" });
      const content = csvEntry.getData().toString("utf8");
      const hex = content.substring(0, 100).split('').map((c: string) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
      res.json({ lines: content.split('\n').slice(0, 10), hex });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
