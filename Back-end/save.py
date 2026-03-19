import json
import os

class Saver:
    def __init__(self, file_name):
        # Get the directory of the current script (save.py)
        # This makes the file path relative to save.py's location,
        # not necessarily where the main script is run from.
        script_dir = os.path.dirname(os.path.abspath(__file__))
        self.file_path = os.path.join(script_dir, file_name)

        # Ensure the directory for the file exists (if you were saving in a subfolder)
        # For a file directly in script_dir, this often isn't strictly necessary,
        # but it's good practice for robustness.
        os.makedirs(script_dir, exist_ok=True)

        # Check if the file exists and initialize it if it doesn't
        if not os.path.exists(self.file_path):
            try:
                with open(self.file_path, "w") as f:
                    json.dump([], f) # Initialize with an empty JSON list
                print(f"Created new empty password file at: {self.file_path}")
            except IOError as e:
                print(f"Error creating file {self.file_path}: {e}")
                # Re-raise the exception if file creation is critical
                raise

    def save(self, data):
        try:
            with open(self.file_path, "w") as file:
                json.dump(data, file, indent=4) # Use indent for readability
            print(f"Saved passwords to: {self.file_path}")
        except IOError as e:
            print(f"Error saving data to {self.file_path}: {e}")

    def read(self):
        try:
            with open(self.file_path, "r") as file:
                # Check if the file is empty before attempting to load JSON
                # Using os.stat().st_size is good, but file.read() already handles it.
                # Just check if the content is empty.
                content = file.read().strip()
                if not content:
                    return [] # Return empty list if file is empty
                return json.loads(content)
        except FileNotFoundError:
            # This case should ideally be handled by the __init__ creating the file.
            # But as a fallback, if for some reason it's missing, return empty.
            print(f"Warning: File not found during read, but should have been created: {self.file_path}. Returning empty list.")
            return []
        except json.JSONDecodeError:
            # Handle cases where the file might contain invalid JSON
            print(f"Warning: Invalid JSON in '{self.file_path}'. Starting with empty passwords.")
            return []
        except Exception as e:
            # Catch any other unexpected errors during read
            print(f"An unexpected error occurred while reading {self.file_path}: {e}")
            return []