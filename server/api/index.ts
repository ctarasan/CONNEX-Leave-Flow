/**
 * Vercel Serverless entry: ทุก request ถูก rewrite มาที่นี้ แล้วส่งต่อให้ Express app
 * Import จาก source เพื่อให้ TypeScript มี types; Vercel จะ bundle ให้เอง
 */
import app from '../src/app.js';

export default app;
