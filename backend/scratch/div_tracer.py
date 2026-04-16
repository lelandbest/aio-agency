
import sys
import re

def count_tags(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Remove comments to avoid false positives
        content = re.sub(r'{\/\*.*?\*\/}', '', content, flags=re.DOTALL)
        content = re.sub(r'\/\/.*', '', content)
        
        open_tags = content.count('<div ') + content.count('<div>')
        close_tags = content.count('</div>')
        
        print(f"File: {filepath}")
        print(f"Open <div: {open_tags}")
        print(f"Close </div: {close_tags}")
        print(f"Difference: {open_tags - close_tags}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        count_tags(sys.argv[1])
    else:
        print("Usage: python div_tracer.py <file_path>")
