/**
 * Test Leave Request API
 */

async function testLeaveRequest() {
  const API_URL = 'http://localhost:3002';
  
  console.log('🧪 ทดสอบ Leave Request API...\n');
  
  // Test: Create leave request
  console.log('Test: สร้างคำขอลา');
  try {
    const body = {
      userId: '001',
      userName: 'ทดสอบ',
      type: 'sick',
      startDate: '2026-02-13',
      endDate: '2026-02-13',
      reason: 'ป่วย ทดสอบระบบ',
    };
    
    console.log('Request body:', body);
    
    const res = await fetch(`${API_URL}/api/leave-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    console.log('Response status:', res.status);
    const data = await res.json();
    
    if (res.ok) {
      console.log('✅ สร้างคำขอลาสำเร็จ!');
      console.log('Leave Request:', data);
    } else {
      console.log('❌ สร้างคำขอลาล้มเหลว:', data.error);
    }
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', (err as Error).message);
  }
  
  console.log('\n---\n');
  
  // Test: Get all leave requests
  console.log('Test: ดึงรายการคำขอลาทั้งหมด');
  try {
    const res = await fetch(`${API_URL}/api/leave-requests`);
    const data = await res.json();
    
    if (res.ok) {
      console.log('✅ ดึงข้อมูลสำเร็จ!');
      console.log('จำนวนคำขอลาทั้งหมด:', Array.isArray(data) ? data.length : 0);
      if (Array.isArray(data) && data.length > 0) {
        console.log('คำขอลาล่าสุด:', data[0]);
      }
    } else {
      console.log('❌ ดึงข้อมูลล้มเหลว:', data.error);
    }
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', (err as Error).message);
  }
}

testLeaveRequest();
