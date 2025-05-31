document.addEventListener('DOMContentLoaded', () => {
  const passDisplayDiv = document.getElementById('Pass'); // This is your div for displaying the password
  const passwordForm = document.getElementById('password-form');
  const masterPassInput = document.getElementById('master-pass');
  const messageDiv = document.getElementById('message'); // For general status messages

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const masterPassword = masterPassInput.value;

    let currentHostname = null;
    let currentIsLoginPage = true; // Assuming the popup implies a login page for now

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        const url = new URL(tabs[0].url);
        currentHostname = url.hostname;
        console.log("Current tab hostname:", currentHostname);
      } else {
        console.warn("Could not get current tab URL.");
      }
    } catch (error) {
      console.error("Error getting current tab hostname:", error);
    }

    const dataToSend = {
      hostname: currentHostname || "unknown.com",
      isLoginPage: currentIsLoginPage,
      username: "some_user", // This is still a placeholder
      password: masterPassword
    };

    try {
      const response = await fetch('http://localhost:3001/log-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      });

      const responseData = await response.json(); // This will contain { message: "...", status: "...", password: "..." }
      console.log("Response from Node.js server:", responseData); // Log for debugging

      if (response.ok) { // Node.js responded with 200 OK
        if (responseData.status === 'success') { // Check the custom 'status' from Flask
          messageDiv.style.color = 'green';
          messageDiv.textContent = responseData.message; // e.g., "Password found for login.linode.com"

          // --- MODIFIED: Display the actual password if found ---
            passDisplayDiv.textContent = `Password: ${responseData.password}`;

          // Optional: Auto-clear messages after a few seconds
          setTimeout(() => {
              messageDiv.textContent = '';
              passDisplayDiv.textContent = '';
          }, 5000); // Clear after 5 seconds, giving time to see the password

        } else { // Authentication failed (status 'failure' from Flask)
          messageDiv.style.color = 'red';
          messageDiv.textContent = responseData.message || 'Authentication failed.';
          passDisplayDiv.textContent = ''; // Clear display div on failure
        }
      } else { // Node.js returned an error status (e.g., 500, 400)
        messageDiv.style.color = 'red';
        messageDiv.textContent = `Error from Node.js server: ${responseData.message || 'Unknown error'}`;
        passDisplayDiv.textContent = '';
      }
    } catch (error) {
      messageDiv.style.color = 'red';
      messageDiv.textContent = 'Could not connect to local server. Is Node.js server running?';
      passDisplayDiv.textContent = '';
      console.error('Failed to connect to local Node.js server:', error);
    }
    masterPassInput.value = ''; // Clear the input field
  });
});
