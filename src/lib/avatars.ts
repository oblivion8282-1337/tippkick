import path from 'node:path';

/**
 * SSOT für Avatar-Speicherort + Dateinamen-Regeln.
 * Liegt bewusst NICHT unter public/: Next.js bedient public/ nur mit dem
 * Stand vom Server-Start (Laufzeit-Uploads => 404). Ausgeliefert wird über
 * die Route /avatars/[file], persistent per Volume (AVATAR_DIR überschreibbar).
 */
export const AVATAR_DIR = process.env.AVATAR_DIR ?? path.join(process.cwd(), 'data', 'avatars');

/** <uuid>.<jpeg|png|webp> — kein Pfad-Traversal, keine Sonderzeichen. */
export const avatarFilenameSchema = /^[A-Za-z0-9._-]+\.(jpeg|png|webp)$/;
