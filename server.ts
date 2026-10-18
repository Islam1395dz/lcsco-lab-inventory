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
  initializeApp as initializeAdminApp,
  applicationDefault,
  cert,
  type App as AdminApp,
  type Auth as AdminAuth,
} from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import type { Response, NextFunction, Request } from 'express';
import crypto from 'crypto';
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
 * Mailer (nodemailer SMTP)
 *
 * Used to deliver welcome emails with one-time temporary passwords when the
 * Director provisions a new lab member. Configure via env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
 * ========================================================================== */
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
  } else {
    console.warn(
      '[Mailer] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). ' +
        'Welcome emails will be skipped; the temporary password is returned to the Director instead.'
    );
  }
} catch (err) {
  console.warn('[Mailer] initialization failed:', err instanceof Error ? err.message : err);
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

async function sendWelcomeEmail(to: string, tempPassword: string, requestBaseUrl?: string): Promise<boolean> {
  if (!mailer) return false;
  // Prefer the host the Director is actually using, then APP_URL, so the link
  // keeps working if the service is ever renamed or moved.
  const appUrl =
    (requestBaseUrl && requestBaseUrl.replace(/\/$/, '')) ||
    (process.env.APP_URL || '').split(',')[0]?.trim().replace(/\/$/, '') ||
    'https://lcsco-lab-inventory.onrender.com';
  try {
    await mailer.sendMail({
      from: process.env.MAIL_FROM || 'LCSCO Inventory <no-reply@lcsco.dz>',
      to,
      subject: 'Your LCSCO Inventory account — first login',
      text:
        `Welcome to LCSCO Inventory (Laboratoire de Catalyse et Synthèse en Chimie Organique).\n\n` +
        `Your account has been created by the Laboratory Director.\n\n` +
        `Username (email): ${to}\n` +
        `Temporary password: ${tempPassword}\n\n` +
        `Sign in at: ${appUrl}\n\n` +
        `IMPORTANT — SECURITY: you will be required to choose your own personal\n` +
        `password on your first login. This temporary password stops working as\n` +
        `soon as you complete that first-login change.\n\n` +
        `If you did not expect this email, contact the Laboratory Director.`,
      html:
        `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#1B8A2A;">Welcome to LCSCO Inventory</h2>
          <p>Welcome to the <b>Laboratoire de Catalyse et Synthèse en Chimie Organique</b> chemical inventory system.</p>
          <p>Your account has been created by the Laboratory Director:</p>
          <table style="border-collapse:collapse;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:6px;">
            <tr><td style="padding:8px 14px;font-weight:bold;">Username (email)</td><td style="padding:8px 14px;font-family:monospace;">${to}</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;">Temporary password</td><td style="padding:8px 14px;font-family:monospace;">${tempPassword}</td></tr>
          </table>
          <p style="margin-top:16px;">
            <a href="${appUrl}" style="background:#1B8A2A;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">Sign in to LCSCO Inventory</a>
          </p>
          <p style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;padding:10px 14px;font-size:13px;">
            <b>Security:</b> on your first login you will be required to choose your own personal password. This temporary password stops working as soon as you complete that first-login change.
          </p>
          <p style="font-size:12px;color:#64748B;">If you did not expect this email, contact the Laboratory Director.</p>
        </div>`,
    });
    return true;
  } catch (err) {
    console.warn('[Mailer] send failed:', err instanceof Error ? err.message : err);
    return false;
  }
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
  app.use(express.json({ limit: '100kb' }));

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
      mail: mailer ? 'ready' : 'unavailable',
      origins: (process.env.APP_URL || '').split(',').map((s) => s.trim()).filter(Boolean),
    });
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
        const emailSent = await sendWelcomeEmail(candidate, tempPassword, requestBaseUrl);

        // The temporary password is returned exactly once, to the Director,
        // so it can be shown in the UI and copied as a fallback. It is never
        // stored anywhere by this application.
        console.log(`[create-user] ${candidate} provisioned by ${req.user?.email}. emailSent=${emailSent}`);
        res.status(201).json({
          uid: record.uid,
          email: candidate,
          tempPassword,
          emailSent,
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
