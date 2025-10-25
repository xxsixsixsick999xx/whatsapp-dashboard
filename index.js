// ===============================
// 📦 WHATSAPP DASHBOARD FINAL VERSION
// ===============================

import express from "express";
import qrcode from "qrcode";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

// ===============================
// 🔐 GOOGLE SHEETS CONFIG
// ===============================
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.SHEET_ID;

// ===============================
// 🤖 WHATSAPP CLIENT CONFIG
// ===============================
let qrCodeData = "";
let isReady = false;
let totalChat = 0;
let client;

function initWhatsApp() {
  console.log("🚀 Inisialisasi WhatsApp Client...");
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  });

  // Saat QR muncul
  client.on("qr", async (qr) => {
    qrCodeData = await qrcode.toDataURL(qr);
    isReady = false;
    console.log("🔄 QR baru siap discan.");
  });

  // Saat berhasil login
  client.on("ready", async () => {
    isReady = true;
    console.log("✅ WhatsApp tersambung.");

    // Hitung total chat dan tulis ke Google Sheets
    const chats = await client.getChats();
    totalChat = chats.length;
    console.log(`📊 Total chat terbaca: ${totalChat}`);

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "Sheet1!A:B",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[new Date().toLocaleString("id-ID"), totalChat]],
        },
      });
      console.log("✅ Data berhasil disimpan ke Google Sheets.");
    } catch (err) {
      console.error("❌ Gagal menyimpan ke Google Sheets:", err.message);
    }
  });

  // Saat logout atau error
  client.on("disconnected", () => {
    console.log("🔴 WhatsApp terputus, membuat QR baru...");
    qrCodeData = "";
    isReady = false;
    initWhatsApp();
  });

  client.initialize();
}

initWhatsApp();

// ===============================
// 🌐 ROUTES
// ===============================

// Halaman utama (QR)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API: ambil QR
app.get("/qr", async (req, res) => {
  if (!qrCodeData) {
    return res.status(200).json({ status: "loading", message: "QR belum siap, silakan refresh halaman." });
  }
  res.json({ qr: qrCodeData });
});

// API: cek status koneksi
app.get("/status", (req, res) => {
  res.json({ connected: isReady });
});

// API: total chat
app.get("/total", (req, res) => {
  res.json({ totalChat });
});

// API: disconnect
app.post("/disconnect", async (req, res) => {
  try {
    if (client) {
      await client.logout();
      client.destroy();
      qrCodeData = "";
      isReady = false;
      initWhatsApp();
      res.json({ message: "🔴 WhatsApp telah diputus, QR baru siap di halaman utama." });
    } else {
      res.status(400).json({ message: "❌ Client belum aktif." });
    }
  } catch (err) {
    console.error("❌ Gagal disconnect:", err.message);
    res.status(500).json({ message: "Terjadi kesalahan saat disconnect." });
  }
});

// ===============================
// 🚀 Jalankan Server
// ===============================
app.listen(PORT, () => console.log(`✅ Server aktif di port ${PORT}`));
