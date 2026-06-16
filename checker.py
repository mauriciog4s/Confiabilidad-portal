
def check_balance(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Simple brace/paren balancer
    braces = 0
    parens = 0
    brackets = 0
    in_string = False
    string_char = ''
    escaped = False

    for char in content:
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue

        if in_string:
            if char == string_char:
                in_string = False
            continue

        if char in ("'", '"', '`'):
            in_string = True
            string_char = char
            continue

        if char == '{': braces += 1
        elif char == '}': braces -= 1
        elif char == '(': parens += 1
        elif char == ')': parens -= 1
        elif char == '[': brackets += 1
        elif char == ']': brackets -= 1

        if braces < 0 or parens < 0 or brackets < 0:
            return False, f"Negative balance: braces={braces}, parens={parens}, brackets={brackets}"

    return (braces == 0 and parens == 0 and brackets == 0), f"Final balance: braces={braces}, parens={parens}, brackets={brackets}"

print(check_balance('Js.html'))
print(check_balance('Code.gs'))
print(check_balance('config.gs'))
print(check_balance('Index.html'))
print(check_balance('Css.html'))
print(check_balance('bundled.html'))
