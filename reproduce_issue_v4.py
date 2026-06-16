import http.server
import socketserver
import threading
import os
import time
from playwright.sync_api import sync_playwright

PORT = 8080

def start_server():
    handler = http.server.SimpleHTTPRequestHandler
    # Allow port reuse
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

# Start server in a thread
daemon_thread = threading.Thread(target=start_server, daemon=True)
daemon_thread.start()
time.sleep(1) # Wait for server to start

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

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

        # Prepare test.html
        with open("Index.html", "r") as f: index_content = f.read()
        with open("Css.html", "r") as f: css_content = f.read()
        with open("Js.html", "r") as f: js_content = f.read()

        final_html = index_content.replace("<?!= include('Css'); ?>", css_content)
        final_html = final_html.replace("<?!= include('Js'); ?>", js_content)

        with open("test.html", "w") as f: f.write(final_html)

        print("Navigating to http://localhost:8080/test.html")
        page.goto(f"http://localhost:{PORT}/test.html")
        page.wait_for_timeout(5000)
        page.screenshot(path="test_result.png")
        browser.close()

if __name__ == "__main__":
    run_verification()
