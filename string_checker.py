import re

def check_strings(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Check for ` (template literals)
    # We need to ignore backticks inside comments or other strings
    # This is hard. Let's just do a simple count first.
    backticks = len(re.findall(r'`', content))
    if backticks % 2 != 0:
        return False, f"Unclosed backtick? Count: {backticks}"

    return True, f"Backtick count: {backticks}"

print(check_strings('Js.html'))
print(check_strings('Code.gs'))
