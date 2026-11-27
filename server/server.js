import app from './app.js';
import { PORT } from './config.js';

app.listen(PORT, () => {
  console.log(`\n  FIXLY is running →  http://localhost:${PORT}\n`);
});
