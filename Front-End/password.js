console.log('password.js loaded');

/**
 * Sends page data (hostname and login page detection) to the Node.js server.
 * @param {object} data - An object containing hostname and isLoginPage boolean.
 * @param {string} data.hostname - The hostname of the current page.
 * @param {boolean} data.isLoginPage - True if a password field was detected, false otherwise.
 */
function sendPageDataToServer(data) {
    console.log('sendPageDataToServer called with:', data, 'at', new Date().toLocaleTimeString());
    fetch('http://localhost:3000/log-hostname', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data) // Send the entire data object
    })
    .then(response => {
      console.log('Server responded with status:', response.status, 'at', new Date().toLocaleTimeString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Server response data:', data, 'at', new Date().toLocaleTimeString());
    })
    .catch(error => {
      console.error('Error sending page data to server:', error, 'at', new Date().toLocaleTimeString());
    });
  }
  
  /**
   * Listener for web navigation completion events.
   * This detects when a page has fully loaded and then executes a script
   * to get the hostname and check for password fields.
   */
  chrome.webNavigation.onCompleted.addListener(function(details) {
    console.log('webNavigation.onCompleted event fired:', details, 'at', new Date().toLocaleTimeString());
  
    // Ensure it's the main frame of a valid HTTP/HTTPS page, and not a sub-frame (like an iframe)
    if (details.frameId === 0 && (details.url.startsWith('http://') || details.url.startsWith('https://'))) {
      console.log('Valid navigation for main frame:', details.url, 'at', new Date().toLocaleTimeString());
  
      // Get the tab details to ensure it's still active and available
      chrome.tabs.get(details.tabId, function(tab) {
        if (chrome.runtime.lastError) {
          console.error("Error getting tab in webNavigation.onCompleted:", chrome.runtime.lastError.message, 'at', new Date().toLocaleTimeString());
          return;
        }
  
        // Ensure the tab still exists and has a valid URL
        if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          console.log('Tab retrieved successfully, URL:', tab.url, 'at', new Date().toLocaleTimeString());
  
          // Execute a script in the context of the webpage to get data
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              // The function to inject into the webpage.
              // This function will detect login fields and return data.
              function: () => {
                const hostname = window.location.hostname;
                // Check for the presence of an input field with type="password"
                const hasPasswordField = document.querySelector('input[type="password"]') !== null;
                // You can add more sophisticated login page detection here if needed
                // e.g., checking for specific form actions, common login button texts, etc.
                return { hostname: hostname, isLoginPage: hasPasswordField };
              }
            },
            (results) => {
              if (chrome.runtime.lastError) {
                console.error('Script execution failed in scripting.executeScript:', chrome.runtime.lastError.message, 'at', new Date().toLocaleTimeString());
                return;
              }
              // The result is an array of results from the function, one for each frame.
              // We're interested in the first element's result.
              if (results && results[0] && results[0].result) {
                  const pageData = results[0].result; // This will be { hostname: "...", isLoginPage: true/false }
                  console.log('Page data captured:', pageData, 'at', new Date().toLocaleTimeString());
                  sendPageDataToServer(pageData); // Send the entire object to the server
  
                  if (pageData.isLoginPage) {
                      chrome.action.openPopup();
                  }  
              } else {
                  console.log('Could not capture page data or scripting result was empty/invalid.', 'at', new Date().toLocaleTimeString());
              }
            }
          );
        } else {
          console.log('Tab not valid or URL changed after webNavigation event, skipping scripting.', 'at', new Date().toLocaleTimeString());
        }
      });
    } else {
      console.log('webNavigation event not for main frame or not an http/https URL, skipping:', details.url, 'frameId:', details.frameId, 'at', new Date().toLocaleTimeString());
    }
  });
  
  console.log('Chrome Extension listener active.');