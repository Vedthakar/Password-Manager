// passwordManagerClient.js
// This file provides functions for the Chrome Extension (popup.js)
// to interact with the Node.js intermediary server (talkToPython.js)
// for various password manager operations.

const NODE_JS_SERVER_BASE_URL = 'http://localhost:3002'; // Your talkToPython.js server

/**
 * Authenticates the master password and optionally performs a search.
 * This function sends data to the '/master-pass' endpoint on Flask via Node.js.
 *
 * @param {string} masterPassword The master password entered by the user.
 * @param {string} hostname The hostname of the current page.
 * @param {string} [username="some_user"] An optional username (placeholder for now).
 * @returns {Promise<object>} A promise that resolves to the Flask server's response.
 */
export async function authenticateAndSearch(masterPassword, hostname, username = "some_user") {
  const dataToSend = {
    hostname: hostname,
    isLoginPage: true, // Assuming this is always true when triggered from popup for search/auth
    username: username,
    password: masterPassword
  };

  try {
    const response = await fetch(`${NODE_JS_SERVER_BASE_URL}/log-data`, { // This is your existing auth endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dataToSend)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! Status: ${response.status}, Body: ${errorText}`);
    }

    return await response.json(); // Returns Flask's response (status, message, password)
  } catch (error) {
    console.error('Error during authentication and search:', error);
    throw error; // Re-throw to be handled by the calling popup.js
  }
}

/**
 * Sends new password entry data to the Flask server for saving.
 * This function will send data to a NEW endpoint on talkToPython.js (e.g., /add-password).
 *
 * @param {string} masterPassword The master password (needed for encryption in Flask).
 * @param {string} appName The application/hostname for which the password is being saved.
 * @param {string} newPassword The password to be saved.
 * @param {string} [username=""] An optional username for the entry.
 * @returns {Promise<object>} A promise that resolves to the Flask server's response.
 */
export async function saveNewPassword(masterPassword, appName, newPassword, username = "") {
  const dataToSend = {
    masterPassword: masterPassword, // Flask will need this to encrypt the new entry
    appName: appName,
    newPassword: newPassword,
    username: username
  };

  try {
    // This will be a NEW endpoint on your Node.js server (talkToPython.js)
    // We will need to create this endpoint in talkToPython.js next.
    const response = await fetch(`${NODE_JS_SERVER_BASE_URL}/add-password-entry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dataToSend)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! Status: ${response.status}, Body: ${errorText}`);
    }

    return await response.json(); // Returns Flask's response after saving
  } catch (error) {
    console.error('Error saving new password:', error);
    throw error;
  }
}

// You can add more functions here for delete, update, etc.
// export async function deletePassword(...) { ... }
