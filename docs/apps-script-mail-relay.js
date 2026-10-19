/**
 * LCSCO Inventory — HTTPS mail relay (Google Apps Script).
 *
 * Why this exists
 * ---------------
 * The app runs on Render's free plan, which blocks outbound SMTP ports
 * (25 / 465 / 587), so nodemailer can never connect. Render does allow
 * outbound HTTPS, and Google Apps Script web apps are reachable over HTTPS.
 * This tiny script therefore turns the laboratory's Gmail account into a
 * transactional mail relay that the Express server can POST to.
 *
 * Deployment
 * ----------
 * 1. script.google.com → New project → paste this file as Code.gs.
 * 2. Replace __SET_SECRET__ with a long random string and keep it private.
 * 3. Deploy → New deployment → Web app:
 *      Execute as:        Me
 *      Who has access:    Anyone
 * 4. Authorise the requested Gmail scope when prompted.
 * 5. Copy the /exec URL and configure the server:
 *      APPS_SCRIPT_MAIL_URL=https://script.google.com/macros/s/.../exec
 *      APPS_SCRIPT_MAIL_SECRET=<the same random string>
 *
 * The shared secret stops anyone who discovers the URL from using the account
 * as an open relay. Requests without it are rejected.
 */

var SECRET = '__SET_SECRET__';

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!body || body.secret !== SECRET) return json({ ok: false, error: 'unauthorized' });
    if (!body.to) return json({ ok: false, error: 'missing recipient' });

    GmailApp.sendEmail(body.to, body.subject || 'LCSCO Inventory', body.text || '', {
      htmlBody: body.html || undefined,
      name: 'LCSCO Inventory',
      replyTo: 'islam.hasnaoui13@gmail.com',
    });

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 300) });
  }
}

function doGet() {
  return json({ ok: true, service: 'lcsco-mail' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
