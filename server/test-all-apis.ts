/**
 * Comprehensive API Test Suite
 * ทดสอบทุก API endpoints ที่ติดต่อกับ Supabase
 */

const API_URL = 'http://localhost:3002';
let authToken = '';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message?: string;
  error?: string;
}

const results: TestResult[] = [];

function addResult(name: string, status: 'PASS' | 'FAIL' | 'SKIP', message?: string, error?: string) {
  results.push({ name, status, message, error });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} ${name}${message ? ': ' + message : ''}`);
  if (error) console.log(`   Error: ${error}`);
}

async function testAuth() {
  console.log('\n🔐 === Authentication Tests ===\n');
  
  // Test 1: Login with valid credentials
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'chamnan.t@b-connex.net', password: '001' }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      authToken = data.token;
      addResult('Login with valid credentials', 'PASS', `Token received, User: ${data.user?.name}`);
    } else {
      addResult('Login with valid credentials', 'FAIL', 'No token received', JSON.stringify(data));
    }
  } catch (err) {
    addResult('Login with valid credentials', 'FAIL', '', (err as Error).message);
  }
  
  // Test 2: Login with invalid credentials
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'chamnan.t@b-connex.net', password: 'wrong' }),
    });
    const data = await res.json();
    if (res.status === 401) {
      addResult('Login with invalid credentials (should fail)', 'PASS', 'Correctly rejected');
    } else {
      addResult('Login with invalid credentials (should fail)', 'FAIL', 'Should return 401', JSON.stringify(data));
    }
  } catch (err) {
    addResult('Login with invalid credentials (should fail)', 'FAIL', '', (err as Error).message);
  }
}

async function testUsers() {
  console.log('\n👥 === Users API Tests ===\n');
  
  // Test 1: GET all users
  try {
    const res = await fetch(`${API_URL}/api/users`);
    const data = await res.json();
    if (res.ok && Array.isArray(data) && data.length > 0) {
      addResult('GET /api/users', 'PASS', `Retrieved ${data.length} users`);
    } else {
      addResult('GET /api/users', 'FAIL', 'No users returned', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/users', 'FAIL', '', (err as Error).message);
  }
  
  // Test 2: POST new user
  const newUserId = `TEST${Date.now()}`;
  try {
    const res = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newUserId,
        name: 'Test User',
        email: `test${Date.now()}@test.com`,
        password: 'test123',
        role: 'EMPLOYEE',
        gender: 'male',
        department: 'IT',
        joinDate: '2026-01-01',
        quotas: { sick: 30, personal: 7, vacation: 10, ordination: 0, military: 0, maternity: 0, sterilization: 0, paternity: 0 }
      }),
    });
    const data = await res.json();
    if (res.status === 201) {
      addResult('POST /api/users (create new user)', 'PASS', `User ${data.id} created`);
    } else {
      addResult('POST /api/users (create new user)', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('POST /api/users (create new user)', 'FAIL', '', (err as Error).message);
  }
  
  // Test 3: PUT update user
  try {
    const res = await fetch(`${API_URL}/api/users/${newUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department: 'HR' }),
    });
    const data = await res.json();
    if (res.ok && data.department === 'HR') {
      addResult('PUT /api/users/:id (update user)', 'PASS', 'User updated successfully');
    } else {
      addResult('PUT /api/users/:id (update user)', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('PUT /api/users/:id (update user)', 'FAIL', '', (err as Error).message);
  }
  
  // Test 4: DELETE user
  try {
    const res = await fetch(`${API_URL}/api/users/${newUserId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.deleted) {
      addResult('DELETE /api/users/:id', 'PASS', 'User deleted successfully');
    } else {
      addResult('DELETE /api/users/:id', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('DELETE /api/users/:id', 'FAIL', '', (err as Error).message);
  }
}

async function testLeaveTypes() {
  console.log('\n📋 === Leave Types API Tests ===\n');
  
  // Test 1: GET leave types
  try {
    const res = await fetch(`${API_URL}/api/leave-types`);
    const data = await res.json();
    if (res.ok && Array.isArray(data) && data.length > 0) {
      addResult('GET /api/leave-types', 'PASS', `Retrieved ${data.length} leave types`);
    } else {
      addResult('GET /api/leave-types', 'FAIL', 'No leave types returned', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/leave-types', 'FAIL', '', (err as Error).message);
  }
  
  // Test 2: PUT update leave types
  try {
    const res = await fetch(`${API_URL}/api/leave-types`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { id: 'sick', name: 'ลาป่วย', color: '#ef4444', applicable: 'both', isActive: true },
      ]),
    });
    const data = await res.json();
    if (res.ok) {
      addResult('PUT /api/leave-types (update)', 'PASS', 'Leave types updated');
    } else {
      addResult('PUT /api/leave-types (update)', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('PUT /api/leave-types (update)', 'FAIL', '', (err as Error).message);
  }
}

async function testLeaveRequests() {
  console.log('\n📝 === Leave Requests API Tests ===\n');
  
  let createdRequestId = '';
  
  // Test 1: POST create leave request
  try {
    const res = await fetch(`${API_URL}/api/leave-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '001',
        userName: 'Test Leave',
        type: 'sick',
        startDate: '2026-02-12',
        endDate: '2026-02-12',
        reason: 'ทดสอบระบบ',
      }),
    });
    const data = await res.json();
    if (res.status === 201 && data.id) {
      createdRequestId = data.id;
      addResult('POST /api/leave-requests (create)', 'PASS', `Request ${data.id} created`);
    } else {
      addResult('POST /api/leave-requests (create)', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('POST /api/leave-requests (create)', 'FAIL', '', (err as Error).message);
  }
  
  // Test 2: GET all leave requests
  try {
    const res = await fetch(`${API_URL}/api/leave-requests`);
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      addResult('GET /api/leave-requests', 'PASS', `Retrieved ${data.length} requests`);
    } else {
      addResult('GET /api/leave-requests', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/leave-requests', 'FAIL', '', (err as Error).message);
  }
  
  // Test 3: GET leave requests by userId
  try {
    const res = await fetch(`${API_URL}/api/leave-requests?userId=001`);
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      addResult('GET /api/leave-requests?userId=001', 'PASS', `Retrieved ${data.length} requests for user 001`);
    } else {
      addResult('GET /api/leave-requests?userId=001', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/leave-requests?userId=001', 'FAIL', '', (err as Error).message);
  }
  
  // Test 4: PATCH update request status (requires auth)
  if (createdRequestId && authToken) {
    try {
      const res = await fetch(`${API_URL}/api/leave-requests/${createdRequestId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          status: 'APPROVED',
          managerComment: 'อนุมัติ',
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'APPROVED') {
        addResult('PATCH /api/leave-requests/:id/status', 'PASS', 'Status updated to APPROVED');
      } else {
        addResult('PATCH /api/leave-requests/:id/status', 'FAIL', '', JSON.stringify(data));
      }
    } catch (err) {
      addResult('PATCH /api/leave-requests/:id/status', 'FAIL', '', (err as Error).message);
    }
  } else {
    addResult('PATCH /api/leave-requests/:id/status', 'SKIP', 'No request ID or auth token');
  }
}

async function testHolidays() {
  console.log('\n🎉 === Holidays API Tests ===\n');
  
  const testDate = '2026-12-25';
  
  // Test 1: GET holidays
  try {
    const res = await fetch(`${API_URL}/api/holidays`);
    const data = await res.json();
    if (res.ok && typeof data === 'object') {
      addResult('GET /api/holidays', 'PASS', `Retrieved ${Object.keys(data).length} holidays`);
    } else {
      addResult('GET /api/holidays', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/holidays', 'FAIL', '', (err as Error).message);
  }
  
  // Test 2: POST create holiday
  try {
    const res = await fetch(`${API_URL}/api/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: testDate, name: 'วันทดสอบ' }),
    });
    if (res.ok) {
      addResult('POST /api/holidays (create)', 'PASS', `Holiday ${testDate} created`);
    } else {
      const data = await res.json();
      addResult('POST /api/holidays (create)', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('POST /api/holidays (create)', 'FAIL', '', (err as Error).message);
  }
  
  // Test 3: DELETE holiday
  try {
    const res = await fetch(`${API_URL}/api/holidays/${testDate}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.deleted) {
      addResult('DELETE /api/holidays/:date', 'PASS', 'Holiday deleted successfully');
    } else {
      addResult('DELETE /api/holidays/:date', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('DELETE /api/holidays/:date', 'FAIL', '', (err as Error).message);
  }
}

async function testAttendance() {
  console.log('\n⏰ === Attendance API Tests ===\n');
  
  // Test 1: POST record attendance
  try {
    const res = await fetch(`${API_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '001',
        date: '2026-02-17',
        checkIn: '09:00',
        checkOut: '18:00',
      }),
    });
    const data = await res.json();
    if (res.status === 201 || res.status === 200) {
      addResult('POST /api/attendance (record)', 'PASS', 'Attendance recorded');
    } else {
      addResult('POST /api/attendance (record)', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('POST /api/attendance (record)', 'FAIL', '', (err as Error).message);
  }
  
  // Test 2: GET attendance records
  try {
    const res = await fetch(`${API_URL}/api/attendance`);
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      addResult('GET /api/attendance', 'PASS', `Retrieved ${data.length} records`);
    } else {
      addResult('GET /api/attendance', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/attendance', 'FAIL', '', (err as Error).message);
  }
  
  // Test 3: GET attendance by userId
  try {
    const res = await fetch(`${API_URL}/api/attendance?userId=001`);
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      addResult('GET /api/attendance?userId=001', 'PASS', `Retrieved ${data.length} records for user 001`);
    } else {
      addResult('GET /api/attendance?userId=001', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/attendance?userId=001', 'FAIL', '', (err as Error).message);
  }
}

async function testNotifications() {
  console.log('\n🔔 === Notifications API Tests ===\n');
  
  let createdNotifId = '';
  
  // Test 1: POST create notification
  try {
    const res = await fetch(`${API_URL}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '001',
        title: 'ทดสอบ Notification',
        message: 'นี่คือข้อความทดสอบ',
      }),
    });
    const data = await res.json();
    if (res.status === 201 && data.id) {
      createdNotifId = String(data.id);
      addResult('POST /api/notifications (create)', 'PASS', `Notification ${data.id} created`);
    } else {
      addResult('POST /api/notifications (create)', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('POST /api/notifications (create)', 'FAIL', '', (err as Error).message);
  }
  
  // Test 2: GET notifications by userId
  try {
    const res = await fetch(`${API_URL}/api/notifications?userId=001`);
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      addResult('GET /api/notifications?userId=001', 'PASS', `Retrieved ${data.length} notifications`);
    } else {
      addResult('GET /api/notifications?userId=001', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/notifications?userId=001', 'FAIL', '', (err as Error).message);
  }
  
  // Test 3: PATCH mark notification as read
  if (createdNotifId) {
    try {
      const res = await fetch(`${API_URL}/api/notifications/${createdNotifId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '001' }),
      });
      if (res.ok) {
        addResult('PATCH /api/notifications/:id/read', 'PASS', 'Notification marked as read');
      } else {
        const data = await res.json();
        addResult('PATCH /api/notifications/:id/read', 'FAIL', '', JSON.stringify(data));
      }
    } catch (err) {
      addResult('PATCH /api/notifications/:id/read', 'FAIL', '', (err as Error).message);
    }
  } else {
    addResult('PATCH /api/notifications/:id/read', 'SKIP', 'No notification ID');
  }
}

async function testHealthEndpoints() {
  console.log('\n🏥 === Health Check Tests ===\n');
  
  // Test 1: GET /api/health
  try {
    const res = await fetch(`${API_URL}/api/health`);
    const data = await res.json();
    if (res.ok && data.ok === true) {
      addResult('GET /api/health', 'PASS', 'Server is healthy');
    } else {
      addResult('GET /api/health', 'FAIL', 'Unexpected response format', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/health', 'FAIL', '', (err as Error).message);
  }
  
  // Test 2: GET /api/health/db
  try {
    const res = await fetch(`${API_URL}/api/health/db`);
    const data = await res.json();
    if (res.ok && data.ok === true) {
      addResult('GET /api/health/db', 'PASS', 'Database connected');
    } else {
      addResult('GET /api/health/db', 'FAIL', 'Unexpected response format', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/health/db', 'FAIL', '', (err as Error).message);
  }
  
  // Test 3: GET /api/status
  try {
    const res = await fetch(`${API_URL}/api/status`);
    const data = await res.json();
    if (res.ok && data.server && data.database) {
      addResult('GET /api/status', 'PASS', 'Backend and DB status OK');
    } else {
      addResult('GET /api/status', 'FAIL', '', JSON.stringify(data));
    }
  } catch (err) {
    addResult('GET /api/status', 'FAIL', '', (err as Error).message);
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const total = results.length;
  
  console.log(`\nTotal Tests: ${total}`);
  console.log(`✅ Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
  console.log(`⏭️  Skipped: ${skipped} (${((skipped / total) * 100).toFixed(1)}%)`);
  
  if (failed > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ FAILED TESTS:');
    console.log('='.repeat(60));
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`\n${r.name}`);
      if (r.message) console.log(`  Message: ${r.message}`);
      if (r.error) console.log(`  Error: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(failed === 0 ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED');
  console.log('='.repeat(60) + '\n');
}

async function runAllTests() {
  console.log('\n');
  console.log('🚀 Starting Comprehensive API Test Suite');
  console.log('Target: ' + API_URL);
  console.log('Time: ' + new Date().toISOString());
  console.log('='.repeat(60));
  
  await testHealthEndpoints();
  await testAuth();
  await testUsers();
  await testLeaveTypes();
  await testLeaveRequests();
  await testHolidays();
  await testAttendance();
  await testNotifications();
  
  printSummary();
}

runAllTests();
