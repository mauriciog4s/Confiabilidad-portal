
from playwright.sync_api import sync_playwright
import os

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # We'll use a file URL to open bundled.html
        path = os.path.abspath("bundled.html")
        page = browser.new_page()

        # Mock google.script.run
        page.add_init_script("""
            window.google = {
                script: {
                    run: {
                        withSuccessHandler: function(callback) {
                            this.successHandler = callback;
                            return this;
                        },
                        withFailureHandler: function(callback) {
                            this.failureHandler = callback;
                            return this;
                        },
                        apiHandler: function(request) {
                            console.log("Mocked apiHandler called with:", request);
                            const { endpoint, payload } = request;
                            if (endpoint === 'getUserContext') {
                                setTimeout(() => {
                                    this.successHandler({
                                        email: 'test@example.com',
                                        role: 'Administrador',
                                        isValidUser: true,
                                        isAdmin: true,
                                        allowedClientIds: ['C1'],
                                        clientNames: {'C1': 'Client 1'},
                                        clientData: {'C1': {nit: '123', razonSocial: 'Client 1'}}
                                    });
                                }, 100);
                            } else if (endpoint === 'getRequests') {
                                setTimeout(() => {
                                    this.successHandler({ data: [], total: 0 });
                                }, 100);
                            } else if (endpoint === 'getMasterData') {
                                setTimeout(() => {
                                    this.successHandler({});
                                }, 100);
                            }
                        }
                    }
                }
            };
        """)

        # Catch console errors
        errors = []
        page.on("pageerror", lambda exc: errors.append(exc))
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        print(f"Navigating to {path}...")
        page.goto(f"file://{path}")

        # Wait for some time to allow React to render
        page.wait_for_timeout(5000)

        page.screenshot(path="debug_screenshot.png")

        if errors:
            print("Errors found:")
            for err in errors:
                print(err)
        else:
            print("No console errors found.")

        browser.close()

if __name__ == "__main__":
    run_verification()
