import express from "express";
import qrcode from "qrcode";
import { Client, LocalAuth } from "whatsapp-web.js";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 443;

app.use(express.static("public"));
app.use(express.json());

// === GOOGLE SHEETS SETUP ===
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.SHEET_ID;

// === WHATSAPP SETUP ===
let qrCodeData = "";
let isReady = false;
let totalChat = 0;
let client;

function initWhatsApp() {
  client = new Client({ authStrategy: new LocalAuth() });

  client.on("qr", async (qr) => {
    qrCodeData = await qrcode.toDataURL(qr);
    isReady = false;
    console.log("🔄 QR baru siap discan.");
  });

  client.on("ready", async () => {
    isReady = true;
    const chats = await client.getChats();
    totalChat = chats.length;
    console.log(`✅ WhatsApp siap! Total chat: ${totalChat}`);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:B",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[new Date().toLocaleString(), totalChat]] },
    });
  });

  client.initialize();
}

initWhatsApp();

// === ROUTES ===
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/qr", async (req, res) => {
  if (!qrCodeData) return res.status(200).send("QR belum siap, refresh halaman.");
  res.json({ qr: qrCodeData });
});

app.get("/status", (req, res) => res.json({ connected: isReady }));

app.get("/total", (req, res) => res.json({ totalChat }));

app.post("/disconnect", async (req, res) => {
  if (client) {
    await client.logout();
    client.destroy();
    initWhatsApp();
    res.json({ message: "🔴 Disconnected! QR baru siap di halaman utama." });
  } else {
    res.status(400).json({ message: "Client belum aktif." });
  }
});

app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));
