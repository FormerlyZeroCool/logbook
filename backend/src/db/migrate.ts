import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadConfig } from '../config.js';

const { Client } = pg;

async function migrate(): Promise<void> {
  const config = loadConfig();
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationDirectory = path.resolve(process.cwd(), 'migrations');
    const filenames = (await fs.readdir(migrationDirectory))
      .filter((name: string) => name.endsWith('.sql'))
      .sort();

    for (const filename of filenames) {
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [filename]
      );
      if (existing.rowCount) {
        console.log(`skip ${filename}`);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationDirectory, filename), 'utf8');
      console.log(`apply ${filename}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations(filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

migrate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
