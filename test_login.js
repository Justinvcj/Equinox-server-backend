// This script simulates a phone app trying to log in
async function testLogin() {
  try {
    const response = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        phone: "9876543210", 
        role: "rider" 
      })
    });

    const data = await response.json();
    console.log("------------------------------------------------");
    console.log("🎉 SUCCESS! Server Response:");
    console.log(data);
    console.log("------------------------------------------------");
  } catch (error) {
    console.error("❌ ERROR:", error);
  }
}

testLogin();