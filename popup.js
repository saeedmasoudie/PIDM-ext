// Check PIDM connection when popup opens
checkPIDMConnection();

async function checkPIDMConnection() {
  const statusElement = document.getElementById('pidmStatus');
  
  try {
    // Try the default port
    const response = await fetch(`http://127.0.0.1:9999/api/download`, {
      method: "GET",
      timeout: 1500
    }).catch(() => null);
    
    if (response && response.ok) {
      statusElement.textContent = 'Connected';
      statusElement.className = 'connected';
    } else {
      statusElement.textContent = 'Not Connected';
      statusElement.className = 'disconnected';
    }
  } catch (error) {
    statusElement.textContent = 'Not Connected';
    statusElement.className = 'disconnected';
  }
}