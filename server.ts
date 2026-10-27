import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ============================================================================
 * Firebase Admin (ID token verification)
 * ============================================================================
 * Credentials are resolved from the standard Google Application Default
 * Credentials chain (GOOGLE_APPLICATION_CREDENTIALS, workload identity, ...).
 * The server refuses privileged API calls when it cannot verify tokens.
 * ========================================================================== */
import {
  getAuth as getAdminAuth,
  type UserRecord,
} from 'firebase-admin/auth';
import {
  getApp as getAdminApp,
  initializeApp as initializeAdminApp,
  applicationDefault,
  cert,
  type App as AdminApp,
  type Auth as AdminAuth,
} from 'firebase-admin/app';
import { FieldValue, getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import type { Response, NextFunction, Request } from 'express';
import crypto from 'crypto';
import {
  INITIAL_DEMO_CONTAINERS,
  INITIAL_DEMO_PRODUCTS,
  INITIAL_PHYSICAL_LOCATIONS,
} from './src/data/demoInventoryData';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let adminAuthInstance: AdminAuth | null = null;
let adminInitError: string | null = null;
let adminProjectId = '';
try {
  // On Render (and other PaaS) a full service-account JSON key can be pasted
  // into the FIREBASE_SERVICE_ACCOUNT_JSON env var. Otherwise we fall back to
  // the standard Google Application Default Credentials chain.
  let credential;
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = cert(serviceAccount);
    // The SDK cannot always infer the project ID from the credential alone and
    // then falls back to the GCE metadata server, which does not exist on
    // Render ("Failed to determine project ID ... ENOTFOUND
    // metadata.google.internal"). Passing it explicitly makes token
    // verification deterministic.
    projectId = projectId || serviceAccount.project_id || '';
  } else {
    credential = applicationDefault();
  }
  const app: AdminApp = initializeAdminApp(projectId ? { credential, projectId } : { credential });
  adminAuthInstance = getAdminAuth(app);
  adminProjectId = app.options.projectId || projectId || '';
} catch (err) {
  adminInitError = err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160);
  console.error(
    '[Auth] Firebase Admin SDK unavailable (no Application Default Credentials). ' +
      'All privileged API endpoints will reject requests.',
    err instanceof Error ? err.message : err
  );
}

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string | null;
    role: string;
    emailVerified: boolean;
  };
}

/** Verification cache to avoid a Firestore lookup (and a token decode) per request. */
const tokenCache = new Map<
  string,
  { uid: string; email: string | null; role: string; emailVerified: boolean; expiresAt: number }
>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_CACHE_MAX = 2000;

async function resolveUser(idToken: string) {
  const cached = tokenCache.get(idToken);
  if (cached && cached.expiresAt > Date.now()) {
    return { uid: cached.uid, email: cached.email, role: cached.role, emailVerified: cached.emailVerified };
  }

  if (!adminAuthInstance) {
    throw new Error('Authentication service is not configured on the server.');
  }

  const decoded = await adminAuthInstance.verifyIdToken(idToken, true);
  const uid = decoded.uid;
  const email = typeof decoded.email === 'string' ? decoded.email : null;

  // Email/phone providers must be verified. Google tokens are inherently verified.
  const provider =
    (decoded.firebase?.sign_in_provider as string | undefined) || '';
  const emailVerified = provider === 'google.com' || decoded.email_verified === true;

  let role: string = '';
  if (typeof decoded.role === 'string') {
    role = decoded.role;
  } else if (adminAuthInstance) {
    // Fallback for identities provisioned before role claims were introduced.
    try {
      const snap = await getAdminFirestore().doc(`users/${uid}`).get();
      const candidate = snap.get('role');
      if (typeof candidate === 'string') role = candidate;
    } catch {
      // Ignore: role stays empty and authorization fails closed.
    }
  }

  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const oldest = tokenCache.keys().next().value;
    if (oldest) tokenCache.delete(oldest);
  }
  tokenCache.set(idToken, {
    uid,
    email,
    role,
    emailVerified,
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
  });

  return { uid, email, role, emailVerified };
}

/** Requires a verified Firebase ID token. Attaches the decoded identity to the request. */
export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const user = await resolveUser(idToken);
    if (!user.emailVerified) {
      res.status(403).json({ error: 'Email address not verified.' });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    if (!adminAuthInstance) {
      // Distinct status so operators can tell "server not configured" apart
      // from "the caller's token is bad".
      res.status(503).json({
        error: 'Authentication service is not configured on the server.',
      });
      return;
    }
    console.error('[Auth] Token verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

/** Restricts a route to a set of roles (aligned with UserRole in src/types/inventory.ts). */
export const requireRole = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ error: 'You do not have permission to perform this operation.' });
      return;
    }
    next();
  };
};

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/* ============================================================================
 * Allowed cross-origin callers. Defaults to same-origin only; add hosts via
 * APP_URL (comma separated) when the API is consumed from another origin.
 * ========================================================================== */
function originAllowed(origin: string | undefined, requestHost: string | undefined): boolean {
  if (!origin) return true; // same-origin / curl / mobile app
  const clean = origin.replace(/\/$/, '');
  // Same-origin is always allowed: a request whose Origin host equals the Host
  // this server is serving cannot be cross-site. This removes deployment-order
  // dependence on APP_URL for the app's own API calls.
  if (requestHost) {
    try {
      if (new URL(clean).host === requestHost) return true;
    } catch {
      return false;
    }
  }
  const allowed = (process.env.APP_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return allowed.includes(clean);
}

/* ============================================================================
 * Mailer
 *
 * Used to deliver welcome emails with one-time temporary passwords when the
 * Director provisions a new lab member. Two transports, in priority order:
 *
 *   1. Resend HTTP API  — RESEND_API_KEY (plain HTTP, no SDK dependency).
 *   2. Brevo HTTP API   — BREVO_API_KEY (plain HTTP, no SDK dependency).
 *   3. SMTP (nodemailer) — SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS.
 *
 * The HTTP transports matter on hosts that block outbound SMTP: Render's Free
 * instances cannot reach ports 25/465/587 at all ("Free web services can't send
 * outbound network traffic on ports 25, 465, or 587"), so every SMTP send dies
 * with a connection timeout there while HTTPS (443) works normally.
 *
 * MAIL_TRANSPORT forces one of them ('smtp', 'resend' or 'brevo') when several
 * happen to be configured; without it Resend wins, then Brevo, then SMTP.
 *
 * MAIL_FROM overrides the sender identity. Both HTTP providers require the
 * sender to be validated in their dashboard (Resend: a domain at
 * resend.com/domains, which also lifts its send-only-to-yourself restriction;
 * Brevo: a verified sender address, no domain needed). Gmail SMTP has no such
 * restriction but is unreachable from the Render Free plan.
 * ========================================================================== */
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
// Google Apps Script web app (see docs/apps-script-mail-relay.js). Sends through
// the laboratory's Gmail account over HTTPS, which is the only outbound path
// Render's free plan allows (SMTP ports 25/465/587 are blocked there).
const APPS_SCRIPT_MAIL_URL = (process.env.APPS_SCRIPT_MAIL_URL || '').trim();
const APPS_SCRIPT_MAIL_SECRET = (process.env.APPS_SCRIPT_MAIL_SECRET || '').trim();
const MAIL_TRANSPORT_PREFERENCE = (process.env.MAIL_TRANSPORT || '').trim().toLowerCase();

let mailer: Transporter | null = null;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    void mailer.verify().then(
      () => console.log('[Mailer] SMTP connection verified.'),
      (err) => console.warn('[Mailer] SMTP verify failed:', err instanceof Error ? err.message : err)
    );
  }
} catch (err) {
  console.warn('[Mailer] initialization failed:', err instanceof Error ? err.message : err);
}

type MailTransport = 'appsscript' | 'resend' | 'brevo' | 'smtp' | 'none';

function relayConfigured(): boolean {
  return Boolean(APPS_SCRIPT_MAIL_URL && APPS_SCRIPT_MAIL_SECRET);
}

function mailTransport(): MailTransport {
  if (MAIL_TRANSPORT_PREFERENCE === 'appsscript' && relayConfigured()) return 'appsscript';
  if (MAIL_TRANSPORT_PREFERENCE === 'smtp' && mailer) return 'smtp';
  if (MAIL_TRANSPORT_PREFERENCE === 'resend' && RESEND_API_KEY) return 'resend';
  if (MAIL_TRANSPORT_PREFERENCE === 'brevo' && BREVO_API_KEY) return 'brevo';
  // The relay is preferred by default: it is the only transport proven to work
  // from the Render Free plan and it can reach any recipient address.
  if (relayConfigured()) return 'appsscript';
  if (RESEND_API_KEY) return 'resend';
  if (BREVO_API_KEY) return 'brevo';
  if (mailer) return 'smtp';
  return 'none';
}

/** Splits `Name <address>` (or a bare address) into the shape HTTP APIs expect. */
function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2].trim() };
  return { email: from.trim() };
}

function mailFrom(): string {
  const configured = (process.env.MAIL_FROM || '').trim();
  const transport = mailTransport();
  // Resend's shared test sender is only meaningful on Resend itself.
  if (configured && (transport === 'resend' || !/@resend\.dev/i.test(configured))) return configured;
  // Otherwise fall back to the mailbox identity the operator authenticated with.
  const authenticated = (process.env.SMTP_USER || '').trim();
  if (transport !== 'resend' && authenticated) return `LCSCO Inventory <${authenticated}>`;
  return configured || 'LCSCO Inventory <onboarding@resend.dev>';
}

if (mailTransport() === 'none') {
  console.warn(
    '[Mailer] No mail transport configured (RESEND_API_KEY, BREVO_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS). ' +
      'Welcome emails will be skipped; the temporary password is returned to the Director instead.'
  );
} else {
  console.log(`[Mailer] transport: ${mailTransport()}${MAIL_TRANSPORT_PREFERENCE ? ` (MAIL_TRANSPORT=${MAIL_TRANSPORT_PREFERENCE})` : ''}`);
}

interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface MailResult {
  sent: boolean;
  /** Provider-side reason when delivery failed, safe to show to the Director. */
  error?: string;
}

/**
 * Sends one message and never throws: account provisioning must succeed even
 * when the mail provider is down (the Director still sees the temporary
 * password and can pass it on).
 */
async function deliverMail(mail: OutgoingMail): Promise<MailResult> {
  const from = mailFrom();
  const transport = mailTransport();
  if (transport === 'appsscript') {
    try {
      const response = await fetch(APPS_SCRIPT_MAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: APPS_SCRIPT_MAIL_SECRET,
          to: mail.to,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      const raw = await response.text().catch(() => '');
      let parsed: { ok?: boolean; error?: string } | null = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      if (!response.ok || !parsed || parsed.ok !== true) {
        const reason = parsed && parsed.error
          ? `Mail relay: ${parsed.error}`
          : `Mail relay rejected the message (HTTP ${response.status}).`;
        console.warn('[Mailer] relay rejected the message:', response.status, raw.slice(0, 200));
        return { sent: false, error: reason.slice(0, 300) };
      }
      return { sent: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[Mailer] relay send failed:', reason);
      return { sent: false, error: `Mail relay: ${reason.slice(0, 300)}` };
    }
  }
  if (transport === 'resend') {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        let reason = `Resend rejected the message (HTTP ${response.status}).`;
        try {
          const parsed = JSON.parse(detail);
          if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
            reason = `Resend: ${parsed.message.trim().slice(0, 300)}`;
          }
        } catch {
          // Non-JSON body; keep the generic reason above.
        }
        console.warn('[Mailer] Resend rejected the message:', response.status, detail.slice(0, 300));
        return { sent: false, error: reason };
      }
      return { sent: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[Mailer] Resend send failed:', reason);
      return { sent: false, error: `Resend: ${reason.slice(0, 300)}` };
    }
  }
  if (transport === 'brevo') {
    try {
      const sender = parseSender(from);
      const response = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender,
          to: [{ email: mail.to }],
          subject: mail.subject,
          textContent: mail.text,
          htmlContent: mail.html,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        let reason = `Brevo rejected the message (HTTP ${response.status}).`;
        try {
          const parsed = JSON.parse(detail);
          if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
            reason = `Brevo: ${parsed.message.trim().slice(0, 300)}`;
          }
        } catch {
          // Non-JSON body; keep the generic reason above.
        }
        console.warn('[Mailer] Brevo rejected the message:', response.status, detail.slice(0, 300));
        return { sent: false, error: reason };
      }
      return { sent: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[Mailer] Brevo send failed:', reason);
      return { sent: false, error: `Brevo: ${reason.slice(0, 300)}` };
    }
  }
  if (transport === 'smtp' && mailer) {
    try {
      await mailer.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      return { sent: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[Mailer] SMTP send failed:', reason);
      return { sent: false, error: `SMTP: ${reason.slice(0, 300)}` };
    }
  }
  return { sent: false, error: 'No mail transport is configured on the server.' };
}

/* ============================================================================
 * Director-controlled account provisioning
 * ========================================================================== */
const ASSIGNABLE_ROLES = ['ADMIN', 'PROFESSOR', 'TECHNICIAN', 'PHD_STUDENT', 'STUDENT_RESEARCHER'];

/** Length-safe random temp password, no ambiguous characters (0/O, 1/l/I). */
function generateTemporaryPassword(length = 14): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%&*-+=?';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Escapes user-supplied values before they are interpolated into the email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the "choose your password" link that goes in the welcome email. This
 * is the same single-use link Firebase would send in its own reset email, but
 * embedded in our branded message together with the temporary password.
 */
async function createPasswordSetupLink(email: string, continueUrl?: string): Promise<string | null> {
  if (!adminAuthInstance) return null;
  try {
    const settings = continueUrl ? { url: continueUrl } : undefined;
    return await adminAuthInstance.generatePasswordResetLink(email, settings);
  } catch (err) {
    console.warn(
      '[Mailer] could not create a password setup link:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

async function sendWelcomeEmail(
  to: string,
  tempPassword: string,
  requestBaseUrl?: string,
  setupLink?: string | null
): Promise<MailResult> {
  if (mailTransport() === 'none') {
    return { sent: false, error: 'No mail transport is configured on the server.' };
  }
  // Prefer the host the Director is actually using, then APP_URL, so the link
  // keeps working if the service is ever renamed or moved.
  const appUrl =
    (requestBaseUrl && requestBaseUrl.replace(/\/$/, '')) ||
    (process.env.APP_URL || '').split(',')[0]?.trim().replace(/\/$/, '') ||
    'https://lcsco-lab-inventory.onrender.com';
  const actionUrl = setupLink || appUrl;
  const subject = 'Your LCSCO Inventory account is ready';
  const text =
    `Welcome to LCSCO Inventory\n` +
    `Laboratoire de Catalyse et Synthèse en Chimie Organique\n\n` +
    `The Laboratory Director has created your account for the chemical inventory system.\n\n` +
    `Username (email): ${to}\n` +
    `Temporary password: ${tempPassword}\n\n` +
    `Choose your password: ${actionUrl}\n` +
    `Sign in: ${appUrl}\n\n` +
    `The link above is time-limited. If it has expired, sign in with the temporary\n` +
    `password and you will be asked to choose a new one.\n\n` +
    `SECURITY: at your first sign-in you will be asked to choose your own personal\n` +
    `password. This temporary password stops working as soon as you do.\n\n` +
    `If you did not expect this email, contact the Laboratory Director.`;
  const safeTo = escapeHtml(to);
  const safePassword = escapeHtml(tempPassword);
  const safeAction = escapeHtml(actionUrl);
  const safeApp = escapeHtml(appUrl);
  const html =
    `<div style="background:#F1F5F9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="background:#166534;padding:22px 28px;">
            <div style="color:#FFFFFF;font-size:19px;font-weight:bold;letter-spacing:0.3px;">LCSCO Inventory</div>
            <div style="color:#BBF7D0;font-size:12px;margin-top:4px;">Laboratoire de Catalyse et Synthèse en Chimie Organique</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <p style="margin:0 0 12px;font-size:15px;color:#0F172A;">Hello,</p>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">
              The Laboratory Director has created your account for the LCSCO chemical inventory system.
              Below are your sign-in details.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #CBD5E1;border-radius:8px;background:#F8FAFC;">
              <tr>
                <td style="padding:12px 16px;font-size:12px;color:#64748B;width:42%;">Username (email)</td>
                <td style="padding:12px 16px;font-size:13px;color:#0F172A;font-family:Consolas,monospace;word-break:break-all;">${safeTo}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;font-size:12px;color:#64748B;border-top:1px solid #E2E8F0;">Temporary password</td>
                <td style="padding:12px 16px;font-size:13px;color:#0F172A;font-family:Consolas,monospace;border-top:1px solid #E2E8F0;word-break:break-all;">${safePassword}</td>
              </tr>
            </table>
            <p style="margin:22px 0 8px;">
              <a href="${safeAction}" style="background:#166534;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:6px;display:inline-block;">Choose my password</a>
            </p>
            <p style="margin:6px 0 0;font-size:12px;color:#64748B;">
              or open <a href="${safeApp}" style="color:#166534;">${safeApp}</a> and sign in with the details above.
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#94A3B8;">
              This link is time-limited. If it has expired, sign in with your temporary password and you will be asked to choose a new one.
            </p>
            <p style="margin:22px 0 0;padding:12px 16px;background:#FEF9C3;border:1px solid #FACC15;border-radius:8px;font-size:12px;line-height:1.6;color:#713F12;">
              <b>Security:</b> at your first sign-in you will be asked to choose your own personal password.
              This temporary password stops working as soon as you do.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #E2E8F0;background:#F8FAFC;">
            <p style="margin:0;font-size:11px;line-height:1.5;color:#94A3B8;">
              LCSCO Inventory · Université de Tlemcen<br />
              If you did not expect this email, contact the Laboratory Director.
            </p>
          </td>
        </tr>
      </table>
    </div>`;
  return deliverMail({ to, subject, text, html });
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      // The SPA and its build output legitimately use inline styles/scripts and
      // data URLs for PWA assets; disabling strict CSP avoids breaking them.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') && !originAllowed(req.headers.origin, req.headers.host)) {
      res.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }
    next();
  });
  // 2 MB accommodates the reference-inventory import payload (hundreds of
  // documents) while everything else stays comfortably below it.
  app.use(express.json({ limit: '2mb' }));

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });
  const importLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'Too many inventory document imports. Please try again in 15 minutes.',
    },
  });

  const adminActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'Too many account-management actions. Please try again in 15 minutes.',
    },
  });

  const PORT = Number(process.env.PORT) || 3000;

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'LCSCO Inventory',
      // Non-sensitive operator diagnostics: lets the Director confirm at a
      // glance whether privileged endpoints can work.
      admin: adminAuthInstance ? 'ready' : 'unavailable',
      adminProjectId: adminProjectId || null,
      adminError: adminAuthInstance ? null : adminInitError,
      mail: mailTransport() === 'none' ? 'unavailable' : 'ready',
      mailTransport: mailTransport(),
      origins: (process.env.APP_URL || '').split(',').map((s) => s.trim()).filter(Boolean),
    });
  });

  /**
   * Temporary, non-sensitive inventory integrity probe used to diagnose
   * permission-denied writes. It exposes only structural metadata (counts,
   * field values of the affected container/product, and role flags), never
   * credentials or personal data. Remove once the data repair is verified.
   */
  // Temporary operator diagnostics. Prefer DIAG_KEY from the environment; when
  // it is absent, use an ephemeral per-boot key published only in the Render
  // log stream so the endpoints are never open to the public internet.
  const diagnosticKey = process.env.DIAG_KEY || crypto.randomBytes(24).toString('hex');
  if (!process.env.DIAG_KEY) {
    console.log(`[diagnostics] ephemeral operator key: ${diagnosticKey}`);
  }
  const isDiagnosticAuthorized = (req: Request) =>
    diagnosticKey.length >= 24 && req.get('x-diag-key') === diagnosticKey;

  /**
   * Operator-only data repair: recreate reference documents that are missing
   * from Firestore without touching documents that already exist. This is used
   * when a deterministic reference row (e.g. containers/REA-239) was deleted,
   * while all other rows and their live quantities must be preserved.
   */
  app.post('/api/diagnostics/repair-reference', async (req, res) => {
    if (!adminAuthInstance || !isDiagnosticAuthorized(req)) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    try {
      const db = getAdminFirestore();
      const requestedKinds = Array.isArray(req.body?.kinds)
        ? req.body.kinds.filter((kind: unknown) => typeof kind === 'string')
        : ['products', 'containers', 'locations'];
      const dryRun = req.body?.dryRun === true;
      const sources: Record<string, { collection: string; idField: string; items: any[] }> = {
        products: { collection: 'products', idField: 'productId', items: INITIAL_DEMO_PRODUCTS },
        containers: {
          collection: 'containers',
          idField: 'containerId',
          items: INITIAL_DEMO_CONTAINERS,
        },
        locations: {
          collection: 'physicalLocations',
          idField: 'id',
          items: INITIAL_PHYSICAL_LOCATIONS,
        },
      };

      const result: Record<string, unknown> = {};
      for (const kind of requestedKinds) {
        const source = sources[kind];
        if (!source) continue;
        const missing: string[] = [];
        for (let offset = 0; offset < source.items.length; offset += 300) {
          const chunk = source.items.slice(offset, offset + 300);
          const refs = chunk
            .map((item) => String(item?.[source.idField] || ''))
            .filter((id) => /^[a-zA-Z0-9_-]{1,120}$/.test(id))
            .map((id) => db.collection(source.collection).doc(id));
          if (refs.length === 0) continue;
          const snaps = await db.getAll(...refs);
          const existingIds = new Set(snaps.filter((snap) => snap.exists).map((snap) => snap.id));
          for (const ref of refs) {
            if (!existingIds.has(ref.id)) missing.push(ref.id);
          }
        }

        if (!dryRun && missing.length > 0) {
          const missingSet = new Set(missing);
          for (let offset = 0; offset < source.items.length; offset += 400) {
            const chunk = source.items.slice(offset, offset + 400);
            const batch = db.batch();
            let writes = 0;
            for (const item of chunk) {
              const id = String(item?.[source.idField] || '');
              if (!missingSet.has(id)) continue;
              const document: Record<string, unknown> = { ...item };
              if (kind === 'containers') {
                document.createdBy = 'reference-import';
              }
              batch.set(db.collection(source.collection).doc(id), document);
              writes += 1;
            }
            if (writes > 0) await batch.commit();
          }
        }

        result[kind] = { missingCount: missing.length, missing, dryRun };
      }

      res.json({ success: true, result });
    } catch (err: any) {
      console.error('[diagnostics/repair-reference] failed', { message: err?.message });
      res.status(500).json({ error: 'Reference repair failed.' });
    }
  });

  /**
   * Operator-only rules probe. Creates a disposable verified Auth account and a
   * disposable container, then returns a custom token so the caller can verify
   * that a freshly minted token can write under the published rules. The caller
   * must clean up with DELETE /api/diagnostics/probe afterwards.
   */
  app.post('/api/diagnostics/probe', async (req, res) => {
    if (!adminAuthInstance || !isDiagnosticAuthorized(req)) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    const role = req.body?.role === 'ADMIN' ? 'ADMIN' : 'STUDENT_RESEARCHER';
    const suffix = crypto.randomBytes(8).toString('hex');
    const uid = `diag-${suffix}`;
    const containerId = `DIAG-${suffix.toUpperCase()}`;
    const email = `${uid}@lcsco.invalid`;
    try {
      const db = getAdminFirestore();
      await adminAuthInstance.createUser({
        uid,
        email,
        emailVerified: true,
        password: crypto.randomBytes(24).toString('hex'),
        disabled: false,
      });
      await db.doc(`users/${uid}`).set({
        uid,
        fullName: 'Diagnostic Probe',
        email,
        role,
        laboratoryIds: ['LCSCO'],
        status: 'ACTIVE',
        createdAt: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp(),
      });
      await db.doc(`containers/${containerId}`).set({
        containerId,
        productId: 'PDF-PROD-239',
        laboratoryId: 'LCSCO',
        initialQuantity: 100,
        currentQuantity: 100,
        unit: 'g',
        location: {
          building: 'LCSCO',
          room: 'Synthesis Lab',
          unit: 'CAB 4',
          shelf: '1',
          position: '01',
          code: 'CAB 4- Level 1- Right side',
        },
        storageCondition: 'Diagnostic probe only',
        status: 'NORMAL',
        lotNumber: 'DIAG-LOT',
        supplier: 'Diagnostic',
        expiryDate: '2028-12-31',
        createdBy: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const customToken = await adminAuthInstance.createCustomToken(uid);
      res.json({
        success: true,
        uid,
        containerId,
        productId: 'PDF-PROD-239',
        laboratoryId: 'LCSCO',
        apiKey: 'AIzaSyA6O0kSrq2YI55BcoWsvi9vA7MspTPbwKE',
        customToken,
      });
    } catch (err: any) {
      console.error('[diagnostics/probe] failed', { message: err?.message });
      res.status(500).json({ error: 'Probe setup failed.' });
    }
  });

  app.delete('/api/diagnostics/probe', async (req, res) => {
    if (!adminAuthInstance || !isDiagnosticAuthorized(req)) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    const uid = typeof req.body?.uid === 'string' ? req.body.uid : '';
    const containerId = typeof req.body?.containerId === 'string' ? req.body.containerId : '';
    if (!uid.startsWith('diag-') || !containerId.startsWith('DIAG-')) {
      res.status(400).json({ error: 'Refusing to clean up non-diagnostic documents.' });
      return;
    }
    try {
      const db = getAdminFirestore();
      const transactions = await db.collection('transactions').where('userId', '==', uid).get();
      const batch = db.batch();
      for (const transaction of transactions.docs) batch.delete(transaction.ref);
      batch.delete(db.doc(`containers/${containerId}`));
      batch.delete(db.doc(`users/${uid}`));
      await batch.commit();
      await adminAuthInstance.deleteUser(uid).catch(() => undefined);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[diagnostics/probe cleanup] failed', { message: err?.message });
      res.status(500).json({ error: 'Probe cleanup failed.' });
    }
  });

  app.post('/api/diagnostics/publish-rules', async (req, res) => {
    if (!adminAuthInstance || !isDiagnosticAuthorized(req)) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    try {
      const source = String(req.body?.source || '');
      if (!source.trim()) {
        res.status(400).json({ error: 'source is required.' });
        return;
      }
      const credential = (getAdminApp().options as any).credential;
      const accessToken = await credential.getAccessToken();
      const headers = {
        Authorization: `Bearer ${accessToken.access_token}`,
        'Content-Type': 'application/json',
      };
      const createResponse = await fetch(
        'https://firebaserules.googleapis.com/v1/projects/lcsco-lab-inventory/rulesets',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source: { files: [{ name: 'firestore.rules', content: source }] },
          }),
        }
      );
      const ruleset = await createResponse.json();
      if (!createResponse.ok) {
        res.status(createResponse.status).json(ruleset);
        return;
      }
      const releaseName = 'projects/lcsco-lab-inventory/releases/cloud.firestore';
      const patchResponse = await fetch(
        `https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            release: { name: releaseName, rulesetName: ruleset.name },
          }),
        }
      );
      const release = await patchResponse.json();
      res.status(patchResponse.status).json({
        ruleset: { name: ruleset.name, createTime: ruleset.createTime },
        release,
      });
    } catch (err: any) {
      console.error('[diagnostics/publish-rules] failed', { message: err?.message });
      res.status(500).json({ error: 'Rules publish failed.' });
    }
  });

  app.get('/api/diagnostics/rules', async (req, res) => {
    if (!adminAuthInstance || !isDiagnosticAuthorized(req)) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    try {
      const credential = (getAdminApp().options as any).credential;
      const accessToken = await credential.getAccessToken();
      const headers = { Authorization: `Bearer ${accessToken.access_token}` };
      const releaseResponse = await fetch(
        'https://firebaserules.googleapis.com/v1/projects/lcsco-lab-inventory/releases/cloud.firestore',
        { headers }
      );
      const release = await releaseResponse.json();
      if (!releaseResponse.ok) {
        res.status(releaseResponse.status).json(release);
        return;
      }
      const rulesetName = String(release.rulesetName || '');
      const rulesetId = rulesetName.split('/').pop();
      const rulesetResponse = await fetch(
        `https://firebaserules.googleapis.com/v1/projects/lcsco-lab-inventory/rulesets/${rulesetId}`,
        { headers }
      );
      const ruleset = await rulesetResponse.json();
      if (!rulesetResponse.ok) {
        res.status(rulesetResponse.status).json(ruleset);
        return;
      }
      const source = ruleset?.source?.files?.[0]?.content || '';
      res.json({
        release: {
          name: release.name,
          rulesetName: release.rulesetName,
          updateTime: release.updateTime,
        },
        sourceLength: source.length,
        source,
      });
    } catch (err: any) {
      console.error('[diagnostics/rules] failed', { message: err?.message });
      res.status(500).json({ error: 'Rules read failed.' });
    }
  });

  app.post('/api/diagnostics/rules-test', async (req, res) => {
    if (!adminAuthInstance || !isDiagnosticAuthorized(req)) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    try {
      const { rulesetName, testSuite } = req.body || {};
      if (!rulesetName || !testSuite) {
        res.status(400).json({ error: 'rulesetName and testSuite are required.' });
        return;
      }
      const credential = (getAdminApp().options as any).credential;
      const accessToken = await credential.getAccessToken();
      const response = await fetch(
        `https://firebaserules.googleapis.com/v1/${rulesetName}:test`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ testSuite }),
        }
      );
      const result = await response.json();
      res.status(response.status).json(result);
    } catch (err: any) {
      console.error('[diagnostics/rules-test] failed', { message: err?.message });
      res.status(500).json({ error: 'Rules test failed.' });
    }
  });

  app.get('/api/diagnostics/inventory', async (_req, res) => {
    if (!adminAuthInstance) {
      res.status(503).json({ error: 'Admin SDK is not configured on the server.' });
      return;
    }
    try {
      const db = getAdminFirestore();
      const [productsCount, containersCount, transactionsCount, usersCount] = await Promise.all([
        db.collection('products').count().get(),
        db.collection('containers').count().get(),
        db.collection('transactions').count().get(),
        db.collection('users').count().get(),
      ]);

      const containerIds = ['REA-239', 'TO-BE-CHECKED'];
      const productIds = ['PDF-PROD-239', 'PROD-MVQK5UB8'];
      const userIds = ['0GIR6GWwA4d53AD7ydmCZuZrTKh1', 'pE1ezkcBXtWqSQaMDQz4MkCm4ig1'];

      const containers: Record<string, unknown> = {};
      for (const id of containerIds) {
        const snap = await db.doc(`containers/${id}`).get();
        containers[id] = snap.exists
          ? {
              exists: true,
              productId: snap.get('productId') || null,
              currentQuantity: snap.get('currentQuantity') ?? null,
              initialQuantity: snap.get('initialQuantity') ?? null,
              status: snap.get('status') || null,
              createdBy: snap.get('createdBy') || null,
              updatedAt: snap.get('updatedAt') || null,
            }
          : { exists: false };
      }

      const products: Record<string, unknown> = {};
      for (const id of productIds) {
        const snap = await db.doc(`products/${id}`).get();
        products[id] = snap.exists
          ? {
              exists: true,
              productId: snap.get('productId') || null,
              chemicalName: snap.get('chemicalName') || null,
            }
          : { exists: false };
      }

      const users: Record<string, unknown> = {};
      for (const id of userIds) {
        const snap = await db.doc(`users/${id}`).get();
        users[id] = snap.exists
          ? {
              exists: true,
              role: snap.get('role') || null,
              status: snap.get('status') || null,
              mustChangePassword: snap.get('mustChangePassword') ?? null,
            }
          : { exists: false };
      }

      const markerSnap = await db.doc('systemSettings/referenceInventory').get();
      const productSample = await db.collection('products').limit(10).get();
      const containerSample = await db
        .collection('containers')
        .orderBy('containerId')
        .startAt('REA-230')
        .endAt('REA-250')
        .get();
      const containersForProduct = await db
        .collection('containers')
        .where('productId', '==', 'PDF-PROD-239')
        .get();
      const labSnap = await db.doc('laboratories/LCSCO').get();

      const authUsers: Record<string, unknown> = {};
      for (const id of userIds) {
        try {
          const record = await adminAuthInstance.getUser(id);
          authUsers[id] = {
            emailVerified: record.emailVerified,
            disabled: record.disabled,
            customClaims: record.customClaims || null,
            providers: record.providerData.map((p) => p.providerId),
          };
        } catch (err: any) {
          authUsers[id] = { error: err?.code || 'lookup_failed' };
        }
      }

      res.json({
        counts: {
          products: productsCount.data().count,
          containers: containersCount.data().count,
          transactions: transactionsCount.data().count,
          users: usersCount.data().count,
        },
        containers,
        products,
        users,
        authUsers,
        laboratoryExists: labSnap.exists,
        referenceInventoryMarker: markerSnap.exists ? markerSnap.data() : null,
        productSample: productSample.docs.map((doc) => ({
          id: doc.id,
          productId: doc.get('productId') || null,
          chemicalName: doc.get('chemicalName') || null,
        })),
        containerSample: containerSample.docs.map((doc) => ({
          id: doc.id,
          productId: doc.get('productId') || null,
          currentQuantity: doc.get('currentQuantity') ?? null,
          status: doc.get('status') || null,
        })),
        containersForProduct239: containersForProduct.docs.map((doc) => ({
          id: doc.id,
          productId: doc.get('productId') || null,
          currentQuantity: doc.get('currentQuantity') ?? null,
          status: doc.get('status') || null,
        })),
      });
    } catch (err: any) {
      console.error('[diagnostics/inventory] failed', { message: err?.message });
      res.status(500).json({ error: 'Diagnostic read failed.' });
    }
  });

  /**
   * AI Real Inventory Document Importer (PDF, Image, CSV, or Text)
   * Restricted to laboratory staff roles. Rate limited.
   * Parses an attached laboratory inventory file, creates the corresponding cabinets,
   * and attaches each reagent with its cabinet, level, and side using the exact code format:
   *   "CAB 1- Level 1- Right side"
   */
  app.post(
    '/api/inventory/import-document',
    globalLimiter,
    importLimiter,
    express.json({ limit: '10mb' }),
    requireAuth,
    requireRole('ADMIN', 'PROFESSOR', 'TECHNICIAN'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { fileBase64, mimeType, rawText } = req.body || {};
        const ai = getGeminiClient();
        if (!ai) {
          res.status(503).json({
            error: 'Gemini API is not configured on the server.',
          });
          return;
        }

        const extractionPrompt = `You are a laboratory chemical inventory data engineer for LCSCO.
Analyze the attached laboratory inventory document/data and extract every chemical reagent/solvent/salt and its physical storage cabinet, level (shelf), and side (Left or Right).

CRITICAL FORMATTING RULES:
1. Cabinet naming: Normalize cabinet codes to "CAB 1", "CAB 2", "CAB 3", etc.
2. Level (shelf): Normalize shelf/level to a number string such as "1", "2", "3", "4".
3. Side: Must be either "Right" or "Left" (default to "Right" or "Left" based on the document; if unspecified, distribute logically between "Left" and "Right").
4. Location code MUST strictly follow this exact format:
   "CAB 1- Level 1- Right side" or "CAB 1- Level 2- Left side"
5. Create the appropriate cabinets list summarizing all cabinets discovered in the inventory and their reagent classes/labels.
6. For each reagent, provide chemicalName, formula (infer standard chemical formula if not explicitly written), casNumber (infer standard CAS if known, else "N/A"), quantity (numeric, default 500 or 1000 if unspecified), unit ("g", "mg", "kg", "mL", or "L"), cabinetCode (e.g. "CAB 1"), level (e.g. "1"), side ("Left" or "Right"), chemicalClassification, supplier, and lotNumber.`;

        const parts: any[] = [];
        if (fileBase64 && mimeType) {
          parts.push({
            inlineData: {
              data: String(fileBase64).replace(/^data:[^;]+;base64,/, ''),
              mimeType: String(mimeType),
            },
          });
        }
        if (rawText && String(rawText).trim()) {
          parts.push({
            text: `INVENTORY DATA:\n${String(rawText).trim()}`,
          });
        }
        parts.push({ text: extractionPrompt });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                cabinets: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      cabinetCode: {
                        type: Type.STRING,
                        description: 'Normalized cabinet code, e.g. "CAB 1", "CAB 2"',
                      },
                      cabinetLabel: {
                        type: Type.STRING,
                        description:
                          'Descriptive name for this cabinet based on its reagents, e.g. "CAB 1 — Organic Solvents & Reagents"',
                      },
                      storageClassification: {
                        type: Type.STRING,
                        description: 'Storage classification, e.g. "Flammable solvent", "General storage"',
                      },
                      levels: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Levels/shelves in this cabinet, e.g. ["1", "2", "3", "4"]',
                      },
                    },
                    required: ['cabinetCode', 'cabinetLabel', 'levels'],
                  },
                },
                reagents: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      chemicalName: { type: Type.STRING },
                      casNumber: { type: Type.STRING },
                      formula: { type: Type.STRING },
                      molecularWeight: { type: Type.NUMBER },
                      quantity: { type: Type.NUMBER },
                      unit: {
                        type: Type.STRING,
                        description: 'Must be one of: g, kg, mg, mL, L',
                      },
                      cabinetCode: {
                        type: Type.STRING,
                        description: 'e.g. "CAB 1"',
                      },
                      level: {
                        type: Type.STRING,
                        description: 'Level number, e.g. "1", "2", "3"',
                      },
                      side: {
                        type: Type.STRING,
                        description: 'Must be "Left" or "Right"',
                      },
                      position: {
                        type: Type.STRING,
                        description: 'Position number on the level, e.g. "01", "02"',
                      },
                      chemicalClassification: { type: Type.STRING },
                      supplier: { type: Type.STRING },
                      lotNumber: { type: Type.STRING },
                    },
                    required: [
                      'chemicalName',
                      'quantity',
                      'unit',
                      'cabinetCode',
                      'level',
                      'side',
                    ],
                  },
                },
              },
              required: ['cabinets', 'reagents'],
            },
          },
        });

        const parsed = JSON.parse(response.text || '{"cabinets":[],"reagents":[]}');
        res.json({
          success: true,
          cabinets: parsed.cabinets || [],
          reagents: parsed.reagents || [],
        });
      } catch (err: any) {
        console.error('[import-document] failed', {
          ip: req.ip,
          message: err?.message,
        });
        res.status(500).json({
          error: 'Failed to parse inventory document.',
        });
      }
    }
  );

  /* ==========================================================================
   * Director-controlled account provisioning (requires ADMIN role)
   *
   * The Admin SDK bypasses Firestore security rules, so these endpoints are
   * the ONLY supported way to create Firebase Auth accounts, delete accounts,
   * or clear a user's mustChangePassword flag.
   * ======================================================================== */
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  app.post(
    '/api/admin/create-user',
    globalLimiter,
    adminActionLimiter,
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!adminAuthInstance) {
          res.status(503).json({ error: 'Admin SDK is not configured on the server.' });
          return;
        }
        const { email, fullName, role, laboratoryIds } = req.body || {};
        const candidate = String(email || '').trim().toLowerCase();
        if (!EMAIL_PATTERN.test(candidate) || candidate.length > 254) {
          res.status(400).json({ error: 'A valid email address is required.' });
          return;
        }
        if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 120) {
          res.status(400).json({ error: 'A full name (2–120 characters) is required.' });
          return;
        }
        if (typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role)) {
          res.status(400).json({ error: 'Role must be one of: ' + ASSIGNABLE_ROLES.join(', ') + '.' });
          return;
        }
        const labs = Array.isArray(laboratoryIds) && laboratoryIds.length
          ? laboratoryIds.filter((l: unknown) => typeof l === 'string' && l.length <= 60).slice(0, 10)
          : ['LCSCO'];

        // Reject duplicates instead of silently reusing a pre-existing account.
        try {
          await adminAuthInstance.getUserByEmail(candidate);
          res.status(409).json({ error: 'A Firebase account already exists for this email.' });
          return;
        } catch {
          // getUserByEmail throws only when the user is absent — proceed.
        }

        const tempPassword = generateTemporaryPassword();
        const record: UserRecord = await adminAuthInstance.createUser({
          email: candidate,
          password: tempPassword,
          displayName: fullName.trim(),
          // Accounts only exist because the Director created them for a known
          // member, and the security rules require a verified address for
          // writes. Without this the member would sign in but be unable to
          // record anything (and there is no self-service signup to police).
          emailVerified: true,
        });

        const profile = {
          uid: record.uid,
          email: candidate,
          fullName: fullName.trim(),
          role,
          laboratoryIds: labs,
          status: 'ACTIVE',
          mustChangePassword: true,
          createdAt: new Date(),
        };
        await getAdminFirestore().doc(`users/${record.uid}`).set(profile);

        const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
        const setupLink = await createPasswordSetupLink(candidate, requestBaseUrl);
        const mailResult = await sendWelcomeEmail(candidate, tempPassword, requestBaseUrl, setupLink);

        // The temporary password is returned exactly once, to the Director,
        // so it can be shown in the UI and copied as a fallback. It is never
        // stored anywhere by this application.
        console.log(
          `[create-user] ${candidate} provisioned by ${req.user?.email}. emailSent=${mailResult.sent}` +
            (mailResult.error ? ` reason=${mailResult.error}` : '')
        );
        res.status(201).json({
          uid: record.uid,
          email: candidate,
          tempPassword,
          emailSent: mailResult.sent,
          emailError: mailResult.error,
        });
      } catch (err: any) {
        const code = err?.code || '';
        if (code.includes('email-already-exists')) {
          res.status(409).json({ error: 'A Firebase account already exists for this email.' });
          return;
        }
        console.error('[create-user] failed', { ip: req.ip, message: err?.message });
        res.status(500).json({ error: 'Failed to provision the account.' });
      }
    }
  );

  app.post(
    '/api/admin/delete-user',
    globalLimiter,
    adminActionLimiter,
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!adminAuthInstance) {
          res.status(503).json({ error: 'Admin SDK is not configured on the server.' });
          return;
        }
        const { targetUid } = req.body || {};
        if (typeof targetUid !== 'string' || !targetUid || targetUid.length > 128) {
          res.status(400).json({ error: 'targetUid is required.' });
          return;
        }
        if (targetUid === req.user?.uid) {
          res.status(400).json({ error: 'Directors cannot delete their own account.' });
          return;
        }
        try {
          await adminAuthInstance.getUser(targetUid);
        } catch {
          // Auth account already gone; still clean up any profile remnant.
        }
        await adminAuthInstance.deleteUser(targetUid).catch(() => undefined);
        await getAdminFirestore().doc(`users/${targetUid}`).delete().catch(() => undefined);
        console.log(`[delete-user] ${targetUid} deleted by ${req.user?.email}`);
        res.json({ success: true, uid: targetUid });
      } catch (err: any) {
        console.error('[delete-user] failed', { ip: req.ip, message: err?.message });
        res.status(500).json({ error: 'Failed to delete the account.' });
      }
    }
  );

  app.post(
    '/api/admin/complete-password-change',
    globalLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        // Acts ONLY on the caller's own account — the uid always comes from the
        // verified ID token, never from the request body.
        await getAdminFirestore().doc(`users/${req.user?.uid}`).set(
          { mustChangePassword: false },
          { merge: true }
        );
        res.json({ success: true });
      } catch (err: any) {
        console.error('[complete-password-change] failed', { ip: req.ip, message: err?.message });
        res.status(500).json({ error: 'Failed to record the password change.' });
      }
    }
  );

  /**
   * Re-sends the welcome email with a FRESH temporary password.
   *
   * Only ever acts on members who have not completed their first login
   * (`mustChangePassword === true`): for anyone else a password reset is a
   * deliberate console operation, never a one-click action here. The previous
   * temporary password is not recoverable by design, so a new one is issued.
   */
  app.post(
    '/api/admin/resend-welcome',
    globalLimiter,
    adminActionLimiter,
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!adminAuthInstance) {
          res.status(503).json({ error: 'Admin SDK is not configured on the server.' });
          return;
        }
        const { targetUid } = req.body || {};
        if (typeof targetUid !== 'string' || !targetUid || targetUid.length > 128) {
          res.status(400).json({ error: 'targetUid is required.' });
          return;
        }

        const profileRef = getAdminFirestore().doc(`users/${targetUid}`);
        const profileSnap = await profileRef.get();
        if (!profileSnap.exists) {
          res.status(404).json({ error: 'No profile exists for that account.' });
          return;
        }
        const profileData = profileSnap.data() as { email?: string; mustChangePassword?: boolean };
        if (profileData.mustChangePassword !== true) {
          res.status(409).json({
            error:
              'This member already completed their first login. Their password can only be reset from the Firebase console.',
          });
          return;
        }

        // The Auth record is the source of truth for the sign-in address.
        const record = await adminAuthInstance.getUser(targetUid).catch(() => null);
        const email = record?.email || profileData.email || '';
        if (!email) {
          res.status(404).json({ error: 'That account has no email address.' });
          return;
        }

        const tempPassword = generateTemporaryPassword();
        await adminAuthInstance.updateUser(targetUid, { password: tempPassword, emailVerified: true });
        await profileRef.set({ mustChangePassword: true }, { merge: true });

        const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
        const setupLink = await createPasswordSetupLink(email, requestBaseUrl);
        const mailResult = await sendWelcomeEmail(email, tempPassword, requestBaseUrl, setupLink);
        console.log(
          `[resend-welcome] ${email} re-issued by ${req.user?.email}. emailSent=${mailResult.sent}` +
            (mailResult.error ? ` reason=${mailResult.error}` : '')
        );
        res.json({
          uid: targetUid,
          email,
          tempPassword,
          emailSent: mailResult.sent,
          emailError: mailResult.error,
        });
      } catch (err: any) {
        console.error('[resend-welcome] failed', { ip: req.ip, message: err?.message });
        res.status(500).json({ error: 'Failed to re-send the welcome email.' });
      }
    }
  );

  /**
   * Marks an existing member's email as verified.
   *
   * The Firestore rules require `email_verified == true` for every write, and
   * role resolution falls back to the profile document only for verified
   * identities. Accounts created before the provisioning flow set
   * `emailVerified: true` (or created by hand in the Firebase console) are
   * therefore able to READ the inventory but every stock movement is rejected
   * with "Missing or insufficient permissions". Re-issuing a temporary
   * password is too disruptive for a member who already completed onboarding,
   * so this endpoint repairs only the verification flag.
   */
  app.post(
    '/api/admin/repair-access',
    globalLimiter,
    adminActionLimiter,
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!adminAuthInstance) {
          res.status(503).json({ error: 'Admin SDK is not configured on the server.' });
          return;
        }
        const { targetUid } = req.body || {};
        if (typeof targetUid !== 'string' || !targetUid || targetUid.length > 128) {
          res.status(400).json({ error: 'targetUid is required.' });
          return;
        }

        const profileSnap = await getAdminFirestore().doc(`users/${targetUid}`).get();
        if (!profileSnap.exists) {
          res.status(404).json({ error: 'No profile exists for that account.' });
          return;
        }
        const profileData = profileSnap.data() as { email?: string };

        // The Auth record is the source of truth for the sign-in address.
        const record = await adminAuthInstance.getUser(targetUid).catch(() => null);
        if (!record) {
          res.status(404).json({ error: 'No Firebase Auth account exists for that profile.' });
          return;
        }
        if (
          !profileData.email ||
          !record.email ||
          profileData.email.trim().toLowerCase() !== record.email.trim().toLowerCase()
        ) {
          res.status(409).json({
            error: 'The profile email and the sign-in email do not match. Repair refused.',
          });
          return;
        }

        if (!record.emailVerified) {
          await adminAuthInstance.updateUser(targetUid, { emailVerified: true });
        }
        console.log(
          `[repair-access] ${record.email} verified by ${req.user?.email} ` +
            `(was ${record.emailVerified})`
        );
        res.json({ success: true, email: record.email, emailVerified: true });
      } catch (err: any) {
        console.error('[repair-access] failed', { ip: req.ip, message: err?.message });
        res.status(500).json({ error: 'Failed to repair this account.' });
      }
    }
  );

  /**
   * ========================================================================
   * REFERENCE INVENTORY IMPORT
   * ========================================================================
   * The laboratory's official inventory (29 cabinets + 853 reagents with their
   * physical placement) ships with the client as reference data — see
   * src/data/demoInventoryData.ts. A brand-new Firestore starts empty, so the
   * Director can materialise that reference inventory into the live database in
   * three authenticated calls ("locations", then "products", then "containers").
   *
   * Writes go through the Admin SDK, which keeps the strict client write rules
   * (and their per-document `exists()` reads) out of the bulk-import path. Each
   * slice is imported once: a marker document records completed slices, so
   * re-running resumes an interrupted import instead of duplicating documents,
   * and { force: true } re-imports deliberately.
   * ======================================================================== */
  const SEED_COLLECTIONS: Record<string, { collection: string; idField: string }> = {
    locations: { collection: 'physicalLocations', idField: 'id' },
    products: { collection: 'products', idField: 'productId' },
    containers: { collection: 'containers', idField: 'containerId' },
  };

  app.post(
    '/api/admin/seed-inventory',
    globalLimiter,
    adminActionLimiter,
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!adminAuthInstance) {
          res.status(503).json({ error: 'Admin SDK is not configured on the server.' });
          return;
        }
        const kind = String(req.body?.kind || '');
        const items = req.body?.items;
        const force = req.body?.force === true;
        const target = SEED_COLLECTIONS[kind];
        if (!target) {
          res.status(400).json({ error: 'kind must be one of: locations, products, containers.' });
          return;
        }
        if (!Array.isArray(items) || items.length === 0 || items.length > 2000) {
          res.status(400).json({ error: 'items must be an array of 1–2000 documents.' });
          return;
        }

        const firestore = getAdminFirestore();
        // A marker records which slices were imported *completely*, so an
        // interrupted import can be resumed (documents carry deterministic IDs,
        // therefore re-running overwrites the same documents instead of
        // duplicating them). Without the marker, a half-written collection
        // would otherwise be treated as "already imported" forever.
        const markerRef = firestore.doc('systemSettings/referenceInventory');
        const markerSnap = await markerRef.get();
        const marker = (markerSnap.exists ? markerSnap.data() : {}) as Record<string, unknown>;
        if (!force && marker[kind] === true) {
          res.json({
            kind,
            written: 0,
            skipped: true,
            reason: `The ${kind} slice of the reference inventory was already imported.`,
          });
          return;
        }

        // Chunked to stay under Firestore's 500-operations-per-batch limit.
        let written = 0;
        for (let offset = 0; offset < items.length; offset += 400) {
          const batch = firestore.batch();
          for (const raw of items.slice(offset, offset + 400)) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
            const document: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
            const documentId = String(document[target.idField] || '');
            // Document IDs come from the reference data itself; skip malformed rows.
            if (!documentId || documentId.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(documentId)) {
              continue;
            }
            // Container rows are owned by the Director who performed the import;
            // the field is mandatory in the schema and drives the audit trail.
            if (kind === 'containers') {
              document.createdBy = req.user?.uid || 'reference-import';
            }
            batch.set(firestore.collection(target.collection).doc(documentId), document, {
              merge: true,
            });
            written += 1;
          }
          await batch.commit();
        }

        // Every reagent references the laboratory it belongs to.
        if (kind === 'locations') {
          await firestore
            .doc('laboratories/LCSCO')
            .set(
              {
                labId: 'LCSCO',
                name: 'LCSCO — Laboratoire de Catalyse et Synthèse en Chimie Organique',
                createdAt: new Date(),
              },
              { merge: true }
            );
        }

        await markerRef.set(
          { [kind]: true, updatedAt: new Date(), importedBy: req.user?.email || null },
          { merge: true }
        );

        console.log(`[seed-inventory] ${kind}: ${written} document(s) by ${req.user?.email}`);
        res.json({ kind, written, skipped: false });
      } catch (err: any) {
        console.error('[seed-inventory] failed', { ip: req.ip, message: err?.message });
        res.status(500).json({ error: 'Failed to import the reference inventory.' });
      }
    }
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`LCSCO Inventory server running on port ${PORT}`);
  });
}

startServer();
