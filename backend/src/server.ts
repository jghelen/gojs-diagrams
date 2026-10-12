import { createApp } from './app.ts';
import { createPool } from './database.ts';
import { listDiagrams } from './diagrams/list-diagrams.ts';
import { readDiagram } from './diagrams/read-diagram.ts';

const port = Number(process.env.PORT) || 3000;
const pool = createPool();
// A connection that breaks while nobody is using it must not stop the server.
pool.on('error', (error) => console.error('A database connection was lost:', error.message));

const app = createApp({
  readDiagram: (id) => readDiagram(pool, id),
  listDiagrams: (page) => listDiagrams(pool, page),
});
app.listen(port, () => console.log(`The backend listens on http://localhost:${port}`));
