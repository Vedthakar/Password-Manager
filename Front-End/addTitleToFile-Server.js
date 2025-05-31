console.log("talkToPython.js opened");
const fs = require('fs').promises;
const http = require('http');
const path = require('path');

// --- Constants ---
const TEMP_DIR = path.join(__dirname, 'temp_data'); // Directory for temporary files
const PAGES_JSON_PATH = path.join(__dirname, 'pages.json'); // Path to pages.json
const PORT = 3000; // Assuming you're using this port now

// --- External Master Password Server Details ---
const MASTER_PASS_SERVER_HOSTNAME = 'localhost'; // Or '127.0.0.1' or actual IP/domain
const MASTER_PASS_SERVER_PORT = 8080; // <<< IMPORTANT: SET THE PORT OF YOUR MASTER PASSWORD SERVER
const MASTER_PASS_SERVER_PATH = '/master-pass'; // The route on the master password server


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
 * Reads the 'pages.json' file and extracts the first hostname from 'login_titles'.
 * @returns {string|null} The hostname string if found, otherwise null.
 */
async function getLoginHostnameFromPagesJson() {
  try {
    const data = await fs.readFile(PAGES_JSON_PATH, 'utf8');
    const jsonData = JSON.parse(data);

    if (jsonData.login_titles && Array.isArray(jsonData.login_titles) && jsonData.login_titles.length > 0) {
      const hostname = jsonData.login_titles[0];
      console.log(`[pages.json] Found login hostname: ${hostname}`);
      return hostname;
    } else {
      console.log('[pages.json] No login hostname found in pages.json or array is empty.');
      return null;
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[pages.json] File not found at ${PAGES_JSON_PATH}. This is expected if the extension hasn't logged a page yet.`);
    } else {
      console.error(`[pages.json] Error reading or parsing ${PAGES_JSON_PATH}:`, err);
    }
    return null;
  }
}

/**
 * Saves the incoming page data to a new, unique JSON file.
 * Each file will contain only the data from the current request.
 * @param {object} requestData - The parsed JSON data from the incoming request.
 * @returns {string} The full path to the saved temporary file.
 */
async function saveToNewTempFile(requestData) {
  await ensureTempDirExists();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `page_data_${timestamp}.json`;
  const filePath = path.join(TEMP_DIR, fileName);

  try {
    const fileContent = JSON.stringify(requestData, null, 2);
    await fs.writeFile(filePath, fileContent);
    console.log(`Successfully saved data to: ${filePath}`);
    return filePath; // Return the path for potential later use if needed
  } catch (writeErr) {
    console.error(`Error writing to temporary file ${filePath}:`, writeErr);
    throw writeErr; // Re-throw so the calling function knows something went wrong
  }
}

/**
 * Makes an outgoing POST request to the Master Password Server.
 * @param {object} jsonDataToPost - The JSON data to send in the POST request body.
 */
async function postToMasterPassServer(jsonDataToPost) {
  const postData = JSON.stringify(jsonDataToPost);

  const options = {
    hostname: MASTER_PASS_SERVER_HOSTNAME,
    port: MASTER_PASS_SERVER_PORT,
    path: MASTER_PASS_SERVER_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData) // Required for POST requests
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseBody = '';
      console.log(`[Master Pass Server] STATUS: ${res.statusCode}`);
      console.log(`[Master Pass Server] HEADERS: ${JSON.stringify(res.headers)}`);

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        console.log(`[Master Pass Server] BODY: ${responseBody}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: responseBody });
        } else {
          reject(new Error(`Master Pass Server responded with status ${res.statusCode}: ${responseBody}`));
        }
      });
    });

    req.on('error', (e) => {
      console.error(`[Master Pass Server] problem with request: ${e.message}`);
      reject(e);
    });

    // Write data to request body
    req.write(postData);
    req.end();
  });
}


// --- HTTP Server (Receives from Chrome Extension) ---
const server = http.createServer(async (req, res) => {
  // Set CORS headers for the incoming request from your Chrome extension
  res.setHeader('Access-Control-Allow-Origin', '*'); // WARNING: For development only. Restrict in production.
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  console.log(`[Server] Received request: ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/log-data') { // This is the route your Chrome extension POSTs to
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      console.log(`[Server] Received body for /log-data: ${body}`);
      let parsedData;
      try {
        parsedData = JSON.parse(body);
        // Expecting { hostname: "...", isLoginPage: true/false, username?: "...", password?: "..." }
        if (parsedData && parsedData.hostname !== undefined && parsedData.isLoginPage !== undefined) {

          // --- NEW: Read hostname from pages.json and add it to parsedData ---
          const loginHostname = await getLoginHostnameFromPagesJson();
          if (loginHostname) {
            parsedData.loginPageHostname = loginHostname; // Add the hostname to the data being sent
            console.log(`[Server] Appending loginPageHostname: ${loginHostname} to data for Flask.`);
          } else {
            console.log(`[Server] No loginPageHostname found to append.`);
          }
          // --- END NEW ---


          // 1. Save the incoming data to a new temporary file
          await saveToNewTempFile(parsedData); // No need to store filePath, but it's returned if you need it

          // 2. Make the outgoing POST request to the master password server
          try {
            console.log(`Attempting to POST data to ${MASTER_PASS_SERVER_PATH} on ${MASTER_PASS_SERVER_HOSTNAME}:${MASTER_PASS_SERVER_PORT}`);
            const masterPassResponse = await postToMasterPassServer(parsedData); // Sending the *modified parsed data*
            console.log(`[Server] Successfully POSTed to Master Pass Server. Status: ${masterPassResponse.statusCode}`);

            // --- Parse Flask's response to get the 'message' and 'status' ---
            let flaskMessage = "Unknown response from Flask server.";
            let flaskStatus = "error"; // Default status
            try {
                const flaskResponseBody = JSON.parse(masterPassResponse.body);
                flaskMessage = flaskResponseBody.message || flaskMessage;
                flaskStatus = flaskResponseBody.status || flaskStatus; // Get the status from Flask
            } catch (jsonParseError) {
                console.error("[Server] Error parsing Flask server's JSON response:", jsonParseError);
            }
            // --- END Parse Flask's response ---

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              message: flaskMessage,
              status: flaskStatus
            }));
          } catch (postError) {
            console.error('[Server] Error posting to Master Pass Server:', postError.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              message: 'Failed to authenticate with master server.',
              status: 'error',
              error: postError.message
            }));
          }

        } else {
          console.error(`[Server] Invalid request body. Missing hostname or isLoginPage: ${body}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Invalid request body. Missing hostname or isLoginPage.' }));
        }
      } catch (e) {
        console.error('[Server] Error parsing request body:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invalid JSON in request body.' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not Found' }));
  }
});

// Start the server and ensure the temporary directory exists
server.listen(PORT, async () => {
  await ensureTempDirExists(); // Ensure dir exists when server starts
  console.log(`Node.js server running on http://localhost:${PORT}`);
  console.log(`Waiting for page data from Chrome extension...`);
  console.log(`This server will forward data to http://${MASTER_PASS_SERVER_HOSTNAME}:${MASTER_PASS_SERVER_PORT}${MASTER_PASS_SERVER_PATH}`);
});
