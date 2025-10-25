import express from "express";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { google } from "googleapis";

const { Client, LocalAuth } = pkg;
const app = express();
const PORT = process.env.PORT || 3000;

// =============== GOOGLE SHEETS CONFIG =====================
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const SHEET_ID = process.env.SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// =============== WHATSAPP CLIENT ==========================
let currentUser = "";

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ["--no-sandbox"] },
});

let qrCodeCurrent = "";

client.on("qr", qr => {
  qrCodeCurrent = qr;
  console.log("QR siap discan di website!");
});

client.on("ready", async () => {
  console.log("✅ WhatsApp Connected, membaca daftar chat...");

  try {
    const chats = await client.getChats();
    const contacts = [
      ...new Set(
        chats
          .filter(c => c.id.user && !c.isGroup)
          .map(c => c.id.user)
      ),
    ];
    if (contacts.length === 0) {
      console.log("⚠️ Tidak ada chat ditemukan, tidak diinput ke Sheet.");
      return;
    }

    const contactsList = contacts.join(", ");
    const time = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    });

    // baca isi sheet dulu
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:B",
    });
    const rows = res.data.values || [];
    const existingRowIndex = rows.findIndex(r => r[0] === currentUser);

    if (existingRowIndex !== -1) {
      // update baris
      const rowNumber = existingRowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Sheet1!A${rowNumber}:B${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[currentUser, contactsList]] },
      });
      console.log(`🔁 Update data ${currentUser} (${contacts.length} kontak)`);
    } else {
      // tambah baris baru
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "Sheet1!A:B",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[currentUser, contactsList]] },
      });
      console.log(`✅ Tambah data ${currentUser} (${contacts.length} kontak)`);
    }
  } catch (err) {
    console.error("❌ Gagal menyimpan ke Google Sheet:", err);
  }
});

// ===========================================================
app.use(express.static("public"));
app.use(express.json());

app.get("/qr", (req, res) => {
  if (!qrCodeCurrent) return res.json({ status: "waiting" });
  res.json({ qr: qrCodeCurrent });
});

app.post("/login", (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).send("Nama diperlukan");
  currentUser = name;
  res.redirect("/scan.html");
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
  client.initialize();
});
