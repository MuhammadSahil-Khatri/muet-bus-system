import express from 'express';
import path from 'path';
import fs from 'fs';
import { handleApiRequest } from './server/api.ts';

const app = express();
app.disable('x-powered-by');
const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(process.cwd(), 'dist');

// Mount C++ API middleware
app.use((req, res, next) => {
  handleApiRequest(req, res, next);
});

// Serve static frontend files
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MUET Bus Management System running on http://0.0.0.0:${PORT}`);
});
