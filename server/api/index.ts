/**
 * Vercel Serverless entry: ทุก request ถูก rewrite มาที่นี้ แล้วส่งต่อให้ Express app
 * ใช้ dist หลัง build (npm run build)
 */
import app from '../dist/app.js';

export default app;
