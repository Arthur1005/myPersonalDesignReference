/* ------------------------------------------------------------------ *
 *  Visitor comments (optional). Leave both empty to keep them off.
 *  Setup steps are in the README under "Visitor comments".
 *  These two values are safe to publish: the database only lets the
 *  public read approved comments and submit new ones for approval.
 * ------------------------------------------------------------------ */
export const SUPABASE_URL = '';        // e.g. 'https://abcdefghijkl.supabase.co'
export const SUPABASE_ANON_KEY = '';   // the project's publishable / anon key

/* ------------------------------------------------------------------ *
 *  Big videos (optional): a Cloudflare R2 bucket. Leave empty to keep
 *  videos in this repo (25 MB limit, with a shrink step).
 *  Setup steps are in the README under "Big videos". These three values
 *  are safe to publish; the upload keys stay in your own browser.
 * ------------------------------------------------------------------ */
export const R2_ACCOUNT_ID = 'f37b6895132d496c5e4e61f0ce854715';   // Cloudflare account ID (32 letters and digits)
export const R2_BUCKET = 'design-orbit';       // bucket name, e.g. 'design-orbit'
export const R2_PUBLIC_URL = 'https://pub-d17162a0f9b842afb541853412f07e91.r2.dev';   // the bucket's public address, e.g. 'https://pub-xxxxxxxx.r2.dev'
