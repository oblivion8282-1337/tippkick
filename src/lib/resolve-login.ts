import { prisma } from '@/lib/prisma';

/** E-Mail oder Tipper-Name → User (Name case-insensitive, exakt). */
export async function resolveLoginIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return null;
  if (value.includes('@')) {
    return prisma.user.findUnique({ where: { email: value.toLowerCase() } });
  }
  return prisma.user.findFirst({ where: { name: { equals: value, mode: 'insensitive' } } });
}
