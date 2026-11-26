import { PrismaClient } from '@prisma/client';

// Start the server with PRISMA_QUERY_LOG=1 to print every SQL query
// (used for the backend viva demo). Off by default.
export const prisma = new PrismaClient({
  log: process.env.PRISMA_QUERY_LOG === '1' ? ['query'] : [],
});
