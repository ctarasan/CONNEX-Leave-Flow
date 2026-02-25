import 'dotenv/config';
import { checkConnection } from './db.js';

checkConnection()
  .then((ok) => {
    console.log(ok ? '[OK] Database connected.' : '[FAIL] Database check returned false.');
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    console.error('[ERROR]', err.message);
    process.exit(1);
  });
