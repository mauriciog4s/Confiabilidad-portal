import re

def find_import_not_in_string_or_comment(content):
    # Remove single line comments
    content = re.sub(r'//.*', '', content)
    # Remove multi-line comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

    # Find all 'import' not followed by another letter (to avoid 'important')
    matches = re.finditer(r'\bimport\b', content)
    found = False
    for match in matches:
        found = True
        # Check context
        start = max(0, match.start() - 20)
        end = min(len(content), match.end() + 20)
        print(f"Found 'import' at {match.start()}: ...{content[start:end]}...")
    if not found:
        print("No 'import' keyword found outside comments.")

with open('Js.html', 'r') as f:
    find_import_not_in_string_or_comment(f.read())
