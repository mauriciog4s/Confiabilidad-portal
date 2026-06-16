import os
from playwright.sync_api import sync_playwright

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Read files
        with open("Index.html", "r") as f:
            index_content = f.read()
        with open("Css.html", "r") as f:
            css_content = f.read()
        with open("Js.html", "r") as f:
            js_content = f.read()

        # Simulate Apps Script include
        final_html = index_content.replace("<?!= include('Css'); ?>", css_content)
        final_html = final_html.replace("<?!= include('Js'); ?>", js_content)

        with open("temp_index.html", "w") as f:
            f.write(final_html)

        path = os.path.abspath("temp_index.html")
        page = browser.new_page()

        # Mock google.script.run
        page.add_init_script("""
            window.google = {
                script: {
                    run: {
                        withSuccessHandler: function(callback) { this.sh = callback; return this; },
                        withFailureHandler: function(callback) { this.fh = callback; return this; },
                        apiHandler: function(req) {
                            console.log("Mocked apiHandler called:", req.endpoint);
                            if(req.endpoint === 'getUserContext') {
                                setTimeout(() => {
                                    if (this.sh) this.sh({
                                        isValidUser: true,
                                        email: 'test@g4s.com',
                                        role: 'Administrador',
                                        isAdmin: true,
                                        allowedClientIds: [],
                                        clientNames: {},
                                        clientData: {},
                                        userClientConfig: {}
                                    });
                                }, 100);
                            } else if (req.endpoint === 'getRequests') {
                                setTimeout(() => { if (this.sh) this.sh({data: [], total: 0}); }, 100);
                            } else if (req.endpoint === 'getMasterData') {
                                setTimeout(() => { if (this.sh) this.sh({}); }, 100);
                            }
                        }
                    }
                }
            };
        """)

        errors = []
        page.on("pageerror", lambda exc: errors.append(exc))
        page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]: {msg.text}"))

        page.goto(f"file://{path}")
        page.wait_for_timeout(5000)

        page.screenshot(path="temp_screenshot.png")

        if errors:
            print("ERRORS FOUND:")
            for e in errors:
                print(e)
        else:
            print("NO PAGE ERRORS.")

        browser.close()

if __name__ == "__main__":
    run_verification()
