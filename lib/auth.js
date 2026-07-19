function setupAuthServer() {
  if (!process.env.DATABASE_URL) {
    throw new Error('REPRO_77436: DATABASE_URL is required while initializing the auth database adapter')
  }

  return { databaseUrl: process.env.DATABASE_URL }
}

export const auth = setupAuthServer()
