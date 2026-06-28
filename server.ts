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

  // API to handle the import process
  app.post("/api/import", async (req, res) => {
    const { accessToken, spreadsheetId: providedSpreadsheetId } = req.body;
    if (!accessToken) {
      return res.status(401).json({ error: "Missing access token" });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    try {
      // 1. Search for "Personal Dictionary.zip"
      const searchRes = await drive.files.list({
        q: "name = 'Personal Dictionary.zip' and trashed = false",
        fields: "files(id, name)",
      });

      const files = searchRes.data.files || [];
      if (files.length === 0) {
        return res.json({ message: "No Personal Dictionary.zip files found." });
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

      // 3. Process each zip file
      for (const file of files) {
        if (!file.id) continue;

        // Skip if already imported in this spreadsheet (to respect user's ID logic)
        if (existingSheetTitles.has(file.id)) {
          importResults.push({ fileId: file.id, status: "skipped", message: "Sheet already exists" });
          continue;
        }

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
        if (!csvEntry) continue;

        const csvContent = csvEntry.getData().toString("utf8");
        
        let records: string[][] = [];
        try {
          records = parse(csvContent, {
            skip_empty_lines: true,
            relax_column_count: true,
          });
        } catch (e) {
           records = parse(csvContent, {
            delimiter: '\t',
            skip_empty_lines: true,
            relax_column_count: true,
          });
        }

        // Add a new sheet named after the file ID
        const sheetName = file.id;
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  addSheet: {
                    properties: {
                      title: sheetName,
                    },
                  },
                },
              ],
            },
          });
        } catch (err: any) {
          // If concurrent or some other error, log it but keep going if title exists
          console.warn(`Could not add sheet ${sheetName}:`, err.message);
        }

        // Write data to the new sheet
        if (records.length > 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: "RAW",
            requestBody: {
              values: records,
            },
          });
        }

        importResults.push({ fileId: file.id, status: "imported", rows: records.length });
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
