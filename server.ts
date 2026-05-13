import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory OTP store (for production, use Redis or Firestore)
const otpStore = new Map<string, { code: string; expires: number }>();

// API Routes
app.post("/api/admin/send-otp", async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

  otpStore.set(phoneNumber, { code: otp, expires });

  console.log("------------------------------------------");
  console.log(`| OTP for ${phoneNumber}: ${otp} |`);
  console.log("------------------------------------------");

  // Try to send real SMS via Twilio
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();

  if (accountSid && authToken && fromNumber) {
    if (!accountSid.startsWith('AC') || accountSid.length !== 34) {
      console.warn("WARNING: TWILIO_ACCOUNT_SID does not appear to be a valid SID (should start with 'AC' and be 34 characters).");
    }
    try {
      const client = twilio(accountSid, authToken);
      await client.messages.create({
        body: `Your QR Attendance System Admin OTP is: ${otp}. Valid for 5 minutes.`,
        from: fromNumber,
        to: phoneNumber
      });
      return res.json({ success: true, message: "OTP sent to your mobile" });
    } catch (error: any) {
      console.error("Twilio Error:", error);
      let errorMessage = "Failed to send SMS via Twilio. ";
      
      if (error.code === 20003) {
        errorMessage = "Twilio Authentication Failed: Your Account SID or Auth Token is incorrect. Please verify them in the Settings menu.";
      } else if (error.code === 21606) {
        errorMessage = "Twilio Error: The 'From' phone number (" + fromNumber + ") is not registered to your account.";
      } else {
        errorMessage += error.message || "Unknown Twilio error.";
      }

      return res.status(500).json({ 
        error: errorMessage,
        debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
      });
    }
  }

  // Fallback for development/missing credentials
  res.json({ 
    success: true, 
    message: "SMS provider not configured. OTP logged to console.",
    debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
  });
});

app.post("/api/admin/verify-otp", async (req, res) => {
  const { phoneNumber, otp } = req.body;

  const stored = otpStore.get(phoneNumber);

  if (!stored) {
    return res.status(400).json({ error: "No OTP requested for this phone number" });
  }

  if (Date.now() > stored.expires) {
    otpStore.delete(phoneNumber);
    return res.status(400).json({ error: "OTP expired" });
  }

  if (stored.code !== otp) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  // Success!
  otpStore.delete(phoneNumber);
  res.json({ success: true, message: "Logged in successfully" });
});

// Vite middleware setup
async function setupVite() {
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
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

setupVite();
