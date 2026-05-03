const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const FormData = require("form-data");

admin.initializeApp();

const META_GRAPH_VERSION = "v20.0";

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function normalizeWhatsappPhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

async function assertAdmin(req) {
  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("missing_auth_token");
  const decoded = await admin.auth().verifyIdToken(token);
  const userSnap = await admin.firestore().collection("Users").doc(decoded.uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  if (user.role !== "admin" && user.isAdmin !== true && decoded.email !== "admin@tofik.com") {
    throw new Error("admin_only");
  }
  return decoded;
}

async function uploadWhatsappMedia({ accessToken, phoneNumberId, pdfBuffer, filename }) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", pdfBuffer, {
    filename,
    contentType: "application/pdf"
  });

  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...form.getHeaders()
    },
    body: form
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    logger.error("WhatsApp media upload failed", body);
    throw new Error("whatsapp_media_upload_failed");
  }
  return body.id;
}

async function sendWhatsappDocument({ accessToken, phoneNumberId, to, mediaId, filename, caption }) {
  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document: {
        id: mediaId,
        filename,
        caption: String(caption || "").slice(0, 1024)
      }
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.error("WhatsApp document send failed", body);
    throw new Error("whatsapp_document_send_failed");
  }
  return body;
}

exports.sendInvoiceWhatsapp = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "512MiB",
    secrets: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]
  },
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    try {
      const adminUser = await assertAdmin(req);
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!accessToken || !phoneNumberId) throw new Error("missing_whatsapp_business_config");

      const { to, filename, pdfBase64, caption, invoiceNumber, invoiceId } = req.body || {};
      const normalizedTo = normalizeWhatsappPhone(to);
      if (!normalizedTo || !pdfBase64) throw new Error("missing_required_payload");

      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      if (!pdfBuffer.length || pdfBuffer.length > 15 * 1024 * 1024) throw new Error("invalid_pdf_size");

      const safeFilename = String(filename || `${invoiceNumber || "invoice"}.pdf`).replace(/[^\w.\-]+/g, "_");
      const mediaId = await uploadWhatsappMedia({
        accessToken,
        phoneNumberId,
        pdfBuffer,
        filename: safeFilename
      });
      const result = await sendWhatsappDocument({
        accessToken,
        phoneNumberId,
        to: normalizedTo,
        mediaId,
        filename: safeFilename,
        caption
      });

      await admin.firestore().collection("WhatsappInvoiceSends").add({
        invoiceId: invoiceId || "",
        invoiceNumber: invoiceNumber || "",
        to: normalizedTo,
        mediaId,
        whatsappResponse: result,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        sentBy: adminUser.email || adminUser.uid,
        status: "sent"
      });

      res.json({ ok: true, whatsapp: result });
    } catch (error) {
      logger.error("sendInvoiceWhatsapp failed", error);
      res.status(400).json({ ok: false, error: error.message || "send_failed" });
    }
  }
);
