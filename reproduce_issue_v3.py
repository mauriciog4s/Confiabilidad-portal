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
                            if(req.endpoint === 'getUserContext') {
                                setTimeout(() => {
                                    if (this.sh) this.sh({
                                        isValidUser: true, email: 'test@g4s.com', role: 'Administrador', isAdmin: true,
                                        allowedClientIds: [], clientNames: {}, clientData: {}, userClientConfig: {}
                                    });
                                }, 100);
                            } else {
                                setTimeout(() => { if (this.sh) this.sh({data: [], total: 0}); }, 100);
                            }
                        }
                    }
                }
            };
        """)

        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))
        page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]: {msg.text}"))

        # Try to catch the error and print stack trace from window.onerror
        page.add_init_script("""
            window.onerror = function(message, source, lineno, colno, error) {
                console.log("ONERROR:", message, "at", source, lineno, ":", colno);
                if (error && error.stack) console.log(error.stack);
            };
        """)

        page.goto(f"file://{path}")
        page.wait_for_timeout(5000)
        browser.close()

if __name__ == "__main__":
    run_verification()
