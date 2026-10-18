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
  initializeApp as initializeAdminApp,
  applicationDefault,
  type App as AdminApp,
  type Auth as AdminAuth,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import type { Response, NextFunction, Request } from 'express';

let adminAuthInstance: AdminAuth | null = null;
try {
  const app: AdminApp = initializeAdminApp({
    credential: applicationDefault(),
  });
  adminAuthInstance = getAdminAuth(app);
} catch (err) {
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
  } catch {
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
function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / curl / mobile app
  const allowed = (process.env.APP_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const clean = origin.replace(/\/$/, '');
  if (allowed.includes(clean)) return true;
  try {
    return new URL(clean).host === new URL(`http://${process.env.HOST || 'localhost'}`).host;
  } catch {
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
    if (req.path.startsWith('/api') && !originAllowed(req.headers.origin)) {
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

  const PORT = Number(process.env.PORT) || 3000;

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'LCSCO Inventory' });
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
