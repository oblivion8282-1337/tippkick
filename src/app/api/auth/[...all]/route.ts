import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

// Mountet den better-auth-Handler unter /api/auth/*.
export const { GET, POST } = toNextJsHandler(auth.handler);
