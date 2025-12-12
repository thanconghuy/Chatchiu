#!/usr/bin/env python3
"""
Add user-sidebar-force.css to all user pages
"""

import re
from pathlib import Path

# Configuration
FRONTEND_DIR = Path(__file__).parent / 'frontend'
USER_PAGES = [
    'dashboard.html',
    'shopping.html',
    'statistics.html',
    'history.html',
    'reconciliation-history.html',
    'payment-requests.html',
    'profile.html'
]

def add_force_css(file_path):
    """Add force CSS after user-sidebar.css"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Check if force CSS already added
    if 'user-sidebar-force.css' in content:
        print(f"  [SKIP] Force CSS already present in {file_path.name}")
        return False

    # Add force CSS after user-sidebar.css
    content = re.sub(
        r'(<link rel="stylesheet" href="css/user-sidebar\.css">)',
        r'\1\n    <link rel="stylesheet" href="css/user-sidebar-force.css">',
        content
    )

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  [OK] Added force CSS to {file_path.name}")
        return True
    else:
        print(f"  [ERROR] Could not add force CSS to {file_path.name}")
        return False

def main():
    """Main function"""
    print("=" * 60)
    print("ADD FORCE CSS TO USER PAGES")
    print("=" * 60)
    print()

    updated_count = 0
    skipped_count = 0

    for page in USER_PAGES:
        file_path = FRONTEND_DIR / page

        if not file_path.exists():
            print(f"[ERROR] {page} not found, skipping...")
            skipped_count += 1
            continue

        if add_force_css(file_path):
            updated_count += 1
        else:
            skipped_count += 1

    print()
    print("=" * 60)
    print(f"SUMMARY:")
    print(f"  [SUCCESS] Updated: {updated_count} files")
    print(f"  [SKIP] Skipped: {skipped_count} files")
    print("=" * 60)

if __name__ == '__main__':
    main()
