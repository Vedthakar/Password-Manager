# Assuming encrypt.py and save.py are in the same directory
from encrypt import AES256
from save import Saver
import os
# from cryptography.fernet import Fernet # This import still seems unused, can be removed if not needed

# --- Flask Server Imports ---
from flask import Flask, request, jsonify
import threading
import logging
import json # Ensure json is imported for pretty printing in logs
import requests

# IMPORTANT: Keep Flask logging visible for now to debug issues
log = logging.getLogger('werkzeug')
# log.setLevel(logging.ERROR) # Commented out to see Flask startup messages and request logs

masterPasswordCheck = b'TEMP_STORAGE' # Make sure this matches your actual master password encrypted with itself

saver = Saver("passwords.txt")
passwords = saver.read()
# loggedIn = False # This variable was removed from global for Flask, causing CLI error


# --- Flask Application Setup ---
app = Flask(__name__)
FLASK_PORT = 8080 # This Flask server's port

# --- Node.js Intermediary Server Details (Not directly used for forwarding FROM Flask now) ---
# This is the URL where your Node.js server (talkToPython.js) is listening
# on its /log-data route.
NODE_JS_SERVER_URL = "http://localhost:3001/log-data" # Kept for reference but Flask won't forward to it anymore


@app.route('/master-pass', methods=['POST'])
def receive_master_pass_json():
    """
    This route receives POST requests with JSON data from the Node.js intermediary.
    It authenticates the password and then performs a search if successful,
    returning the found password or a status.
    """
    if request.is_json:
        received_data = request.get_json()

        print(f"\n--- Flask Server Received JSON Request ---")
        print(f"Path: {request.path}")
        print(f"Method: {request.method}")
        print(f"Headers: {request.headers}")
        print(f"Received JSON Data (Pretty Printed):\n{json.dumps(received_data, indent=4)}") # Pretty print for full contents
        print(f"-----------------------------------------\n")

        # --- 1. Extract necessary data from the received JSON ---
        received_password_str = received_data.get('password')
        # This is the hostname we'll use for the search
        app_name_to_search = received_data.get('hostname')

        if received_password_str is None:
            print("[Authentication] Error: Received JSON is missing the 'password' field.")
            return jsonify({"error": "Missing 'password' field in request data"}), 400

        if app_name_to_search is None:
            print("[Search] Warning: Received JSON is missing 'loginPageHostname'. Cannot perform targeted search.")
            # We can still proceed with authentication, but search will be impacted.
            # You might want to return an error here if a hostname is mandatory for a search.


        # --- 2. Authenticate the received password ---
        try:
            # Create a temporary encrypter with the RECEIVED password.
            # This 'encrypter' instance will be used for both authentication and decryption.
            encrypter = AES256(received_password_str)
            encrypted_check_with_received_password = encrypter.encrypt("textToMatch")

            if encrypted_check_with_received_password == masterPasswordCheck:
                print("[Authentication] SUCCESS: Received password matches the master password!")

                # --- Search Logic for the Hostname ---
                if app_name_to_search:
                    found_password = None
                    for entry in passwords:
                        try:
                            # entry[0] is the encrypted application name
                            decrypted_app_name = encrypter.decrypt(entry[0])
                            # Check if the hostname from JSON is part of the decrypted app name
                            if app_name_to_search in decrypted_app_name:
                                found_password = encrypter.decrypt(entry[1]) # entry[1] is the encrypted password
                                print(f"[Search] Found password for {app_name_to_search}: {found_password}")
                                # Return the found password directly
                                return jsonify({
                                    "status": "success",
                                    "message": f"Password found for {app_name_to_search}",
                                    "password": found_password
                                }), 200
                        except Exception as decrypt_err:
                            print(f"[Search] Error decrypting entry {entry[0]}: {decrypt_err}. Skipping.")
                            # This usually means the master password is wrong or data is corrupted.
                            # Since we just authenticated the master password, it implies data corruption.

                    # If loop finishes and no password was found for the hostname
                    print(f"[Search] No password found for application: {app_name_to_search}")
                    return jsonify({
                        "status": "success", # Authentication was still successful
                        "message": f"No password found for application: {app_name_to_search}",
                        "password": None # Explicitly return null/None for password
                    }), 200
                else:
                    # If no app_name_to_search was provided from the JSON
                    print("[Search] No application name provided to search for.")
                    return jsonify({"status": "success", "message": "Authentication successful, but no application to search for."}), 200


            else:
                print("[Authentication] FAILED: Received password does NOT match the master password.")
                return jsonify({"status": "failure", "message": "Authentication failed: Incorrect master password"}), 401

        except Exception as auth_err:
            print(f"[Authentication] An unexpected error occurred during password check or decryption: {auth_err}")
            return jsonify({"message": "Authentication process failed unexpectedly.", "error": str(auth_err)}), 500

    else:
        # Handling for non-JSON requests (as before)
        print(f"\n--- Flask Server Received Non-JSON Request ---")
        print(f"Path: {request.path}")
        print(f"Method: {request.method}")
        print(f"Headers: {request.headers}")
        print(f"Content-Type: {request.headers.get('Content-Type')}")
        print(f"Request Body: {request.get_data(as_text=True)}")
        print(f"--------------------------------------------\n")
        return jsonify({"error": "Request must be JSON"}), 400

# --- Original Command-Line Application Logic ---
# This part remains the same as your original script
# Note: This will run AFTER the Flask server starts if you choose the threading approach
# or will be the only thing running if you don't start the Flask server in the script.

def run_flask_app():
    """Function to run the Flask app."""
    print(f"Flask server starting on http://localhost:{FLASK_PORT}...")
    app.run(host='0.0.0.0', port=FLASK_PORT, debug=False, use_reloader=False)

if __name__ == '__main__':
    # Add loggedIn back for CLI scope
    loggedIn = False # <<< ADDED THIS LINE BACK FOR CLI

    # Option 1: Run Flask in a separate thread and then start the CLI app
    # This allows both to run concurrently.
    flask_thread = threading.Thread(target=run_flask_app)
    flask_thread.daemon = True # Allows the main program to exit even if the thread is still running
    flask_thread.start()
    import time
    time.sleep(1) # Give Flask a moment to start up

    # The rest of your original command-line application logic
    while True:
        print("\n--- Password Manager CLI ---")
        print("1. Find Password")
        print("2. Add Password")
        print("3. Delete Password")
        print("4. Exit") # Added an exit option

        print("\nChoice: ", end="")
        try:
            choice = int(input())
        except ValueError:
            print("Invalid input. Please enter a number.")
            input("Press Enter to continue...")
            continue

        if choice == 4:
            print("Exiting application.")
            break # Exit the while loop

        if choice < 1 or choice > 3:
            print("Choice needs to be a number from 1-3 (or 4 to Exit).")
            input("Press Enter to continue...")
            continue

        # Master password authentication for CLI (separate from API)
        cli_master_password = None # Initialize to None
        if not loggedIn: # Now 'loggedIn' is defined
            print("Master Password for CLI: ", end="")
            cli_master_password = input()

            try:
                cli_encrypter = AES256(cli_master_password)
                if cli_encrypter.encrypt("textToMatch") != masterPasswordCheck:
                    print("CLI Master Password Incorrect. Please try again.")
                    input("Press Enter to continue...")
                    continue
                else:
                    loggedIn = True # Set CLI as logged in
                    print("CLI Logged in successfully.")
            except Exception as e:
                print(f"Error during CLI master password authentication: {e}")
                input("Press Enter to continue...")
                continue
        else:
            # If already logged in, ensure cli_encrypter is available.
            # This part is tricky if cli_master_password isn't persistently stored.
            # For a simple CLI, you might re-prompt or ensure 'cli_encrypter' is passed around.
            # For now, assuming cli_master_password is set if loggedIn is True.
            # If you want to avoid re-prompting, you'd need to store cli_encrypter globally
            # or pass it. For this fix, I'll make a safe assumption.
            if 'cli_encrypter' not in locals(): # If cli_encrypter wasn't set in this run (e.g., already logged in)
                print("Please re-enter master password for CLI operations:")
                cli_master_password = input()
                try:
                    cli_encrypter = AES256(cli_master_password)
                    if cli_encrypter.encrypt("textToMatch") != masterPasswordCheck:
                        print("CLI Master Password Incorrect. Please try again.")
                        input("Press Enter to continue...")
                        continue
                    else:
                        print("CLI re-authenticated.")
                except Exception as e:
                    print(f"Error during CLI master password re-authentication: {e}")
                    input("Press Enter to continue...")
                    continue


        # Get application name input for CLI operations
        if choice in [1, 2, 3]: # Only ask for app name if not exiting
            print("Application Name: ", end="")
            app_name_input = input()

        if choice == 1: # Find Password (CLI)
            found = False
            for entry in passwords:
                if loggedIn and app_name_input in cli_encrypter.decrypt(entry[0]):
                    print("\n-----------------------------------------")
                    print(f"Application: {cli_encrypter.decrypt(entry[0])}")
                    print(f"Password: {cli_encrypter.decrypt(entry[1])}")
                    found = True
                    break # Found it, so break the loop
            if not found:
                print(f"No entry found for '{app_name_input}'.")
            input("Press Enter to continue...")

        elif choice == 2: # Add Password (CLI)
            print("Password: ", end="")
            password = input()

            if loggedIn: # Ensure user is logged in before adding
                # Use cli_encrypter for CLI operations
                passwords.append([cli_encrypter.encrypt(app_name_input).decode(), cli_encrypter.encrypt(password).decode()])
                saver.save(passwords)
                print(f"Added password for '{app_name_input}'.")
            else:
                print("Please log in first to add passwords.")
            input("Press Enter to continue...")

        elif choice == 3: # Delete Password (CLI)
            deleted = False
            for entry in passwords:
                if loggedIn and app_name_input == cli_encrypter.decrypt(entry[0]):
                    print(f"Are you sure want to delete '{app_name_input}' [y/n]: ", end="")
                    confirm = input()
                    
                    if confirm.lower() == "y":
                        del passwords[passwords.index(entry)]
                        saver.save(passwords)
                        print(f"Deleted '{app_name_input}'.")
                        deleted = True
                    break
            if not deleted:
                print(f"No entry found for '{app_name_input}' to delete.")
            input("Press Enter to continue...")
