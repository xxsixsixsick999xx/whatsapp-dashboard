// =====================================================
// ✅ WHATSAPP DASHBOARD FINAL MULTI-SHEET VERSION
// =====================================================

import express from "express";
import qrcode from "qrcode";
import { google } from "googleapis";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

// =====================================================
// 🔐 GOOGLE SHEETS CONFIG
// =====================================================
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.SHEET_ID;

// =====================================================
// 🤖 WHATSAPP CLIENT CONFIG
// =====================================================
let qrCodeData = "";
let isReady = false;
let totalChat = 0;
let client;

async function initWhatsApp() {
  console.log("🚀 Inisialisasi WhatsApp Client...");

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./.auth" }),
    puppeteer: {
      headless: true,
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
    },
  });

  client.on("qr", async (qr) => {
    qrCodeData = await qrcode.toDataURL(qr);
    isReady = false;
    console.log("🔄 QR baru siap discan.");
  });

  client.on("ready", async () => {
    isReady = true;
    console.log("✅ WhatsApp tersambung. Mengambil daftar chat...");

    try {
      // Tunggu agar WhatsApp sempat load semua chat
      await new Promise((r) => setTimeout(r, 3000));

      const chats = await client.getChats();
      totalChat = chats.length;
      console.log(`📊 Total chat terbaca: ${totalChat}`);

      // Simpan ke dua sheet: Sheet1 dan Sheet67
      const values = [[new Date().toLocaleString("id-ID"), totalChat]];
      const targets = ["Sheet1!A:B", "Sheet67!A:B"];

      for (const range of targets) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values },
        });
        console.log(`✅ Data berhasil disimpan ke ${range}`);
      }
    } catch (err) {
      console.error("❌ Gagal membaca chat atau menulis ke Sheets:", err.message);
    }
  });

  client.on("disconnected", () => {
    console.log("🔴 WhatsApp terputus. Membuat QR baru...");
    qrCodeData = "";
    isReady = false;
    initWhatsApp();
  });

  client.initialize();
}

initWhatsApp();

// =====================================================
// 🌐 ROUTES
// =====================================================

// Halaman utama (QR)
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// API: ambil QR
app.get("/qr", async (req, res) => {
  if (!qrCodeData)
    return res.status(200).json({ status: "loading", message: "QR belum siap, silakan refresh." });
  res.json({ qr: qrCodeData });
});

// API: cek status koneksi
app.get("/status", (req, res) => res.json({ connected: isReady }));

// API: total chat
app.get("/total", (req, res) => res.json({ totalChat }));

// API: disconnect manual
app.post("/disconnect", async (req, res) => {
  try {
    if (client) {
      await client.logout();
      client.destroy();
      qrCodeData = "";
      isReady = false;
      initWhatsApp();
      res.json({ message: "🔴 WhatsApp telah diputus. QR baru siap di halaman utama." });
    } else {
      res.status(400).json({ message: "❌ Client belum aktif." });
    }
  } catch (err) {
    console.error("❌ Gagal disconnect:", err.message);
    res.status(500).json({ message: "Terjadi kesalahan saat disconnect." });
  }
});

// =====================================================
// 🚀 Jalankan Server
// =====================================================
app.listen(PORT, () => console.log(`✅ Server aktif di port ${PORT}`));
