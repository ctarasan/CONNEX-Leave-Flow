/**
 * Test Login API
 */

async function testLogin() {
  const API_URL = 'http://localhost:3002';
  
  console.log('🧪 ทดสอบ Login API...\n');
  
  // Test 1: Login with email
  console.log('Test 1: Login ด้วย email = chamnan.t@b-connex.net, password = 001');
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: 'chamnan.t@b-connex.net', 
        password: '001' 
      }),
    });
    
    const data = await res.json();
    
    if (res.ok) {
      console.log('✅ Login สำเร็จ!');
      console.log('User:', data.user);
      console.log('Token:', data.token?.substring(0, 20) + '...');
    } else {
      console.log('❌ Login ล้มเหลว:', data.error);
    }
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', (err as Error).message);
  }
  
  console.log('\n---\n');
  
  // Test 2: Login with wrong password
  console.log('Test 2: Login ด้วย password ผิด');
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: 'chamnan.t@b-connex.net', 
        password: 'wrong' 
      }),
    });
    
    const data = await res.json();
    
    if (res.ok) {
      console.log('⚠️ Login สำเร็จ (ไม่ควรเป็นอย่างนี้!)');
    } else {
      console.log('✅ Login ล้มเหลวตามที่คาดหวัง:', data.error);
    }
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', (err as Error).message);
  }
}

testLogin();
