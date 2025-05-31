// savingNew.js (formerly talkToPython.js)
console.log("savingNew.js opened");
const fs = require('fs').promises;
const http = require('http');
const path = require('path');

// --- Constants ---
const TEMP_DIR = path.join(__dirname, 'temp_data'); // Directory for temporary files
const PORT = 3002; // Node.js server's port

// --- External Master Password Server (Flask) Details ---
const MASTER_PASS_SERVER_HOSTNAME = 'localhost';
const MASTER_PASS_SERVER_PORT = 8080; // <<< ENSURE YOUR FLASK SERVER IS RUNNING ON THIS PORT
const MASTER_PASS_SERVER_AUTH_PATH = '/master-pass'; // Flask route for authentication/search
const MASTER_PASS_SERVER_ADD_PATH = '/add-entry'; // Flask route for adding new entries


/**
 * Ensures the temporary data directory exists.
 */
async function ensureTempDirExists() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log(`Ensured temporary directory exists at: ${TEMP_DIR}`);
  } catch (error) {
    console.error('Error ensuring temporary directory exists:', error);
    throw error;
  }
}

/**
 * Makes an outgoing POST request to the Master Password Server (Flask).
 * @param {object} jsonDataToPost - The JSON data to send in the POST request body.
 * @param {string} flaskPath - The specific Flask route to send the data to (e.g., '/master-pass' or '/add-entry').
 */
async function postToMasterPassServer(jsonDataToPost, flaskPath) {
  const postData = JSON.stringify(jsonDataToPost);

  const options = {
    hostname: MASTER_PASS_SERVER_HOSTNAME,
    port: MASTER_PASS_SERVER_PORT,
    path: flaskPath, // Dynamic path based on operation
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseBody = '';
      console.log(`[Master Pass Server] STATUS (${flaskPath}): ${res.statusCode}`);
      console.log(`[Master Pass Server] HEADERS (${flaskPath}): ${JSON.stringify(res.headers)}`);

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        console.log(`[Master Pass Server] BODY (${flaskPath}): ${responseBody}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: responseBody });
        } else {
          reject(new Error(`Master Pass Server responded with status ${res.statusCode}: ${responseBody}`));
        }
      });
    });

    req.on('error', (e) => {
      console.error(`[Master Pass Server] problem with request to ${flaskPath}: ${e.message}`);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}


// --- HTTP Server (Receives from Chrome Extension) ---
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  console.log(`[Server] Received request: ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => { // Start of the async callback for 'end' event
    console.log(`[Server] Received body for ${req.url}: ${body}`);
    let parsedData;
    try {
      parsedData = JSON.parse(body);
    } catch (e) {
      console.error('[Server] Error parsing request body:', e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Invalid JSON in request body.' }));
      return;
    }

    let flaskResponse;
    let endpointMessage = "Unknown operation";
    let responseToExtension = {};

    try {
      if (req.url === '/log-data') { // Endpoint for authentication/search (from popup)
        if (parsedData.hostname !== undefined && parsedData.password !== undefined) {
          endpointMessage = "Authentication/Search";
          flaskResponse = await postToMasterPassServer(parsedData, MASTER_PASS_SERVER_AUTH_PATH);
          try {
              responseToExtension = JSON.parse(flaskResponse.body);
          } catch (jsonParseError) {
              console.error("[Server] Error parsing Flask server's JSON response for auth/search:", jsonParseError);
              responseToExtension = { status: "error", message: "Error parsing Flask response for auth/search." };
          }
        } else {
          console.error(`[Server] Invalid request body for /log-data. Missing hostname or password.`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Invalid request body for authentication/search.' }));
          return;
        }
      } else if (req.url === '/add-password-entry') { // Endpoint for adding new password (from popup)
          if (parsedData.masterPassword !== undefined && parsedData.appName !== undefined && parsedData.newPassword !== undefined) {
              endpointMessage = "Add Password Entry";
              flaskResponse = await postToMasterPassServer(parsedData, MASTER_PASS_SERVER_ADD_PATH);
              try {
                  responseToExtension = JSON.parse(flaskResponse.body);
              } catch (jsonParseError) {
                  console.error("[Server] Error parsing Flask server's JSON response for add entry:", jsonParseError);
                  responseToExtension = { status: "error", message: "Error parsing Flask response for add entry." };
              }
          } else {
              console.error(`[Server] Invalid request body for /add-password-entry. Missing masterPassword, appName, or newPassword.`);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Invalid request body for adding password.' }));
              return;
          }
      } else if (req.url === '/capture-website-login') { // NEW: Endpoint for capturing website logins (from content.js)
          endpointMessage = "Capture Website Login";
          console.log(`[Server] Successfully received website login data: ${JSON.stringify(parsedData, null, 2)}`);
          // For now, we just acknowledge receipt. No Flask forwarding for this specific data yet.
          responseToExtension = {
              status: "success",
              message: "Website login data received by Node.js server.",
              receivedData: parsedData // Echo back the data for confirmation
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(responseToExtension));
          return; // Crucial to return here to avoid hitting the general error handler below

      } else { // Handle unknown routes
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Not Found' }));
        return;
      }

      // This block is for /log-data and /add-password-entry, which forward to Flask
      console.log(`[Server] Successfully processed ${endpointMessage} request to Master Pass Server. Status: ${flaskResponse.statusCode}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseToExtension));

    } catch (postError) {
      console.error(`[Server] Error processing ${endpointMessage} request:`, postError.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: `Failed to communicate with master server for ${endpointMessage}.`,
        status: 'error',
        error: postError.message
      }));
    }
  }); // <<< This is the closing of req.on('end', async () => { ... });

}); // <<< This is the closing of http.createServer(async (req, res) => { ... });

// Start the server and ensure the temporary directory exists
server.listen(PORT, async () => {
  await ensureTempDirExists();
  console.log(`Node.js server running on http://localhost:${PORT}`);
  console.log(`Waiting for page data from Chrome extension...`);
  console.log(`This server will forward authentication/search data to http://${MASTER_PASS_SERVER_HOSTNAME}:${MASTER_PASS_SERVER_PORT}${MASTER_PASS_SERVER_AUTH_PATH}`);
  console.log(`This server will forward add password data to http://${MASTER_PASS_SERVER_HOSTNAME}:${MASTER_PASS_SERVER_PORT}${MASTER_PASS_SERVER_ADD_PATH}`);
});
