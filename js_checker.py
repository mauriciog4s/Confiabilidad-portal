import re

with open('Js.html', 'r') as f:
    content = f.read()

# Extract script content
match = re.search(r'<script type="text/babel">(.*?)</script>', content, re.DOTALL)
if match:
    js_content = match.group(1)
    print("JS length:", len(js_content))

    # Check for unclosed strings
    # This is a bit complex for a simple script, but let's try to find obvious ones.

    # Look for common mistakes:
    # 1. Unclosed brackets (already done by checker.py)
    # 2. Syntax errors like "const const"
    if "const const" in js_content: print("Found 'const const'")
    if "let let" in js_content: print("Found 'let let'")
    if "function function" in js_content: print("Found 'function function'")

    # Look for potentially problematic JSX
    # Check if all components are defined before use (roughly)
    # Actually, Babel handles hoisting for some things, but not for constants.

else:
    print("Script tag not found!")
